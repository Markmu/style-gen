import { isSupportedAspectRatio } from './aspect-ratio';
import { isVisualRecipeV2Success } from '@/lib/visual-recipe';
import type { PromptControlSnapshot, StoredVisualRecipe, TemplateVariable } from '@/types/models';
export interface GenerationRequestBody {
  analysisTaskId: string;
  promptText: string;
  negativePromptText: string;
  params: {
    aspectRatio: string;
    quality: string;
    /** models.json 中的稳定模型 id；缺省时服务端按配置默认模型解析 */
    model?: string;
  };
  /** plan-01（AC-02）: 工作台当前应用的 Style Memory id，可选 */
  sourceTemplateId?: string;
  /** plan-03（ADR-4）: 提交时 Prompt 控制快照，可选；结构/引用校验见 validatePromptControlSnapshot */
  promptControlSnapshot?: unknown;
}

/** 校验请求体 */
export function validateBody(body: unknown): GenerationRequestBody | null {
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;

  if (typeof obj.analysisTaskId !== "string" || !obj.analysisTaskId) return null;
  if (typeof obj.promptText !== "string" || !obj.promptText) return null;
  if (typeof obj.negativePromptText !== "string") return null;

  if (!obj.params || typeof obj.params !== "object") return null;
  const params = obj.params as Record<string, unknown>;
  if (typeof params.aspectRatio !== "string" || !params.aspectRatio) return null;
  // plan-03（架构 §6.3/§7.3）: 画幅必须在共享白名单内（SUPPORTED_ASPECT_RATIOS SSOT）
  if (!isSupportedAspectRatio(params.aspectRatio)) return null;
  if (typeof params.quality !== "string" || !params.quality) return null;

  // model 可选；提供时必须是短横线/字母数字的模型 id（具体存在性由 models.json 解析判定）
  let model: string | undefined;
  if (params.model !== undefined) {
    if (
      typeof params.model !== "string" ||
      params.model.length === 0 ||
      params.model.length > 100 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(params.model)
    ) {
      return null;
    }
    model = params.model;
  }

  // sourceTemplateId 可选；提供时必须是字符串且长度合法
  let sourceTemplateId: string | undefined;
  if (obj.sourceTemplateId !== undefined) {
    if (
      typeof obj.sourceTemplateId !== "string" ||
      obj.sourceTemplateId.length === 0 ||
      obj.sourceTemplateId.length > 26
    ) {
      return null;
    }
    sourceTemplateId = obj.sourceTemplateId;
  }

  // promptControlSnapshot 可选；提供时必须是纯对象（完整校验依赖 Recipe，延后到 analysis 读取后）
  if (
    obj.promptControlSnapshot !== undefined &&
    (typeof obj.promptControlSnapshot !== "object" ||
      obj.promptControlSnapshot === null ||
      Array.isArray(obj.promptControlSnapshot))
  ) {
    return null;
  }

  return {
    analysisTaskId: obj.analysisTaskId,
    promptText: obj.promptText,
    negativePromptText: obj.negativePromptText,
    params: {
      aspectRatio: params.aspectRatio,
      quality: params.quality,
      ...(model !== undefined ? { model } : {}),
    },
    ...(sourceTemplateId !== undefined ? { sourceTemplateId } : {}),
    ...(obj.promptControlSnapshot !== undefined
      ? { promptControlSnapshot: obj.promptControlSnapshot }
      : {}),
  };
}

// ─── plan-03: PromptControlSnapshot 服务端校验（ADR-4 / 架构 §7.3、§8.3） ────

const SNAPSHOT_TRIGGERS: ReadonlySet<string> = new Set([
  "manual",
  "quick_recreate",
]);
const SNAPSHOT_INTENTS: ReadonlySet<string> = new Set([
  "reconstruction",
  "same_style",
]);
const SNAPSHOT_DETAIL_LEVELS: ReadonlySet<string> = new Set([
  "concise",
  "standard",
  "professional",
]);
const SNAPSHOT_EDITOR_MODES: ReadonlySet<string> = new Set([
  "variables",
  "text",
  "structured",
]);
const ADJUSTMENT_ACTIONS: ReadonlySet<string> = new Set([
  "strengthen",
  "relax",
  "replace",
  "disable",
]);
/** 快照上限（架构 §7.3）：≤20 变量、≤10 adjustments、单值 200、customTemplate 6000 */
const SNAPSHOT_MAX_VARIABLES = 20;
const SNAPSHOT_MAX_ADJUSTMENTS = 10;
const SNAPSHOT_MAX_VALUE_LENGTH = 200;
const SNAPSHOT_MAX_CUSTOM_TEMPLATE_LENGTH = 6000;

/**
 * plan-03（ADR-4 / 架构 §7.3、§8.3）: PromptControlSnapshot 结构校验。
 * 不依赖 Recipe：schemaVersion、枚举（trigger/intent/detailLevel/editorMode）、
 * 上限（≤20 变量、≤10 adjustments）、长度（单值 ≤200、customTemplate ≤6000）。
 * 合法返回同引用对象，非法返回 null。
 */
