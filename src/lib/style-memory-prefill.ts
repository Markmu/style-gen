import type {
  StoredVisualRecipe,
  VisualRecipe,
  VisualRecipeV2Success,
} from "@/types/models";

/**
 * plan-06（架构 §6.3）: 配方 → 保存向导规则四元组的预填映射纯函数。
 *
 * - V2 成功配方：`retainedRules ← styleInvariants[].value`（hard 优先、组内稳定
 *   排序）；`negativeConstraints ← negativeConstraints`；
 *   `enhancementHints ← optionalModifiers[].defaultValue`（过滤空值）；
 *   `styleTokens ← styleFingerprint.tokens`。
 * - V1 旧配方：`retainedRules ← mustKeep`；`styleTokens ← styleTags`；
 *   `enhancementHints ← visualKeywords`；配方无排除约束，由调用方传入该次
 *   保存来源的负面提示文本（流程 A `negativePromptSnapshot` / 流程 B
 *   `negativePromptText`），trim 非空时整体作为一条。
 * - fallback 配方（V2 `extractionStatus=fallback`，无规则结构）、`recipe=null`
 *   或 `recipeSource=missing`：四组全空 + `missing` 全标记，不推测补齐
 *   （PRD 规则 11）。
 * - 各分支结果为空数组的组别加入 `missing`（向导据此显示"本次迭代无 X"）。
 * - 输出按 POST /api/templates 的上限收敛（规则/排除 ≤12 条 × ≤200 字符，
 *   token/增强 ≤16 条 × ≤80 字符），保证预填值可直接随提交体发送。
 */

export type StyleMemoryPrefillMissingGroup =
  | "rules"
  | "constraints"
  | "tokens"
  | "enhancements";

export interface StyleMemoryPrefillInput {
  recipe: StoredVisualRecipe | null;
  recipeSource: "snapshot" | "fallback" | "missing";
  /**
   * V1 配方无排除约束：由调用方传入保存来源的负面提示文本，trim 非空时
   * 整体作为一条排除约束（V2 分支不消费该值）。
   */
  negativePromptText?: string | null;
}

export interface StyleMemoryPrefill {
  /** 预填值（用户可改，随提交体发送） */
  retainedRules: string[];
  /** 预填值（用户可改，随提交体发送） */
  negativeConstraints: string[];
  /** 快照值（只读展示，frontend_computed 随体携带） */
  styleTokens: string[];
  /** 快照值（只读展示，frontend_computed 随体携带） */
  enhancementHints: string[];
  /** 空组标记（向导显示"本次迭代无 X"） */
  missing: StyleMemoryPrefillMissingGroup[];
}

/** POST /api/templates 上限（架构 §7.3 / plan-02 校验口径） */
const MAX_RULE_ITEMS = 12;
const MAX_RULE_LENGTH = 200;
const MAX_TOKEN_ITEMS = 16;
const MAX_TOKEN_LENGTH = 80;

function clampEntries(entries: string[], maxItems: number, maxLength: number): string[] {
  return entries
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function buildMissing(prefill: Omit<StyleMemoryPrefill, "missing">): StyleMemoryPrefillMissingGroup[] {
  const missing: StyleMemoryPrefillMissingGroup[] = [];
  if (prefill.retainedRules.length === 0) missing.push("rules");
  if (prefill.negativeConstraints.length === 0) missing.push("constraints");
  if (prefill.styleTokens.length === 0) missing.push("tokens");
  if (prefill.enhancementHints.length === 0) missing.push("enhancements");
  return missing;
}

function emptyPrefill(): StyleMemoryPrefill {
  return {
    retainedRules: [],
    negativeConstraints: [],
    styleTokens: [],
    enhancementHints: [],
    missing: ["rules", "constraints", "tokens", "enhancements"],
  };
}

function isV2SuccessRecipe(
  recipe: StoredVisualRecipe | null,
): recipe is VisualRecipeV2Success {
  if (recipe === null) return false;
  const version = (recipe as { schemaVersion?: unknown }).schemaVersion;
  return (
    version === 2 &&
    (recipe as { extractionStatus?: unknown }).extractionStatus !== "fallback"
  );
}

/** V1 旧配方无 schemaVersion 字段（判型防御：显式 version 1 也按 V1 处理） */
function isLegacyRecipe(
  recipe: StoredVisualRecipe | null,
): recipe is VisualRecipe {
  if (recipe === null) return false;
  const version = (recipe as { schemaVersion?: unknown }).schemaVersion;
  return version === undefined || version === 1;
}

/** V2：hard 不变量优先（组内保持原序），soft 排在全部 hard 之后 */
function deriveV2Rules(
  invariants: ReadonlyArray<{ kind: "hard" | "soft"; value: string }>,
): string[] {
  const hard = invariants.filter((invariant) => invariant.kind === "hard");
  const soft = invariants.filter((invariant) => invariant.kind === "soft");
  return clampEntries(
    [...hard, ...soft].map((invariant) => invariant.value),
    MAX_RULE_ITEMS,
    MAX_RULE_LENGTH,
  );
}

export function deriveStyleMemoryPrefill(input: StyleMemoryPrefillInput): StyleMemoryPrefill {
  const { recipe, recipeSource, negativePromptText } = input;

  // 缺失来源或 fallback 结构：不推测补齐（PRD 规则 11）
  if (recipeSource === "missing" || recipe === null) {
    return emptyPrefill();
  }

  if (isV2SuccessRecipe(recipe)) {
    const prefill = {
      retainedRules: deriveV2Rules(recipe.styleInvariants),
      negativeConstraints: clampEntries(
        recipe.negativeConstraints,
        MAX_RULE_ITEMS,
        MAX_RULE_LENGTH,
      ),
      styleTokens: clampEntries(
        recipe.styleFingerprint.tokens,
        MAX_TOKEN_ITEMS,
        MAX_TOKEN_LENGTH,
      ),
      enhancementHints: clampEntries(
        recipe.optionalModifiers
          .map((modifier) => modifier.defaultValue)
          .filter((value): value is string => typeof value === "string"),
        MAX_TOKEN_ITEMS,
        MAX_TOKEN_LENGTH,
      ),
    };
    return { ...prefill, missing: buildMissing(prefill) };
  }

  if (isLegacyRecipe(recipe)) {
    const negativeSnapshot = (negativePromptText ?? "").trim();
    const prefill = {
      retainedRules: clampEntries(recipe.mustKeep, MAX_RULE_ITEMS, MAX_RULE_LENGTH),
      negativeConstraints:
        negativeSnapshot.length > 0
          ? clampEntries([negativeSnapshot], MAX_RULE_ITEMS, MAX_RULE_LENGTH)
          : [],
      styleTokens: clampEntries(recipe.styleTags, MAX_TOKEN_ITEMS, MAX_TOKEN_LENGTH),
      enhancementHints: clampEntries(
        recipe.visualKeywords,
        MAX_TOKEN_ITEMS,
        MAX_TOKEN_LENGTH,
      ),
    };
    return { ...prefill, missing: buildMissing(prefill) };
  }

  // V2 fallback（extractionStatus=fallback，无规则结构）
  return emptyPrefill();
}

