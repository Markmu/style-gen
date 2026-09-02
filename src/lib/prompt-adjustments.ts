import type {
  CompiledPromptSegment,
  InvariantAdjustment,
  PromptControlSnapshot,
  VisualRecipeV2Success,
} from "@/types/models";

// ---------------------------------------------------------------------------
// plan-01 §3（架构 §6.2 / ADR-3 / AC-02 / AC-05）：模型事实与用户调整分层的纯函数。
// Recipe / evidence 不可被 adjustment 写回；adjustment 只引用真实 invariantId。
// 全部逻辑确定性、纯内存，无 LLM 二次改写、无外部调用。
// ---------------------------------------------------------------------------

/** replace 替换值 trim 后的最大长度（架构 §7.3 快照校验同口径） */
export const MAX_REPLACEMENT_LENGTH = 200;

/** strengthen / relax 的确定文案语义（架构 §6.2.3） */
const STRENGTHEN_SUFFIX = " (严格保留)";
const RELAX_SUFFIX = " (允许变化但以原规则为参考)";

/**
 * 读取 invariant 在某次 adjustment 后应输出的表达文本；disable 返回 null（从模板移除）。
 * prompt-composer 与自定义全文回退共用同一文案语义，保证两处编译一致。
 */
export function describeInvariantAdjustment(
  invariantValue: string,
  adjustment: InvariantAdjustment,
): string | null {
  if (adjustment.action === "disable") return null;
  if (adjustment.action === "replace") {
    const replacement = adjustment.replacementValue?.trim();
    return replacement ? replacement : invariantValue;
  }
  if (adjustment.action === "strengthen") {
    return `${invariantValue}${STRENGTHEN_SUFFIX}`;
  }
  return `${invariantValue}${RELAX_SUFFIX}`;
}

function adjustmentPhrase(adjustment: InvariantAdjustment): string {
  if (adjustment.action === "replace") {
    return adjustment.replacementValue?.trim() || adjustment.invariantId;
  }
  if (adjustment.action === "strengthen") {
    return `${adjustment.invariantId}${STRENGTHEN_SUFFIX}`;
  }
  return `${adjustment.invariantId}${RELAX_SUFFIX}`;
}

/**
 * 应用一条规则调整：同一 invariant 只保留最新 adjustment（边界场景「同一 invariant 重复
 * adjustment」），未知 invariantId 抛含该 ID 的校验错误，不编译虚假规则。
 */
export function applyInvariantAdjustment(
  recipe: VisualRecipeV2Success,
  adjustments: InvariantAdjustment[],
  next: InvariantAdjustment,
): InvariantAdjustment[] {
  const known = recipe.styleInvariants.some(
    (invariant) => invariant.id === next.invariantId,
  );
  if (!known) {
    throw new Error(`Unknown invariant id: ${next.invariantId}`);
  }

  let record: InvariantAdjustment;
  if (next.action === "replace") {
    const replacement = next.replacementValue?.trim() ?? "";
    if (!replacement) {
      throw new Error(
        `Replace adjustment for ${next.invariantId} requires a non-empty replacement value.`,
      );
    }
    if (replacement.length > MAX_REPLACEMENT_LENGTH) {
      throw new Error(
        `Replace adjustment for ${next.invariantId} exceeds ${MAX_REPLACEMENT_LENGTH} characters.`,
      );
    }
    record = { invariantId: next.invariantId, action: "replace", replacementValue: replacement };
  } else {
    record = { invariantId: next.invariantId, action: next.action };
  }

  const index = adjustments.findIndex(
    (adjustment) => adjustment.invariantId === next.invariantId,
  );
  if (index === -1) {
    return [...adjustments, record];
  }
  const copy = adjustments.slice();
  copy[index] = record;
  return copy;
}

export type KeepChangeSummaryControls = Pick<
  PromptControlSnapshot,
  "enabledInvariantIds" | "variableValues" | "adjustments"
>;

export interface KeepChangeSummary {
  keptInvariantIds: string[];
  changedVariableNames: string[];
}

function normalizeForCompare(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * 「保留 / 改变」摘要（架构 §6.2.5）：保留取已启用且未被 disable 的 invariants（含 soft）；
 * 改变比较 content variables 当前值与默认值（trim、压缩连续空格、忽略大小写）。
 */
export function deriveKeepChangeSummary(
  recipe: VisualRecipeV2Success,
  controls: KeepChangeSummaryControls,
): KeepChangeSummary {
  const enabled = new Set(controls.enabledInvariantIds);
  const disabled = new Set(
    controls.adjustments
      .filter((adjustment) => adjustment.action === "disable")
      .map((adjustment) => adjustment.invariantId),
  );

  const keptInvariantIds = recipe.styleInvariants
    .filter((invariant) => enabled.has(invariant.id) && !disabled.has(invariant.id))
    .map((invariant) => invariant.id);

  const changedVariableNames = recipe.contentVariables
    .filter((variable) => {
      const current = controls.variableValues[variable.name];
      if (current === undefined) return false;
      return normalizeForCompare(current) !== normalizeForCompare(variable.defaultValue);
    })
    .map((variable) => variable.name);

  return { keptInvariantIds, changedVariableNames };
}

export type CustomTextAdjustmentStatus = "applied" | "appended" | "not_found";

export interface CustomTextAdjustmentOutcome {
  text: string;
  status: CustomTextAdjustmentStatus;
}

function findInvariantSegment(
  text: string,
  segments: CompiledPromptSegment[],
  invariantId: string,
): CompiledPromptSegment | undefined {
  return segments.find(
    (segment) =>
      segment.sourceKind === "invariant" &&
      segment.sourceId === invariantId &&
      segment.startIndex >= 0 &&
      segment.endIndex > segment.startIndex &&
      segment.endIndex <= text.length,
  );
}

/** 删除 range 后的确定性清理：收敛悬空逗号与「: ,」残迹，不重排其余文本 */
function cleanupAfterRemoval(value: string): string {
  return value
    .replace(/,\s*,/g, ",")
    .replace(/:\s*,\s*/g, ": ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*$/, "")
    .trim();
}

/**
 * 自定义全文的调整回退算法（架构 §6.2 实现原则 / ADR-3）：
 * 命中 segment range 时局部替换或删除；未命中且非 disable 追加 `Adjustments:` 段；
 * 未命中 disable 只返回「未找到可删除表达」状态，文本保持不变。
 */
export function applyAdjustmentToCustomText(
  text: string,
  segments: CompiledPromptSegment[],
  adjustment: InvariantAdjustment,
): CustomTextAdjustmentOutcome {
  const segment = findInvariantSegment(text, segments, adjustment.invariantId);

  if (segment) {
    if (adjustment.action === "disable") {
      const removed =
        text.slice(0, segment.startIndex) + text.slice(segment.endIndex);
      return { text: cleanupAfterRemoval(removed), status: "applied" };
    }
    const rangeText = text.slice(segment.startIndex, segment.endIndex);
    const replacement = describeInvariantAdjustment(rangeText, adjustment);
    const updated =
      text.slice(0, segment.startIndex) + replacement + text.slice(segment.endIndex);
    return { text: updated, status: "applied" };
  }

  if (adjustment.action === "disable") {
    return { text, status: "not_found" };
  }

  return {
    text: `${text} Adjustments: ${adjustmentPhrase(adjustment)}`,
    status: "appended",
  };
}