export function validatePromptControlSnapshotShape(
  value: unknown
): PromptControlSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  if (obj.schemaVersion !== 1) return null;
  if (typeof obj.trigger !== "string" || !SNAPSHOT_TRIGGERS.has(obj.trigger))
    return null;
  if (typeof obj.intent !== "string" || !SNAPSHOT_INTENTS.has(obj.intent))
    return null;
  if (
    typeof obj.detailLevel !== "string" ||
    !SNAPSHOT_DETAIL_LEVELS.has(obj.detailLevel)
  )
    return null;
  if (
    typeof obj.editorMode !== "string" ||
    !SNAPSHOT_EDITOR_MODES.has(obj.editorMode)
  )
    return null;
  if (typeof obj.customPromptDirty !== "boolean") return null;

  if (!Array.isArray(obj.enabledInvariantIds)) return null;
  for (const invariantId of obj.enabledInvariantIds) {
    if (typeof invariantId !== "string") return null;
  }
  if (!Array.isArray(obj.enabledModifierNames)) return null;
  for (const modifierName of obj.enabledModifierNames) {
    if (typeof modifierName !== "string") return null;
  }

  if (
    obj.variableValues === null ||
    typeof obj.variableValues !== "object" ||
    Array.isArray(obj.variableValues)
  )
    return null;
  const variableKeys = Object.keys(obj.variableValues as Record<string, unknown>);
  if (variableKeys.length > SNAPSHOT_MAX_VARIABLES) return null;
  for (const key of variableKeys) {
    const variableValue = (obj.variableValues as Record<string, unknown>)[key];
    if (
      typeof variableValue !== "string" ||
      variableValue.length > SNAPSHOT_MAX_VALUE_LENGTH
    ) {
      return null;
    }
  }

  if (
    obj.modifierValues === null ||
    typeof obj.modifierValues !== "object" ||
    Array.isArray(obj.modifierValues)
  )
    return null;
  for (const modifierValue of Object.values(
    obj.modifierValues as Record<string, unknown>
  )) {
    if (
      typeof modifierValue !== "string" ||
      modifierValue.length > SNAPSHOT_MAX_VALUE_LENGTH
    ) {
      return null;
    }
  }

  if (!Array.isArray(obj.adjustments)) return null;
  if (obj.adjustments.length > SNAPSHOT_MAX_ADJUSTMENTS) return null;
  for (const adjustment of obj.adjustments) {
    if (!adjustment || typeof adjustment !== "object") return null;
    const adj = adjustment as Record<string, unknown>;
    if (typeof adj.invariantId !== "string") return null;
    if (typeof adj.action !== "string" || !ADJUSTMENT_ACTIONS.has(adj.action))
      return null;
    if (adj.replacementValue !== undefined) {
      if (
        typeof adj.replacementValue !== "string" ||
        adj.replacementValue.length > SNAPSHOT_MAX_VALUE_LENGTH
      ) {
        return null;
      }
    }
  }

  if (obj.customTemplate !== undefined) {
    if (
      typeof obj.customTemplate !== "string" ||
      obj.customTemplate.length > SNAPSHOT_MAX_CUSTOM_TEMPLATE_LENGTH
    ) {
      return null;
    }
  }

  return value as PromptControlSnapshot;
}

/**
 * plan-03（ADR-4）: PromptControlSnapshot 的 Recipe 引用校验。
 * invariant 引用集合取 V2 `styleInvariants`；变量名集合取 V2 `contentVariables`，
 * 回退 analysisTemplateVariables。快照不参与权限决定（模型事实 SSOT，拒绝伪造引用）。
 * 通过返回 true。
 */
export function validatePromptControlSnapshotReferences(
  snapshot: PromptControlSnapshot,
  recipe: StoredVisualRecipe | null,
  analysisTemplateVariables: TemplateVariable[]
): boolean {
  const v2Recipe = isVisualRecipeV2Success(recipe) ? recipe : null;
  const invariantIds = new Set<string>(
    v2Recipe ? v2Recipe.styleInvariants.map((i) => i.id) : []
  );
  const variableNames = new Set<string>(
    v2Recipe && v2Recipe.contentVariables.length > 0
      ? v2Recipe.contentVariables.map((v) => v.name)
      : analysisTemplateVariables.map((v) => v.name)
  );

  for (const invariantId of snapshot.enabledInvariantIds) {
    if (!invariantIds.has(invariantId)) return false;
  }
  for (const key of Object.keys(snapshot.variableValues)) {
    if (!variableNames.has(key)) return false;
  }
  for (const adjustment of snapshot.adjustments) {
    if (!invariantIds.has(adjustment.invariantId)) return false;
  }
  return true;
}

