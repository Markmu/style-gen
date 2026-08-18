import type { StatusTone } from "@/lib/ui/status-copy";
import { deriveEvidenceFacets, type EvidenceFacet } from "@/lib/evidence-facets";
import { isVisualRecipeV2Success } from "@/lib/visual-recipe";
import type {
  GenerationParams,
  IterationContextSource,
  IterationDetail,
  IterationDisplayStatus,
  IterationListItem,
  StoredVisualRecipe,
  TemplateVariable,
} from "@/types/models";

/**
 * plan-02: `IterationListItem` DTO → 列表条目视图模型（架构 §7.2）。
 * 纯函数模块：状态文案、设置摘要、时间格式与缺失/降级文案 key。
 */

export const ITERATION_STATUS_LABELS: Record<IterationDisplayStatus, string> = {
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export const ITERATION_STATUS_TONES: Record<IterationDisplayStatus, StatusTone> = {
  processing: "accent",
  completed: "success",
  failed: "danger",
};

/** 设置摘要：`{aspectRatio} · {quality}`（架构 §7.2 条目 params 直展示） */
export function buildIterationSettingsSummary(params: GenerationParams): string {
  return `${params.aspectRatio} · ${params.quality}`;
}

const iterationDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** 创建时间展示（确定性 UTC 格式，测试与 SSR 一致） */
export function formatIterationDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${iterationDateFormatter.format(date)} UTC`;
}

export interface IterationListItemModel {
  id: string;
  status: IterationDisplayStatus;
  statusLabel: string;
  statusTone: StatusTone;
  promptSummary: string;
  /** `16:9 · hd` 形式的设置摘要 */
  settingsSummary: string;
  createdAtLabel: string;
  /** completed 且有结果 URL 时才渲染真实预览图 */
  hasResultPreview: boolean;
  resultFileUrl: string | null;
}

export function toIterationListItemModel(item: IterationListItem): IterationListItemModel {
  return {
    id: item.id,
    status: item.status,
    statusLabel: ITERATION_STATUS_LABELS[item.status],
    statusTone: ITERATION_STATUS_TONES[item.status],
    promptSummary: item.promptSummary,
    settingsSummary: buildIterationSettingsSummary(item.params),
    createdAtLabel: formatIterationDate(item.createdAt),
    hasResultPreview: item.status === "completed" && Boolean(item.resultFileUrl),
    resultFileUrl: item.resultFileUrl,
  };
}

/**
 * 缺失/降级文案 key 常量（详情侧 plan-03 复用；文案遵循 PRD 三段式：
 * 发生了什么 / 保留了什么 / 下一步）。
 */
export const ITERATION_DEGRADED_COPY_KEYS = {
  resultPreviewUnavailable: "iteration.resultPreviewUnavailable",
  recipeSnapshotMissing: "iteration.recipeSnapshotMissing",
  recipeSnapshotFallback: "iteration.recipeSnapshotFallback",
  variablesSnapshotMissing: "iteration.variablesSnapshotMissing",
  sourceImageMissing: "iteration.sourceImageMissing",
} as const;

export type IterationDegradedCopyKey =
  (typeof ITERATION_DEGRADED_COPY_KEYS)[keyof typeof ITERATION_DEGRADED_COPY_KEYS];

export interface IterationDegradedCopy {
  key: IterationDegradedCopyKey;
  /** 发生了什么 */
  what: string;
  /** 保留了什么 */
  preserved: string;
  /** 下一步 */
  next: string;
}

export const ITERATION_DEGRADED_COPY: Record<IterationDegradedCopyKey, IterationDegradedCopy> = {
  [ITERATION_DEGRADED_COPY_KEYS.resultPreviewUnavailable]: {
    key: ITERATION_DEGRADED_COPY_KEYS.resultPreviewUnavailable,
    what: "The result preview is unavailable.",
    preserved: "The iteration record, prompt summary, and settings are still readable.",
    next: "Open the iteration later to retry loading the preview.",
  },
  [ITERATION_DEGRADED_COPY_KEYS.recipeSnapshotMissing]: {
    key: ITERATION_DEGRADED_COPY_KEYS.recipeSnapshotMissing,
    what: "The style recipe from this attempt is missing.",
    preserved: "The prompt, settings, and result of this iteration are still readable.",
    next: "Continue from the prompt to rebuild the style context.",
  },
  [ITERATION_DEGRADED_COPY_KEYS.recipeSnapshotFallback]: {
    key: ITERATION_DEGRADED_COPY_KEYS.recipeSnapshotFallback,
    what:
      "This style evidence was reconstructed from the live analysis record (fallback): this earlier record has no frozen snapshot.",
    preserved:
      "The evidence below is still readable and matched to this attempt.",
    next: "Re-freeze the style by continuing this direction after editing.",
  },
  [ITERATION_DEGRADED_COPY_KEYS.variablesSnapshotMissing]: {
    key: ITERATION_DEGRADED_COPY_KEYS.variablesSnapshotMissing,
    what: "The variable values from this attempt are missing.",
    preserved: "The prompt text and settings from this iteration are still preserved.",
    next: "Re-enter the variable values before continuing this direction.",
  },
  [ITERATION_DEGRADED_COPY_KEYS.sourceImageMissing]: {
    key: ITERATION_DEGRADED_COPY_KEYS.sourceImageMissing,
    what: "The reference image for this attempt is missing.",
    preserved: "The extracted style evidence and prompt are still preserved.",
    next: "Upload the reference again if you want to continue this direction.",
  },
};

/** 取降级三段式文案（详情侧复用；key 未知时回退预览缺失文案） */
export function getIterationDegradedCopy(key: string): IterationDegradedCopy {
  return ITERATION_DEGRADED_COPY[key as IterationDegradedCopyKey] ??
    ITERATION_DEGRADED_COPY[ITERATION_DEGRADED_COPY_KEYS.resultPreviewUnavailable];
}

/**
 * plan-03: 详情不变量条目（V2 recipe `styleInvariants` 直展示，纯文本）。
 */
export interface IterationDetailInvariantModel {
  id: string;
  /** 维度 label（与 evidence facet 同一映射） */
  dimensionLabel: string;
  value: string;
}

/**
 * plan-03: `IterationDetail` DTO → 详情面板视图模型（架构 §7.2 / §6.2）。
 * 缺失标记（recipeSource/variablesSource/sourceImageUrl）在此映射为展示开关，
 * 面板只消费模型，不再触碰 DTO。
 */
export interface IterationDetailModel {
  id: string;
  status: IterationDisplayStatus;
  statusLabel: string;
  statusTone: StatusTone;
  /** 提示内容（纯文本渲染，架构 §8.3） */
  prompt: string;
  /** 排除项（纯文本渲染）；空字符串表示未设置 */
  negativePrompt: string;
  hasNegativePrompt: boolean;
  params: GenerationParams;
  settingsSummary: string;
  modelName: string;
  /** 仅 completed 且有结果 URL 时为真（结果图第一视觉焦点） */
  hasResult: boolean;
  resultFileUrl: string | null;
  hasSourceImage: boolean;
  sourceImageUrl: string | null;
  recipeSource: IterationContextSource;
  variablesSource: IterationContextSource;
  /** recipe facets（复用 evidence-facets 既有映射） */
  facets: EvidenceFacet[];
  invariants: IterationDetailInvariantModel[];
  variables: TemplateVariable[];
  errorMessage: string | null;
  createdAtLabel: string;
}

const INVARIANT_DIMENSION_LABELS: Record<string, string> = {
  visualMedium: "Visual medium",
  composition: "Composition",
  camera: "Camera",
  color: "Color",
  lighting: "Lighting",
  formLanguage: "Form language",
  materialTexture: "Material & texture",
  atmosphere: "Atmosphere",
  rendering: "Rendering",
};

function toInvariantModels(recipe: StoredVisualRecipe | null): IterationDetailInvariantModel[] {
  if (!recipe || !isVisualRecipeV2Success(recipe)) return [];
  return recipe.styleInvariants.map((invariant) => ({
    id: invariant.id,
    dimensionLabel:
      INVARIANT_DIMENSION_LABELS[invariant.dimension] ?? invariant.dimension,
    value: invariant.value,
  }));
}

export function toIterationDetailModel(detail: IterationDetail): IterationDetailModel {
  const hasResult = detail.status === "completed" && Boolean(detail.resultFileUrl);
  return {
    id: detail.id,
    status: detail.status,
    statusLabel: ITERATION_STATUS_LABELS[detail.status],
    statusTone: ITERATION_STATUS_TONES[detail.status],
    prompt: detail.promptSnapshot,
    negativePrompt: detail.negativePromptSnapshot,
    hasNegativePrompt: detail.negativePromptSnapshot.length > 0,
    params: detail.params,
    settingsSummary: buildIterationSettingsSummary(detail.params),
    modelName: detail.modelName,
    hasResult,
    resultFileUrl: hasResult ? detail.resultFileUrl : null,
    hasSourceImage: Boolean(detail.sourceImageUrl),
    sourceImageUrl: detail.sourceImageUrl,
    recipeSource: detail.recipeSource,
    variablesSource: detail.variablesSource,
    facets: deriveEvidenceFacets(detail.recipe),
    invariants: toInvariantModels(detail.recipe),
    variables: detail.variables,
    errorMessage: detail.errorMessage,
    createdAtLabel: formatIterationDate(detail.createdAt),
  };
}

/** processing 详情阶段文案（架构 §3.3 DProcessing；无任何生成/重复提交入口） */
export const ITERATION_PROCESSING_COPY = {
  title: "Generation in progress",
  reassurance:
    "The reference image, prompt, variables, and settings are already preserved. It is safe to leave this page — the result will appear here automatically when it is ready.",
} as const;

/** failed 详情失败说明（errorMessage 映射为业务文案，三段式） */
export function getIterationFailureCopy(errorMessage: string | null): {
  title: string;
  reason: string;
  preserved: string;
  next: string;
} {
  return {
    title: "Generation failed",
    reason:
      errorMessage && errorMessage.trim().length > 0
        ? `The generation service reported: ${errorMessage}`
        : "The attempt stopped before an image was produced. The exact reason was not recorded.",
    preserved:
      "The reference, prompt, variables, and settings from this attempt are preserved below.",
    next: "Use the reserved action below to correct and continue this direction.",
  };
}
