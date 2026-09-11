"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  InvariantAdjustment,
  PromptEditorMode,
  PromptControlSnapshot,
  AnalysisTemplateStatus,
  CreationPace,
  GenerationParams,
  PromptDetailLevel,
  PromptIntent,
  QuickAuthorization,
  QuickGenerationAuthorizationSnapshot,
  StoredVisualRecipe,
  TemplateVariable,
  V2PromptWorkspaceState,
} from "@/types/models";
import { renderPromptTemplate, isVisualRecipeV2Success } from "@/lib/visual-recipe";
import type { WorkspaceSnapshot } from "@/lib/iterations/restore-guard";
import {
  isSupportedAspectRatio,
  type AspectRatioSource,
  type SupportedAspectRatio,
} from "@/lib/generation/aspect-ratio";
import { DEFAULT_IMAGE_GEN_MODEL_ID } from "@/lib/ai/model-config";

/** sessionStorage key */
export const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";

/** 当前持久化数据版本号 */
export const WORKSPACE_STORAGE_VERSION = 5;

/**
 * plan-07（架构 §6.5）：工作台身份条与就绪结论共用的 Memory 身份信息。
 * 由预检确认快照或 `?templateId=` 直入加载路径写入；`移除` 时随
 * currentTemplateId 一并清空，工作区内容保留。
 */
export interface WorkspaceMemoryIdentity {
  id: string;
  name: string;
  verificationStatus: "user_verified" | "pending_verification";
  retainedRuleCount: number;
}

/** plan-07: 恢复通道的防御性校验（损坏条目按缺失处理，不阻塞工作台） */
function sanitizeMemoryIdentity(
  value: unknown,
): WorkspaceMemoryIdentity | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WorkspaceMemoryIdentity>;
  if (
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.name !== "string" ||
    typeof candidate.retainedRuleCount !== "number"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    verificationStatus:
      candidate.verificationStatus === "user_verified"
        ? "user_verified"
        : "pending_verification",
    retainedRuleCount: candidate.retainedRuleCount,
  };
}

/**
 * plan-04（架构 §6.3 / ADR-4）：跨路由传递的迭代恢复载荷。
 * 由 `/workspace/iterations` 详情动作经 sessionStorage 通道写入，
 * 工作台挂载时一次性消费；字段为 `IterationDetail` 的字段子集。
 */
export interface IterationRestorePayload {
  iterationId: string;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  analysisTaskId: string;
  recipe: StoredVisualRecipe | null;
  variables: TemplateVariable[];
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  /** 提交时应用的 Style Memory id（还原工作台 currentTemplateId，AC-02） */
  sourceTemplateId: string | null;
  /** 上一轮结果；failed / processing 为 null */
  resultFileUrl: string | null;
}

// ─── 第 15 期 plan-02（架构 §3.3 / ADR-2）：Workspace v5 创作节奏与快速授权 ────

/** 工作台生成参数（确认 UI、Render Dock 与统一 submit 共用的单一来源） */
export interface WorkspaceGenerationParams {
  /** 唯一画幅白名单成员（plan-01 SSOT；未知值恢复时回退 1:1） */
  aspectRatio: SupportedAspectRatio;
  quality: "standard" | "hd";
  model: string;
}

/** Prompt 两轴控制草稿（plan-04 扩展编辑方式/调整；plan-02 持久化基线） */
export interface WorkspacePromptControls {
  intent: PromptIntent;
  detailLevel: PromptDetailLevel;
}

/** 快速授权清除原因（阻塞/失败/退出后向用户解释；瞬时态，不持久化） */
export const QUICK_AUTHORIZATION_CLEARED_REASONS = {
  analysisFailed:
    "Quick recreate was cleared because the analysis failed. Your reference and edits are preserved; confirm the quick path again or generate manually.",
  exit:
    "You exited quick recreate. Generation settings are editable again and nothing will be submitted automatically.",
  invalidSnapshot:
    "The saved quick recreate confirmation was invalid and has been cleared. Confirm the quick path again to enable automatic generation.",
  blocked: "Quick recreate is currently blocked.",
} as const;

/**
 * 防御性校验快速授权快照（架构 §3.3：armed 必须与合法快照成对）。
 * 损坏/缺字段/字面量不符均返回 null，恢复时按 none 处理。
 */
export function sanitizeQuickGenerationAuthorizationSnapshot(
  value: unknown,
): QuickGenerationAuthorizationSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<QuickGenerationAuthorizationSnapshot>;
  if (candidate.schemaVersion !== 1) return null;
  if (candidate.intent !== "reconstruction") return null;
  if (candidate.detailLevel !== "standard") return null;
  if (candidate.aspectRatioPolicy !== "reference_or_fallback") return null;
  const settings = candidate.generationSettings;
  if (
    !settings ||
    typeof settings !== "object" ||
    typeof settings.quality !== "string" ||
    settings.quality.length === 0 ||
    typeof settings.model !== "string" ||
    settings.model.length === 0
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    intent: "reconstruction",
    detailLevel: "standard",
    aspectRatioPolicy: "reference_or_fallback",
    generationSettings: {
      quality: settings.quality,
      model: settings.model,
    },
  };
}

/** 恢复/迁移时归一化工作台生成参数（未知画幅回退 1:1，缺省模型回退配置默认） */
function sanitizeWorkspaceGenerationParams(
  value: unknown,
): WorkspaceGenerationParams {
  const candidate = (value ?? {}) as Partial<WorkspaceGenerationParams>;
  return {
    aspectRatio:
      typeof candidate.aspectRatio === "string" &&
      isSupportedAspectRatio(candidate.aspectRatio)
        ? candidate.aspectRatio
        : "1:1",
    quality:
      candidate.quality === "hd" || candidate.quality === "standard"
        ? candidate.quality
        : "standard",
    model:
      typeof candidate.model === "string" && candidate.model.length > 0
        ? candidate.model
        : DEFAULT_IMAGE_GEN_MODEL_ID,
  };
}

/** 恢复/迁移时归一化 Prompt 控制草稿（缺省 detail=standard，架构 §6.1） */
function sanitizeWorkspacePromptControls(
  value: unknown,
): WorkspacePromptControls {
  const candidate = (value ?? {}) as Partial<WorkspacePromptControls>;
  const detailLevel: PromptDetailLevel =
    candidate.detailLevel === "concise" ||
    candidate.detailLevel === "professional" ||
    candidate.detailLevel === "standard"
      ? candidate.detailLevel
      : "standard";
  const intent: PromptIntent =
    candidate.intent === "reconstruction" || candidate.intent === "same_style"
      ? candidate.intent
      : "same_style";
  return { intent, detailLevel };
}

/** 持久化状态结构（仅包含需要跨页面恢复的关键数据） */
export interface WorkspacePersistedState {
  version: number;
  expert?: {editorMode:PromptEditorMode;customPromptDirty:boolean;adjustments:InvariantAdjustment[]};
  assetId: string | null;
  referenceImageUrl: string | null;
  analysisTaskId: string | null;
  recipe: StoredVisualRecipe | null;
  promptText: string;
  negativePromptText: string;
  analysisTemplateContent: string | null;
  analysisTemplateVariables: TemplateVariable[];
  analysisTemplateStatus: AnalysisTemplateStatus | null;
  analysisTemplateReason: string | null;
  generationTaskId: string | null;
  v2PromptState: V2PromptWorkspaceState | null;
  /** plan-04: 工作台当前恢复自的 Iteration id（守卫豁免②依据）；缺失视为 null */
  currentIterationId?: string | null;
  /** plan-04: 当前应用的 Style Memory id（生成请求 sourceTemplateId 来源，AC-02） */
  currentTemplateId?: string | null;
  /** plan-04: 恢复携带的上一轮结果 URL（工作台“上一轮结果”展示位） */
  previousResultUrl?: string | null;
  /** plan-04: 工作台当前输出参数快照（守卫豁免③比较字段） */
  restoredParams?: GenerationParams | null;
  /** plan-04: 待工作台挂载消费的一次性恢复载荷（消费后即从通道清除，防重复应用） */
  pendingIterationRestore?: IterationRestorePayload | null;
  /**
   * plan-07: 当前应用的 Style Memory 身份（身份条数据源；v4 字段超集兼容，
   * 版本不 bump——旧快照缺省视为 null）
   */
  memoryIdentity?: WorkspaceMemoryIdentity | null;
  /**
   * plan-02（架构 §7.2 WorkspaceCreativeState v5）: 创作节奏。v4 迁移缺省
   * `analyze_edit`，不从旧 pace/outputMode 推测快速授权。
   */
  creationPace?: CreationPace;
  /** plan-02: 快速复刻一次性授权闩锁（none → armed → consumed） */
  quickAuthorization?: QuickAuthorization;
  /** plan-02: armed 时伴随的确认快照；清除时置 null */
  quickGenerationAuthorizationSnapshot?: QuickGenerationAuthorizationSnapshot | null;
  /** plan-02: Prompt 两轴控制草稿（intent/detailLevel） */
  promptControls?: WorkspacePromptControls;
  /** plan-02: 工作台生成参数（确认 UI 与 Render Dock 共用默认值） */
  generationParams?: WorkspaceGenerationParams;
  /** plan-02: 画幅来源（plan-04 消费展示；user/restore 优先于 reference 推荐） */
  aspectRatioSource?: AspectRatioSource;
  /** plan-02: 当前方向首选结果（plan-05/06 消费；只表示会话偏好） */
  preferredIterationId?: string | null;
}

export type WorkspaceState =
  | "idle"
  | "uploading"
  | "analyzing"
  | "analysis_ready"
  | "generating"
  | "generation_ready"
  | "history_restored";

export interface WorkspaceError {
  message: string;
  stage?: string;
  /** T09 统一错误码 */
  code?: string;
  /** 是否可Retry */
  retryable?: boolean;
}

/** 降级状态 */
export interface DegradationState {
  /** L1: 轮询超过 60s，展示排队提示 */
  analysisQueueing: boolean;
  /** L1: 生成轮询超过 60s，展示排队提示 */
  generationQueueing: boolean;
  /** L2: 生成服务不可用（SERVICE_UNAVAILABLE） */
  generationUnavailable: boolean;
  /** L4: 分析服务不可用（SERVICE_UNAVAILABLE） */
  analysisUnavailable: boolean;
}

export interface WorkspaceContext {
  derivePromptRevision?:number;
  expert: {editorMode:PromptEditorMode;customPromptDirty:boolean;adjustments:InvariantAdjustment[]};
  state: WorkspaceState;
  referenceImageUrl: string | null;
  assetId: string | null;
  analysisTaskId: string | null;
  recipe: StoredVisualRecipe | null;
  promptText: string;
  negativePromptText: string;
  analysisTemplateContent: string | null;
  analysisTemplateVariables: TemplateVariable[];
  analysisTemplateStatus: AnalysisTemplateStatus | null;
  analysisTemplateReason: string | null;
  generationTaskId: string | null;
  resultImageUrl: string | null;
  mimeType: string | null;
  error: WorkspaceError | null;
  degradation: DegradationState;
  isRecipeExpanded: boolean;
  v2PromptState: V2PromptWorkspaceState | null;
  /** plan-04: 工作台当前恢复自的 Iteration id；非恢复态为 null */
  currentIterationId: string | null;
  /** plan-04: 当前应用的 Style Memory id（生成请求 sourceTemplateId 来源） */
  currentTemplateId: string | null;
  /** plan-04: 恢复携带的上一轮结果 URL（“上一轮结果”展示位） */
  previousResultUrl: string | null;
  /** plan-04: 工作台当前输出参数快照（守卫豁免③比较字段） */
  restoredParams: GenerationParams | null;
  /** plan-07: 当前应用的 Style Memory 身份（身份条与就绪结论同源） */
  memoryIdentity: WorkspaceMemoryIdentity | null;
  /** plan-02: 创作节奏（空工作区默认 analyze_edit） */
  creationPace: CreationPace;
  /** plan-02: 快速复刻一次性授权闩锁 */
  quickAuthorization: QuickAuthorization;
  /** plan-02: armed 伴随的确认快照；consumed 后保留用于解释 */
  quickGenerationAuthorizationSnapshot: QuickGenerationAuthorizationSnapshot | null;
  /**
   * plan-02: 授权清除原因（分析失败/生成门阻塞/用户退出/快照无效）；
   * 瞬时提示，不持久化。
   */
  quickAuthorizationClearedReason: string | null;
  /** plan-02: Prompt 两轴控制草稿 */
  promptControls: WorkspacePromptControls;
  /** plan-02: 工作台生成参数（确认 UI、Render Dock 与 submit 共用） */
  generationParams: WorkspaceGenerationParams;
  /** plan-02: 画幅来源（user/restore 优先，plan-04 展示） */
  aspectRatioSource: AspectRatioSource;
  /** plan-02: 当前方向首选结果 id（会话偏好，plan-05/06 消费） */
  preferredIterationId: string | null;
}

interface WorkspaceAnalysisTemplatePayload {
  analysisTemplateContent: string | null;
  analysisTemplateVariables: TemplateVariable[];
  analysisTemplateStatus: AnalysisTemplateStatus | null;
  analysisTemplateReason: string | null;
}

const EMPTY_TEMPLATE_FALLBACK_REASON = "No stable replaceable variables were detected";

function normalizeAnalysisTemplatePayload(
  template: WorkspaceAnalysisTemplatePayload | undefined,
): WorkspaceAnalysisTemplatePayload | undefined {
  if (!template) return undefined;

  const status = template.analysisTemplateStatus;
  const variables = Array.isArray(template.analysisTemplateVariables)
    ? template.analysisTemplateVariables
    : [];
  const hasUsableTemplate =
    (status === "ready" || status === "partial") &&
    !!template.analysisTemplateContent?.trim() &&
    variables.length > 0;

  if (hasUsableTemplate) {
    return { ...template, analysisTemplateVariables: variables };
  }

  if (status === "ready" || status === "partial" || status === "fallback") {
    return {
      analysisTemplateContent: null,
      analysisTemplateVariables: [],
      analysisTemplateStatus: "fallback",
      analysisTemplateReason:
        template.analysisTemplateReason ?? EMPTY_TEMPLATE_FALLBACK_REASON,
    };
  }

  return {
    analysisTemplateContent: null,
    analysisTemplateVariables: [],
    analysisTemplateStatus: null,
    analysisTemplateReason: template.analysisTemplateReason ?? null,
  };
}

const initialDegradation: DegradationState = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

/** plan-02: 工作台生成参数默认值（确认 UI 与 Render Dock 消费的同一默认） */
export const DEFAULT_WORKSPACE_GENERATION_PARAMS: WorkspaceGenerationParams = {
  aspectRatio: "1:1",
  quality: "standard",
  model: DEFAULT_IMAGE_GEN_MODEL_ID,
};

const initialContext: WorkspaceContext = {
  expert: {editorMode:"text",customPromptDirty:false,adjustments:[]},
  state: "idle",
  referenceImageUrl: null,
  assetId: null,
  analysisTaskId: null,
  recipe: null,
  promptText: "",
  negativePromptText: "",
  analysisTemplateContent: null,
  analysisTemplateVariables: [],
  analysisTemplateStatus: null,
  analysisTemplateReason: null,
  generationTaskId: null,
  resultImageUrl: null,
  mimeType: null,
  error: null,
  degradation: initialDegradation,
  isRecipeExpanded: false,
  v2PromptState: null,
  currentIterationId: null,
  currentTemplateId: null,
  previousResultUrl: null,
  restoredParams: null,
  memoryIdentity: null,
  creationPace: "analyze_edit",
  quickAuthorization: "none",
  quickGenerationAuthorizationSnapshot: null,
  quickAuthorizationClearedReason: null,
  promptControls: { intent: "same_style", detailLevel: "standard" },
  generationParams: DEFAULT_WORKSPACE_GENERATION_PARAMS,
  aspectRatioSource: "fallback",
  preferredIterationId: null,
};

export function createInitialV2PromptState(
  recipe: StoredVisualRecipe | null,
): V2PromptWorkspaceState | null {
  if (!isVisualRecipeV2Success(recipe)) return null;
  return {
    outputMode: "standard",
    enabledInvariantIds: recipe.styleInvariants.map((item) => item.id),
    variableValues: Object.fromEntries(
      recipe.contentVariables.map((item) => [item.name, item.defaultValue]),
    ),
    enabledModifierNames: [],
    modifierValues: Object.fromEntries(
      recipe.optionalModifiers.map((item) => [item.name, item.defaultValue]),
    ),
    customPrompt: "",
  };
}

/**
 * plan-02（架构 §7.2）：v4 → v5 迁移。保留参考、Prompt、变量、来源与参数；
 * 新分析 detail 默认 standard（可识别的旧 outputMode 字段映射）；
 * 缺合法快速快照时强制 authorization=none，不从旧数据推测授权。
 */
function migrateV4PersistedState(
  data: WorkspacePersistedState,
): WorkspacePersistedState {
  const legacyOutputMode = data.v2PromptState?.outputMode;
  const promptControls: WorkspacePromptControls = {
    intent:
      legacyOutputMode === "reconstruction" ? "reconstruction" : "same_style",
    detailLevel:
      legacyOutputMode === "concise" || legacyOutputMode === "professional"
        ? legacyOutputMode
        : "standard",
  };
  return {
    ...data,
    version: WORKSPACE_STORAGE_VERSION,
    creationPace: "analyze_edit",
    quickAuthorization: "none",
    quickGenerationAuthorizationSnapshot: null,
    promptControls,
    generationParams: sanitizeWorkspaceGenerationParams(
      data.generationParams ?? data.restoredParams,
    ),
    aspectRatioSource: "fallback",
    preferredIterationId: null,
  };
}

/** 从 sessionStorage 读取持久化状态 */
export function loadPersistedState(): Partial<WorkspacePersistedState> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as WorkspacePersistedState;

    if (data.version === 4) {
      return migrateV4PersistedState(data);
    }

    // 版本检查：其余不兼容版本按陈旧数据处理
    if (data.version !== WORKSPACE_STORAGE_VERSION) {
      console.warn(`[workspace] Storage version mismatch, clearing stale data: ${data.version} !== ${WORKSPACE_STORAGE_VERSION}`);
      sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[workspace] Failed to read sessionStorage:", err);
    // 静默清理损坏的数据
    try {
      sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } catch {
      // 忽略清除失败
    }
    return null;
  }
}

/** 写入 sessionStorage（debounce 避免频繁写入） */
type PersistWriter = ((state: WorkspacePersistedState) => void) & {
  cancel: () => void;
};

function createPersistWriter() {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const write: PersistWriter = (state: WorkspacePersistedState) => {
    if (typeof window === "undefined") return;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // 300ms debounce，避免频繁写入
    timeoutId = setTimeout(() => {
      try {
        sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error("[workspace] Failed to write sessionStorage:", err);
      }
      timeoutId = null;
    }, 300);
  };

  write.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return write;
}

const persistState = createPersistWriter();

/** 同步写入 sessionStorage（取消挂起的防抖写入后立即落盘，架构 §6.3 flush 语义） */
function writePersistedStateSync(state: WorkspacePersistedState): void {
  if (typeof window === "undefined") return;
  persistState.cancel();
  try {
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("[workspace] Failed to flush sessionStorage:", err);
  }
}

/**
 * plan-04: 读取守卫输入快照（当前工作区内容 + 恢复上下文）。
 * 无持久化条目或条目缺少有效来源（等同空工作台）时返回 null。
 */
export function readWorkspaceSnapshot(): WorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  const persisted = loadPersistedState();
  if (!persisted || !persisted.assetId || !persisted.referenceImageUrl) {
    return null;
  }
  return {
    currentIterationId: persisted.currentIterationId ?? null,
    promptText: persisted.promptText ?? "",
    negativePromptText: persisted.negativePromptText ?? "",
    params: persisted.restoredParams ?? null,
  };
}

/**
 * plan-04: 应用迭代恢复载荷到持久化通道并同步 flush（架构 §6.3：防抖窗口内
 * 必须显式落盘，导航前完成）。恢复为纯客户端动作（ADR-4），不发出任何请求。
 */
export function writeIterationRestoreSnapshot(
  payload: IterationRestorePayload,
): void {
  if (typeof window === "undefined") return;
  const entry: WorkspacePersistedState = {
    version: WORKSPACE_STORAGE_VERSION,
    assetId: payload.sourceAssetId,
    referenceImageUrl: payload.sourceImageUrl,
    analysisTaskId: payload.analysisTaskId,
    recipe: payload.recipe,
    promptText: payload.promptSnapshot,
    negativePromptText: payload.negativePromptSnapshot,
    analysisTemplateContent: null,
    analysisTemplateVariables: [],
    analysisTemplateStatus: null,
    analysisTemplateReason: null,
    generationTaskId: null,
    v2PromptState: null,
    currentIterationId: payload.iterationId,
    currentTemplateId: payload.sourceTemplateId,
    previousResultUrl: payload.resultFileUrl,
    restoredParams: payload.params,
    pendingIterationRestore: payload,
    // plan-02: 恢复进入新工作区上下文——创作节奏回默认，快速授权归 none
    creationPace: "analyze_edit",
    quickAuthorization: "none",
    quickGenerationAuthorizationSnapshot: null,
    // plan-04（AC-03）：Iteration 恢复的画幅优先于推荐（restore 来源）
    generationParams: sanitizeWorkspaceGenerationParams(payload.params),
    aspectRatioSource: "restore",
  };
  writePersistedStateSync(entry);
}

/**
 * plan-04: 工作台挂载时消费通道中待应用的一次性恢复载荷。
 * 读取后立即从通道清除标记（防重复应用），载荷本体随 ctx 应用重新持久化。
 */
export function consumePendingIterationRestore(): IterationRestorePayload | null {
  if (typeof window === "undefined") return null;
  const persisted = loadPersistedState();
  if (!persisted?.pendingIterationRestore) return null;

  const { pendingIterationRestore: _cleared, ...rest } = persisted;
  writePersistedStateSync(rest as WorkspacePersistedState);
  return persisted.pendingIterationRestore;
}

/** 清除 workspace 的 sessionStorage 快照 */
export function clearWorkspacePersistedState(): void {
  if (typeof window === "undefined") return;
  try {
    persistState.cancel();
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch (err) {
    console.error("[workspace] Failed to clear sessionStorage:", err);
  }
}

/** 从持久化状态恢复到 WorkspaceContext */
function restoreFromPersistedState(
  persisted: Partial<WorkspacePersistedState>,
): WorkspaceContext | null {
  // plan-04: 恢复链路（待应用载荷或 restored 的工作区）以恢复态挂载——
  // 快照即真相：不重建 V2 结构化视图（提示为纯文本快照）、不恢复分析模板、
  // 不进入分析轮询，避免过期分析结果覆盖恢复内容。
  const isIterationRestored =
    !!persisted.pendingIterationRestore || !!persisted.currentIterationId;

  // plan-02（架构 §3.3）：armed 必须与合法快照成对；损坏/缺字段视为 none
  // 并清除快照，不从旧 pace 推测授权。
  const sanitizedSnapshot = sanitizeQuickGenerationAuthorizationSnapshot(
    persisted.quickGenerationAuthorizationSnapshot,
  );
  const restoredAuthorization: QuickAuthorization =
    persisted.quickAuthorization === "armed" ||
    persisted.quickAuthorization === "consumed"
      ? persisted.quickAuthorization
      : "none";
  const quickAuthorization: QuickAuthorization =
    restoredAuthorization === "armed" && !sanitizedSnapshot
      ? "none"
      : restoredAuthorization;
  const quickGenerationAuthorizationSnapshot =
    quickAuthorization === "none" ? null : sanitizedSnapshot;
  const quickAuthorizationClearedReason =
    restoredAuthorization === "armed" && quickAuthorization === "none"
      ? QUICK_AUTHORIZATION_CLEARED_REASONS.invalidSnapshot
      : null;
  const creationPace: CreationPace =
    persisted.creationPace === "quick_recreate" ? "quick_recreate" : "analyze_edit";

  // 数据校验：普通状态至少需要有 assetId 和 referenceImageUrl 才算有效；
  // 恢复态豁免该校验——来源图缺失（旧记录）时其余字段照常恢复，
  // 来源位保持空态占位（plan-04 边界场景）。
  if (
    !isIterationRestored &&
    (!persisted.assetId || !persisted.referenceImageUrl)
  ) {
    // plan-02（ADR-2）：空工作区的快速授权闩锁独立于参考内容——
    // 确认后尚未上传参考图时刷新，armed/consumed 仍需成对恢复，
    // 防止已确认授权静默丢失导致重复确认或意外重放。
    if (
      creationPace === "analyze_edit" &&
      quickAuthorization === "none" &&
      !quickGenerationAuthorizationSnapshot
    ) {
      return null;
    }
    return {
      ...initialContext,
      creationPace,
      quickAuthorization,
      quickGenerationAuthorizationSnapshot,
      quickAuthorizationClearedReason,
      promptControls: sanitizeWorkspacePromptControls(persisted.promptControls),
      generationParams: sanitizeWorkspaceGenerationParams(
        persisted.generationParams,
      ),
      aspectRatioSource:
        persisted.aspectRatioSource ?? initialContext.aspectRatioSource,
    };
  }

  return {
    expert: persisted.expert ?? {editorMode:persisted.v2PromptState?.outputMode==="custom"?"text":"variables",customPromptDirty:persisted.v2PromptState?.outputMode==="custom",adjustments:[]},
    state: isIterationRestored ? "history_restored" : "analysis_ready",
    assetId: persisted.assetId ?? null,
    referenceImageUrl: persisted.referenceImageUrl ?? null,
    analysisTaskId: persisted.analysisTaskId ?? null,
    recipe: persisted.recipe ?? null,
    promptText: persisted.promptText ?? "",
    negativePromptText: persisted.negativePromptText ?? "",
    analysisTemplateContent: isIterationRestored
      ? null
      : persisted.analysisTemplateContent ?? null,
    analysisTemplateVariables: isIterationRestored
      ? []
      : persisted.analysisTemplateVariables ?? [],
    analysisTemplateStatus: isIterationRestored
      ? null
      : persisted.analysisTemplateStatus ?? null,
    analysisTemplateReason: isIterationRestored
      ? null
      : persisted.analysisTemplateReason ?? null,
    generationTaskId: persisted.generationTaskId ?? null,
    // 恢复态保留上一轮结果可见；普通恢复不恢复 resultImageUrl（URL 可能已失效）
    resultImageUrl: isIterationRestored ? persisted.previousResultUrl ?? null : null,
    mimeType: null,
    error: null,
    degradation: initialDegradation,
    isRecipeExpanded: false,
    v2PromptState: isIterationRestored
      ? null
      : persisted.v2PromptState ?? createInitialV2PromptState(persisted.recipe ?? null),
    currentIterationId: persisted.currentIterationId ?? null,
    currentTemplateId: persisted.currentTemplateId ?? null,
    previousResultUrl: persisted.previousResultUrl ?? null,
    restoredParams: persisted.restoredParams ?? null,
    memoryIdentity: sanitizeMemoryIdentity(persisted.memoryIdentity),
    creationPace,
    quickAuthorization,
    quickGenerationAuthorizationSnapshot,
    quickAuthorizationClearedReason,
    promptControls: sanitizeWorkspacePromptControls(persisted.promptControls),
    generationParams: sanitizeWorkspaceGenerationParams(
      persisted.generationParams,
    ),
    aspectRatioSource:
      persisted.aspectRatioSource ?? initialContext.aspectRatioSource,
    preferredIterationId: persisted.preferredIterationId ?? null,
  };
}

/** 由 ctx 组装持久化条目（plan-04 恢复上下文随自动持久化一并落盘） */
function toPersistedState(ctx: WorkspaceContext): WorkspacePersistedState {
  return {
    version: WORKSPACE_STORAGE_VERSION,
    expert:ctx.expert,
    assetId: ctx.assetId,
    referenceImageUrl: ctx.referenceImageUrl,
    analysisTaskId: ctx.analysisTaskId,
    recipe: ctx.recipe,
    promptText: ctx.promptText,
    negativePromptText: ctx.negativePromptText,
    analysisTemplateContent: ctx.analysisTemplateContent,
    analysisTemplateVariables: ctx.analysisTemplateVariables,
    analysisTemplateStatus: ctx.analysisTemplateStatus,
    analysisTemplateReason: ctx.analysisTemplateReason,
    generationTaskId: ctx.generationTaskId,
    v2PromptState: ctx.v2PromptState,
    currentIterationId: ctx.currentIterationId,
    currentTemplateId: ctx.currentTemplateId,
    previousResultUrl: ctx.previousResultUrl,
    restoredParams: ctx.restoredParams,
    memoryIdentity: ctx.memoryIdentity,
    // plan-02: v5 持久化创作节奏/授权/快照/控制草稿/参数/画幅来源/首选；
    // 授权清除原因等瞬时态不落盘。
    creationPace: ctx.creationPace,
    quickAuthorization: ctx.quickAuthorization,
    quickGenerationAuthorizationSnapshot: ctx.quickGenerationAuthorizationSnapshot,
    promptControls: ctx.promptControls,
    generationParams: ctx.generationParams,
    aspectRatioSource: ctx.aspectRatioSource,
    preferredIterationId: ctx.preferredIterationId,
  };
}

export interface WorkspaceActions {
  startUpload: (mimeType?: string) => void;
  completeUpload: (assetId: string, fileUrl: string) => void;
  startAnalysis: (taskId: string) => void;
  completeAnalysis: (
    recipe: StoredVisualRecipe | null,
    promptText: string,
    negativePromptText: string,
    template?: WorkspaceAnalysisTemplatePayload
  ) => void;
  failAnalysis: (message: string, stage?: string, code?: string, retryable?: boolean) => void;
  startGeneration: (taskId: string) => void;
  completeGeneration: (resultImageUrl: string) => void;
  failGeneration: (message: string, code?: string, retryable?: boolean) => void;
  setPromptText: (text: string) => void;
  setNegativePromptText: (text: string) => void;
  setV2PromptState: (
    update:
      | V2PromptWorkspaceState
      | ((current: V2PromptWorkspaceState) => V2PromptWorkspaceState),
  ) => void;
  setError: (message: string, stage?: string) => void;
  clearError: () => void;
  reset: () => void;
  setAnalysisQueueing: (queueing: boolean) => void;
  setGenerationQueueing: (queueing: boolean) => void;
  setGenerationUnavailable: (unavailable: boolean) => void;
  setAnalysisUnavailable: (unavailable: boolean) => void;
  toggleRecipeExpanded: () => void;
  /** plan-04: 更新迭代恢复上下文（仅覆盖传入的键；undefined 归一为 null） */
  setRestoreContext: (context: {
    currentIterationId?: string | null;
    currentTemplateId?: string | null;
    previousResultUrl?: string | null;
    restoredParams?: GenerationParams | null;
  }) => void;
  /** plan-07: 写入/清除当前 Style Memory 身份（身份条数据源；null 即移除） */
  setMemoryIdentity: (identity: WorkspaceMemoryIdentity | null) => void;
  /** plan-07: Memory 直入/复用切换时应用来源参考图（不改动工作流状态与错误位） */
  setSourceReference: (assetId: string, fileUrl: string) => void;
  /**
   * plan-02（ADR-2）: 确认快速复刻——同一 QuickGenerationAuthorizationSnapshot
   * 与 armed 原子持久化并同步 flush；确认 UI/readiness/submit 共用该快照。
   */
  confirmQuickRecreate: (snapshot: QuickGenerationAuthorizationSnapshot) => void;
  /** plan-02: armed → consumed；必须在发起生成请求前调用（同步落盘防刷新重放） */
  consumeQuickAuthorization: () => void;
  /** plan-02: 生成门阻塞/分析失败等清除授权——none + 清快照 + 原因（同步 flush） */
  clearQuickAuthorization: (reason: string) => void;
  /** plan-02: 用户退出快速路径——回 analyze_edit、清授权并恢复可编辑（同步 flush） */
  exitQuickRecreate: () => void;
  /** plan-02: 切换创作节奏（选择「分析后编辑」；armed 期间等价退出快速路径） */
  setCreationPace: (pace: CreationPace) => void;
  /** plan-02: 更新工作台生成参数；画幅变化可携带来源（user/restore） */
  setGenerationParams: (
    params: WorkspaceGenerationParams,
    source?: AspectRatioSource,
  ) => void;
  /** plan-02: 记录当前方向首选结果（仅会话偏好，plan-05/06 消费） */
  setPreferredIterationId: (iterationId: string | null) => void;
  /**
   * plan-07: 直入路径按调用方口径写入分析模板载荷——不经过 completeAnalysis
   * 的归一化（Memory 来源的变量定义需保留 label 参与缺失门派生；状态取
   * `fallback` 以保持文本提示模式与既有 full-prompt 编辑器契约）。
   */
  applyAnalysisTemplatePayload: (payload: {
    analysisTemplateContent: string | null;
    analysisTemplateVariables: TemplateVariable[];
    analysisTemplateStatus: AnalysisTemplateStatus | null;
    analysisTemplateReason: string | null;
  }) => void;
  /** plan-04: 同步落盘当前工作区状态（绕过 300ms 防抖，架构 §6.3） */
  flush: () => void;
  enterHistoryRestored: (
    resultFileUrl: string,
    recipe: StoredVisualRecipe | null,
    promptSnapshot: string,
    negativePromptSnapshot: string,
    analysisTaskId: string,
    source?: {
      sourceAssetId: string | null;
      sourceImageUrl: string | null;
    },
  ) => void;
  exitHistoryRestored: () => void;
}

export function useWorkspaceAgent(options?: AgentOptions) {
  // 尝试从 sessionStorage 恢复状态
  const getInitialState = (): WorkspaceContext => {
    if (!options && typeof window !== "undefined") {
      const persisted = loadPersistedState();
      if (persisted) {
        const restored = restoreFromPersistedState(persisted);
        if (restored) {
          console.log("[workspace] Restored state from sessionStorage");
          return restored;
        }
      }
    }
    return initialContext;
  };

  const [ctx, setCtx] = useState<WorkspaceContext>(getInitialState);
  const agent = useAgentPersistence(options, ctx, setCtx);
  const didSkipInitialPersistRef = useRef(false);
  // flush 需要读取最新 ctx 而不随每次渲染重建回调（plan-04）
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  /**
   * plan-02（ADR-2 / 架构 §6.1.7）：关键状态原子提交——基于最新 ctx 计算下一
   * 状态、同步写 sessionStorage（取消挂起防抖）再提交 React 状态，保证
   * 「先持久化 consumed 再发请求」、阻塞清理与「提交后刷新可恢复生成终态」
   * 的落盘时序不依赖 300ms 防抖窗口。
   */
  const commitSync = useCallback(
    (mutate: (prev: WorkspaceContext) => WorkspaceContext) => {
      const next = mutate(ctxRef.current);
      if (next === ctxRef.current) return;
      ctxRef.current = next;
      if (!options) writePersistedStateSync(toPersistedState(next));
      setCtx(next);
    },
    [],
  );

  const startUpload = useCallback((mimeType?: string) => {
    setCtx((prev) => ({
      ...prev,
      state: "uploading",
      error: null,
      mimeType: mimeType ?? prev.mimeType,
    }));
  }, []);

  const completeUpload = useCallback((assetId: string, fileUrl: string) => {
    setCtx((prev) => ({
      ...prev,
      state: "analyzing",
      assetId,
      referenceImageUrl: fileUrl,
      error: null,
      // plan-04: 新参考图 = 新方向——迭代恢复上下文作废；
      // currentTemplateId 保留（从 Style Memory 进入后上传参考仍归属该模板，AC-02）
      currentIterationId: null,
      previousResultUrl: null,
      restoredParams: null,
      // plan-02（架构 §3.3「更换方向重置为 none」）：上一方向的 consumed
      // 授权不带入新方向；armed 保留——确认先于上传发生，正是待兑现的授权。
      quickAuthorization:
        prev.quickAuthorization === "consumed" ? "none" : prev.quickAuthorization,
      quickGenerationAuthorizationSnapshot:
        prev.quickAuthorization === "consumed"
          ? null
          : prev.quickGenerationAuthorizationSnapshot,
    }));
  }, []);

  const startAnalysis = useCallback((taskId: string) => {
    setCtx((prev) => ({
      ...prev,
      state: "analyzing",
      analysisTaskId: taskId,
      v2PromptState:
        prev.analysisTaskId === taskId ? prev.v2PromptState : null,
      error: null,
    }));
  }, []);

  const completeAnalysis = useCallback(
    (
      recipe: StoredVisualRecipe | null,
      promptText: string,
      negativePromptText: string,
      template: WorkspaceAnalysisTemplatePayload | undefined,
    ) => {
      if(options){void agent.refreshDirection().catch(()=>{});return;}
      const normalizedTemplate = normalizeAnalysisTemplatePayload(template);
      const nextStatus = normalizedTemplate?.analysisTemplateStatus ?? null;
      const shouldUseTemplate =
        nextStatus === "ready" || nextStatus === "partial";
      setCtx((prev) => ({
        ...prev,
        state: "analysis_ready",
        recipe,
        promptText,
        negativePromptText,
        analysisTemplateContent: shouldUseTemplate
          ? normalizedTemplate?.analysisTemplateContent ?? null
          : null,
        analysisTemplateVariables: shouldUseTemplate
          ? normalizedTemplate?.analysisTemplateVariables ?? []
          : [],
        analysisTemplateStatus: nextStatus,
        analysisTemplateReason: normalizedTemplate?.analysisTemplateReason ?? null,
        // A completed poll may run again after refresh. Preserve edits restored for
        // the same task; startAnalysis clears them when a different task begins.
        v2PromptState:
          prev.v2PromptState ?? createInitialV2PromptState(recipe),
        error: null,
      }));
    },
    [],
  );

  const failAnalysis = useCallback((message: string, stage?: string, code?: string, retryable?: boolean) => {
    // plan-02（AC-07）：分析失败时清除 armed 快照并说明原因——
    // 条件恢复（重试成功）后不复活授权，用户手动生成或重新确认。
    commitSync((prev) => ({
      ...prev,
      state: "idle",
      error: { message, stage, code, retryable },
      degradation: {
        ...prev.degradation,
        analysisQueueing: false,
        // L4: 分析返回 SERVICE_UNAVAILABLE 时标记不可用
        analysisUnavailable: code === "SERVICE_UNAVAILABLE" ? true : prev.degradation.analysisUnavailable,
      },
      ...(prev.quickAuthorization === "armed"
        ? {
            quickAuthorization: "none" as const,
            quickGenerationAuthorizationSnapshot: null,
            quickAuthorizationClearedReason:
              QUICK_AUTHORIZATION_CLEARED_REASONS.analysisFailed,
          }
        : {}),
    }));
  }, [commitSync]);

  const startGeneration = useCallback((taskId: string) => {
    // plan-02（架构 §6.1.7）：生成任务创建即同步落盘——提交后立刻刷新页面也能
    // 恢复生成轮询终态，不依赖 300ms 防抖窗口。
    commitSync((prev) => ({
      ...prev,
      state: "generating",
      generationTaskId: taskId,
      resultImageUrl: null,
      error: null,
    }));
  }, [commitSync]);

  const completeGeneration = useCallback((resultImageUrl: string) => {
    setCtx((prev) => ({
      ...prev,
      state: "generation_ready",
      resultImageUrl,
      error: null,
      isRecipeExpanded: false,
      // plan-04: 新结果生成后，恢复携带的“上一轮结果”不再作为上一轮保留
      previousResultUrl: null,
    }));
  }, []);

  const failGeneration = useCallback((message: string, code?: string, retryable?: boolean) => {
    setCtx((prev) => ({
      ...prev,
      state: "generation_ready",
      error: { message, stage: "generation", code, retryable },
      degradation: {
        ...prev.degradation,
        generationQueueing: false,
        // L2: 生成返回 SERVICE_UNAVAILABLE 时标记不可用
        generationUnavailable: code === "SERVICE_UNAVAILABLE" ? true : prev.degradation.generationUnavailable,
      },
    }));
  }, []);

  const setPromptText = useCallback((text: string) => {
    setCtx((prev) => ({
      ...prev,
      promptText: text,
    }));
  }, []);

  const setNegativePromptText = useCallback((text: string) => {
    setCtx((prev) => ({
      ...prev,
      negativePromptText: text,
    }));
  }, []);

  const setV2PromptState = useCallback<WorkspaceActions["setV2PromptState"]>(
    (update) => {
      setCtx((prev) => {
        const current = prev.v2PromptState ?? createInitialV2PromptState(prev.recipe);
        if (!current) return prev;
        return {
          ...prev,
          v2PromptState: typeof update === "function" ? update(current) : update,
        };
      });
    },
    [],
  );

  const setError = useCallback((message: string, stage?: string) => {
    setCtx((prev) => ({
      ...prev,
      error: { message, stage },
    }));
  }, []);

  const clearError = useCallback(() => {
    setCtx((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    clearWorkspacePersistedState();
    setCtx(initialContext);
  }, []);

  const setAnalysisQueueing = useCallback((queueing: boolean) => {
    setCtx((prev) => ({
      ...prev,
      degradation: { ...prev.degradation, analysisQueueing: queueing },
    }));
  }, []);

  const setGenerationQueueing = useCallback((queueing: boolean) => {
    setCtx((prev) => ({
      ...prev,
      degradation: { ...prev.degradation, generationQueueing: queueing },
    }));
  }, []);

  const setGenerationUnavailable = useCallback((unavailable: boolean) => {
    setCtx((prev) => ({
      ...prev,
      degradation: { ...prev.degradation, generationUnavailable: unavailable },
    }));
  }, []);

  const setAnalysisUnavailable = useCallback((unavailable: boolean) => {
    setCtx((prev) => ({
      ...prev,
      degradation: { ...prev.degradation, analysisUnavailable: unavailable },
    }));
  }, []);

  const toggleRecipeExpanded = useCallback(() => {
    setCtx((prev) => ({
      ...prev,
      isRecipeExpanded: !prev.isRecipeExpanded,
    }));
  }, []);

  const setRestoreContext = useCallback<
    WorkspaceActions["setRestoreContext"]
  >((context) => {
    setCtx((prev) => {
      const next: WorkspaceContext = { ...prev };
      if ("currentIterationId" in context) {
        next.currentIterationId = context.currentIterationId ?? null;
      }
      if ("currentTemplateId" in context) {
        next.currentTemplateId = context.currentTemplateId ?? null;
      }
      if ("previousResultUrl" in context) {
        next.previousResultUrl = context.previousResultUrl ?? null;
      }
      if ("restoredParams" in context) {
        next.restoredParams = context.restoredParams ?? null;
      }
      return next;
    });
  }, []);

  // plan-07: 身份与来源参考图随工作台状态一并持久化（见 toPersistedState）
  const setMemoryIdentity = useCallback<WorkspaceActions["setMemoryIdentity"]>(
    (identity) => {
      setCtx((prev) => ({ ...prev, memoryIdentity: identity }));
    },
    [],
  );

  const setSourceReference = useCallback<WorkspaceActions["setSourceReference"]>(
    (assetId, fileUrl) => {
      setCtx((prev) => ({
        ...prev,
        assetId,
        referenceImageUrl: fileUrl,
      }));
    },
    [],
  );

  const applyAnalysisTemplatePayload =
    useCallback<WorkspaceActions["applyAnalysisTemplatePayload"]>((payload) => {
      setCtx((prev) => ({ ...prev, ...payload }));
    }, []);

  // ─── plan-02：创作节奏与快速授权原子 actions（均同步 flush，ADR-2） ──────────

  const confirmQuickRecreate = useCallback<
    WorkspaceActions["confirmQuickRecreate"]
  >(
    (snapshot) => {
      commitSync((prev) => ({
        ...prev,
        creationPace: "quick_recreate",
        quickAuthorization: "armed",
        quickGenerationAuthorizationSnapshot: snapshot,
        generationParams: sanitizeWorkspaceGenerationParams({ ...prev.generationParams, ...snapshot.generationSettings }),
        quickAuthorizationClearedReason: null,
      }));
    },
    [commitSync],
  );

  const consumeQuickAuthorization = useCallback<
    WorkspaceActions["consumeQuickAuthorization"]
  >(
    () => {
      commitSync((prev) =>
        prev.quickAuthorization === "armed"
          ? { ...prev, quickAuthorization: "consumed" }
          : prev,
      );
    },
    [commitSync],
  );

  const clearQuickAuthorization = useCallback<
    WorkspaceActions["clearQuickAuthorization"]
  >(
    (reason) => {
      commitSync((prev) =>
        prev.quickAuthorization === "none" &&
        !prev.quickGenerationAuthorizationSnapshot &&
        prev.creationPace === "analyze_edit"
          ? prev
          : {
              ...prev,
              quickAuthorization: "none",
              quickGenerationAuthorizationSnapshot: null,
              quickAuthorizationClearedReason: reason,
            },
      );
    },
    [commitSync],
  );

  const exitQuickRecreate = useCallback<WorkspaceActions["exitQuickRecreate"]>(
    () => {
      commitSync((prev) => ({
        ...prev,
        creationPace: "analyze_edit",
        quickAuthorization: "none",
        quickGenerationAuthorizationSnapshot: null,
        quickAuthorizationClearedReason:
          QUICK_AUTHORIZATION_CLEARED_REASONS.exit,
      }));
    },
    [commitSync],
  );

  const setCreationPace = useCallback<WorkspaceActions["setCreationPace"]>(
    (pace) => {
      if (pace !== "analyze_edit") return;
      commitSync((prev) => {
        if (
          prev.creationPace === "analyze_edit" &&
          prev.quickAuthorization === "none"
        ) {
          return prev;
        }
        // armed 期间切回「分析后编辑」= 退出快速路径（清授权并恢复可编辑）
        return {
          ...prev,
          creationPace: "analyze_edit",
          quickAuthorization: "none",
          quickGenerationAuthorizationSnapshot: null,
          quickAuthorizationClearedReason:
            prev.quickAuthorization === "armed"
              ? QUICK_AUTHORIZATION_CLEARED_REASONS.exit
              : prev.quickAuthorizationClearedReason,
        };
      });
    },
    [commitSync],
  );

  const setGenerationParams = useCallback<
    WorkspaceActions["setGenerationParams"]
  >((params, source) => {
    setCtx((prev) => ({
      ...prev,
      generationParams: params,
      aspectRatioSource: source ?? prev.aspectRatioSource,
    }));
  }, []);

  const setPreferredIterationId = useCallback<
    WorkspaceActions["setPreferredIterationId"]
  >((iterationId) => {
    setCtx((prev) => ({ ...prev, preferredIterationId: iterationId }));
  }, []);

  const flush = useCallback(() => {
    writePersistedStateSync(toPersistedState(ctxRef.current));
  }, []);

  const enterHistoryRestored = useCallback(
    (
      resultFileUrl: string,
      recipe: StoredVisualRecipe | null,
      promptSnapshot: string,
      negativePromptSnapshot: string,
      analysisTaskId: string,
      source?: {
        sourceAssetId: string | null;
        sourceImageUrl: string | null;
      },
    ) => {
      setCtx((prev) => ({
        ...prev,
        state: "history_restored",
        assetId: source?.sourceAssetId ?? prev.assetId,
        referenceImageUrl: source?.sourceImageUrl ?? prev.referenceImageUrl,
        resultImageUrl: resultFileUrl,
        recipe,
        promptText: promptSnapshot,
        negativePromptText: negativePromptSnapshot,
        analysisTemplateContent: null,
        analysisTemplateVariables: [],
        analysisTemplateStatus: null,
        analysisTemplateReason: null,
        v2PromptState: null,
        analysisTaskId,
        error: null,
      }));
    },
    []
  );

  const exitHistoryRestored = useCallback(() => {
    setCtx((prev) => ({
      ...prev,
      state: "idle",
      resultImageUrl: null,
    }));
  }, []);

  // 持久化关键状态到 sessionStorage
  useEffect(() => {
    if (options || typeof window === "undefined") return;

    // 初次渲染只Done恢复/初始化，不立即回写，避免覆盖 restored 状态。
    if (!didSkipInitialPersistRef.current) {
      didSkipInitialPersistRef.current = true;
      return;
    }

    if (!ctx.assetId || !ctx.referenceImageUrl) {
      // plan-04: 恢复态豁免——来源缺失的恢复快照仍保留在通道中
      //（守卫读取与来源模板标记依赖该上下文）
      // plan-02: 快速授权闩锁（ADR-2）独立于参考内容——确认后尚未上传
      // 参考图的空工作区仍需保留 armed/consumed 快照，不得被清盘。
      const hasQuickAuthorizationContext =
        ctx.quickAuthorization !== "none" ||
        ctx.quickGenerationAuthorizationSnapshot !== null ||
        ctx.creationPace === "quick_recreate";
      if (!ctx.currentIterationId && !hasQuickAuthorizationContext) {
        clearWorkspacePersistedState();
        return;
      }
    }

    persistState(toPersistedState(ctx));
  }, [
    ctx.assetId,
    ctx.referenceImageUrl,
    ctx.analysisTaskId,
    ctx.recipe,
    ctx.promptText,
    ctx.negativePromptText,
    ctx.analysisTemplateContent,
    ctx.analysisTemplateVariables,
    ctx.analysisTemplateStatus,
    ctx.analysisTemplateReason,
    ctx.generationTaskId,
    ctx.v2PromptState,
    ctx.currentIterationId,
    ctx.currentTemplateId,
    ctx.previousResultUrl,
    ctx.restoredParams,
    ctx.memoryIdentity,
    ctx.creationPace,
    ctx.quickAuthorization,
    ctx.quickGenerationAuthorizationSnapshot,
    ctx.promptControls,
    ctx.generationParams,
    ctx.aspectRatioSource,
    ctx.preferredIterationId,
  ]);

  return {
    ...ctx,
    ...agent,
    setPromptIntent:(intent:PromptIntent)=>setCtx(current=>({...current,promptControls:{...current.promptControls,intent}})),
    setPromptDetail:(detailLevel:PromptDetailLevel)=>setCtx(current=>({...current,promptControls:{...current.promptControls,detailLevel}})),
    setEditorMode:(editorMode:PromptEditorMode)=>setCtx(current=>({...current,expert:{...current.expert,editorMode}})),
    setCustomPromptDirty:(customPromptDirty:boolean)=>setCtx(current=>({...current,expert:{...current.expert,customPromptDirty}})),
    setAdjustments:(adjustments:InvariantAdjustment[])=>setCtx(current=>({...current,expert:{...current.expert,adjustments}})),
    startUpload,
    completeUpload,
    startAnalysis,
    completeAnalysis,
    failAnalysis,
    startGeneration,
    completeGeneration,
    failGeneration,
    setPromptText,
    setNegativePromptText,
    setV2PromptState,
    setError,
    clearError,
    reset,
    setAnalysisQueueing,
    setGenerationQueueing,
    setGenerationUnavailable,
    setAnalysisUnavailable,
    toggleRecipeExpanded,
    setRestoreContext,
    setMemoryIdentity,
    setSourceReference,
    applyAnalysisTemplatePayload,
    confirmQuickRecreate,
    consumeQuickAuthorization,
    clearQuickAuthorization,
    exitQuickRecreate,
    setCreationPace,
    setGenerationParams,
    setPreferredIterationId,
    flush: options ? agent.flushLocal : flush,
    enterHistoryRestored,
    exitHistoryRestored,
  };
}

interface AgentOptions { userId: string | null; directionId?: string | null; source?: {kind:"analysis"|"iteration"|"template";id:string}|null }

import type { Dispatch, SetStateAction } from 'react';
import type { GenerationSummary } from '@/components/workspace/generation-bar';
import type { WorkspaceDirection, WorkspaceEvent, DraftPatch, ContextReference } from '@/lib/workspace/contracts';
import { createIndexedDraftStorage, createDraftWriter, validateAttachments, draftAttachments, withAttachments, type LocalWorkspaceDraft, type MemorySaveFormSnapshot, type MemorySaveIntent } from '@/lib/workspace/draft-store';
import { describeInvariantAdjustment } from '@/lib/prompt-adjustments';
import { composePromptDocument, compileWorkspacePrompt } from '@/lib/prompt-composer';

interface DirectionResponse {
  direction: WorkspaceDirection;
  source: { previousResult?:{id:string;fileUrl:string}|null; reference: {id:string;fileUrl:string;mimeType:string} | null; recipe: StoredVisualRecipe|null; variables: TemplateVariable[]; analysisTemplateContent?:string|null;analysisTemplateStatus?:AnalysisTemplateStatus|null;analysisTemplateReason?:string|null; analysisStatus: string|null; analysisErrorMessage?:string|null; analysisErrorStage?:string|null };
  activeTask: {id:string;status:string;dispatchState?:string}|null;
  summaryToken: string|null;
  readiness?:{canGenerate:boolean;disabledReason:string|null};
  capabilities?:{binding:{provider:string;providerModelId:string}}|null;
}
const newKey = () => crypto.randomUUID();
function blankLocal(userId: string, directionId = 'unsent'): LocalWorkspaceDraft {
  return {userId,directionId,text:'',attachment:null,attachmentName:null,pendingSave:null,requestKeys:{},lastViewed:Date.now()};
}
function contextFromDirection(response: DirectionResponse): WorkspaceContext {
  const {direction,source,activeTask}=response;
  const control=direction.draft.control;
  const prompt=compileWorkspacePrompt(direction.draft,source.recipe,source.variables);
  return {...initialContext,
    expert:{editorMode:direction.sourceIterationId&&direction.draft.customPrompt!==null?'text':control?.editorMode??(source.analysisTemplateContent&&source.variables.length?'variables':'text'),customPromptDirty:direction.draft.customPrompt!==null,adjustments:control?.adjustments??[]},
    assetId:source.reference?.id??null, referenceImageUrl:source.reference?.fileUrl??null,mimeType:source.reference?.mimeType??null,
    analysisTaskId:direction.analysisTaskId,recipe:source.recipe,promptText:prompt.text,negativePromptText:direction.draft.negativePromptText,
    analysisTemplateContent:source.analysisTemplateContent??control?.customTemplate??null,analysisTemplateStatus:source.analysisTemplateStatus??(control?.customTemplate?"ready":null),analysisTemplateReason:source.analysisTemplateReason??null,
    analysisTemplateVariables:source.variables, generationParams:{...direction.draft.params,model:direction.draft.params.model??""} as WorkspaceGenerationParams,
    promptControls:control?{intent:control.intent,detailLevel:control.detailLevel}:initialContext.promptControls,
    v2PromptState:control?{outputMode:direction.draft.customPrompt!==null?"custom":control.detailLevel,enabledInvariantIds:control.enabledInvariantIds,variableValues:control.variableValues,enabledModifierNames:control.enabledModifierNames.filter((name): name is "mood"|"primary_color"=>name==="mood"||name==="primary_color"),modifierValues:control.modifierValues,customPrompt:direction.draft.customPrompt??''}:direction.sourceIterationId?null:direction.draft.customPrompt!==null&&isVisualRecipeV2Success(source.recipe)?{...createInitialV2PromptState(source.recipe)!,outputMode:'custom',customPrompt:direction.draft.customPrompt}:createInitialV2PromptState(source.recipe),
    previousResultUrl:source.previousResult?.fileUrl??null,restoredParams:direction.sourceIterationId?direction.draft.params:null,
    currentTemplateId:direction.sourceTemplateId,currentIterationId:direction.sourceIterationId,preferredIterationId:direction.preferredIterationId,
    aspectRatioSource:isSupportedAspectRatio(direction.draft.params.aspectRatio)?direction.draft.aspectRatioSource:'fallback',
    generationTaskId:activeTask?.id??null,
    error:source.analysisStatus==='failed'?{message:source.analysisErrorMessage??'Analysis failed. Retry analysis to continue.',stage:source.analysisErrorStage??'vision',retryable:true}:null,
    state:activeTask?'generating':source.analysisStatus==='failed'?'idle':source.analysisStatus==='completed'?(direction.sourceIterationId?'history_restored':'analysis_ready'):direction.analysisTaskId?'analyzing':'idle',
  };
}
/** Client changes are expressed against the last server snapshot, never a blindly replaced draft. */
function contextPatches(base: WorkspaceContext, next: WorkspaceContext, direction: WorkspaceDirection): DraftPatch[] {
  const patches:DraftPatch[]=[];
  const add=(target:DraftPatch['target'],before:string|null,after:string|null,key='')=>{if(before!==after)patches.push({target,key,action:'set',before,after});};
  const effectivePrompt=(value:WorkspaceContext)=>{
    const state=value.v2PromptState;
    if(!state||!isVisualRecipeV2Success(value.recipe))return value.promptText;
    if(state.outputMode==='custom'||value.expert.customPromptDirty)return state.customPrompt;
    const control:PromptControlSnapshot={schemaVersion:1,trigger:'manual',intent:value.promptControls.intent,detailLevel:value.promptControls.detailLevel,editorMode:value.expert.editorMode,customPromptDirty:false,enabledInvariantIds:state.enabledInvariantIds,variableValues:state.variableValues,enabledModifierNames:state.enabledModifierNames,modifierValues:Object.fromEntries(Object.entries(state.modifierValues).filter((entry):entry is [string,string]=>entry[1]!==undefined)),adjustments:value.expert.adjustments,customTemplate:state.customTemplate};
    return renderPromptTemplate(state.customTemplate??composePromptDocument(value.recipe,control).text,value.recipe,{...state.variableValues,...state.modifierValues});
  };
  const custom=effectivePrompt(next),oldCustom=effectivePrompt(base);
  const modifierState=(value:WorkspaceContext)=>JSON.stringify([value.v2PromptState?.enabledModifierNames,value.v2PromptState?.modifierValues,value.v2PromptState?.customTemplate]);
  // Native variables/rules retain structured editing. Legacy modifiers/custom templates
  // compile through the existing customPrompt whitelist; their local controls persist by revision.
  const needsTextPatch=!next.v2PromptState||next.v2PromptState.outputMode==='custom'||next.expert.customPromptDirty||modifierState(base)!==modifierState(next)||direction.draft.customPrompt!==null;
  if(direction.draft.customPrompt!==null&&next.derivePromptRevision===direction.draftRevision&&next.v2PromptState&&next.v2PromptState.outputMode!=='custom'&&!next.expert.customPromptDirty)add('customPrompt',direction.draft.customPrompt,null);
  else if(needsTextPatch&&(oldCustom!==custom||next.expert.customPromptDirty&&direction.draft.customPrompt!==custom))add('customPrompt',direction.draft.customPrompt,custom);
  add('negativePrompt',base.negativePromptText,next.negativePromptText);
  for(const target of ['model','aspectRatio','quality'] as const)add(target,base.generationParams[target],next.generationParams[target]);
  if(direction.draft.control){
    add('intent',base.promptControls.intent,next.promptControls.intent);
    add('detail',base.promptControls.detailLevel,next.promptControls.detailLevel);
    if(isVisualRecipeV2Success(next.recipe))for(const rule of next.recipe.styleInvariants){
      const baseAdjustment=base.expert.adjustments.find(item=>item.invariantId===rule.id);
      const nextAdjustment=next.expert.adjustments.find(item=>item.invariantId===rule.id);
      const before=base.v2PromptState?.enabledInvariantIds.includes(rule.id)?baseAdjustment?describeInvariantAdjustment(rule.value,baseAdjustment):rule.value:null;
      const after=next.v2PromptState?.enabledInvariantIds.includes(rule.id)?nextAdjustment?describeInvariantAdjustment(rule.value,nextAdjustment):rule.value:null;
      if(before!==after)patches.push({target:'invariant',key:rule.id,action:after===null?'disable':nextAdjustment?.action??'set',before,after});
    }
    for(const [key,value] of Object.entries(next.v2PromptState?.variableValues??{}))add('variable',base.v2PromptState?.variableValues[key]??null,value,key);
  }
  return patches;
}
function useAgentPersistence(options:AgentOptions|undefined, ctx:WorkspaceContext, setCtx:Dispatch<SetStateAction<WorkspaceContext>>) {
  const enabled=options!==undefined;
  const [local,setLocal]=useState<LocalWorkspaceDraft>(()=>blankLocal(options?.userId??''));
  const [response,setResponse]=useState<DirectionResponse|null>(null);
  const [saveState,setSaveState]=useState<'loading'|'local'|'saved'|'saving'|'unavailable'|'conflict'>('loading');
  const [paused,setPaused]=useState(false);
  const [notice,setNotice]=useState<string|null>(null);
  const [turnSending,setTurnSending]=useState(false);
  const displayedSummary=useRef<GenerationSummary|null>(null);
  const displayedRetry=useRef<GenerationSummary|null>(null);
  const quickFlight=useRef<{activationId:string;authorizationId:string;epoch:number;sourceAssetId:string;requestKey:string;taskId?:string;used:boolean;text:string;attachment:Blob|null}|null>(null);
  const [quickArmed,setQuickArmed]=useState(false);const [quickNotice,setQuickNotice]=useState<string|null>(null);
  const generationFlight=useRef<symbol|null>(null);
  const [generationNetworkBusy,setGenerationNetworkBusy]=useState(false);
  const [generationError,setGenerationError]=useState<string|null>(null);
  const [canConfirmGeneration,setCanConfirmGeneration]=useState(false);
  const turnFlight=useRef<symbol|null>(null);
  const [events,setEvents]=useState<WorkspaceEvent[]>([]);
  const [preview,setPreview]=useState<{kind:'empty'|'analysis'|'iteration'|'template';id?:string;value:unknown;fingerprint:string;attachment:Blob|null;revision:number|null}|null>(null);
  const localRef=useRef(local),responseRef=useRef(response),contextRef=useRef(ctx),baseline=useRef(ctx);
  const epoch=useRef(0),ready=useRef(false),pausedRef=useRef(false),pageRef=useRef({page:1,throughSequence:0,hasMore:false});
  const writer=useRef<ReturnType<typeof createDraftWriter>|null>(null);
  const storage=useRef<ReturnType<typeof createIndexedDraftStorage>|null>(null);
  const saving=useRef<Promise<void>|null>(null);
  const initialization=useRef<Promise<void>>(Promise.resolve());
  const initializationFailed=useRef(false);
  localRef.current=local;responseRef.current=response;contextRef.current=ctx;pausedRef.current=paused;
  const assertEpoch=useCallback((version:number)=>{if(epoch.current!==version)throw new Error('This direction or account changed. The earlier action was preserved in its original direction.');},[]);
  const updateLocal=useCallback((mutate:(value:LocalWorkspaceDraft)=>LocalWorkspaceDraft)=>{
    const next=mutate(localRef.current);localRef.current=next;setLocal(next);writer.current?.schedule(next);setSaveState('saving');
  },[]);
  const rememberView=useCallback((viewState:NonNullable<LocalWorkspaceDraft['viewState']>)=>{
    if(!ready.current||localRef.current.directionId!==responseRef.current?.direction.id)return;
    if(JSON.stringify(localRef.current.viewState)===JSON.stringify(viewState))return;
    const next={...localRef.current,viewState};localRef.current=next;setLocal(next);writer.current?.schedule(next);
  },[]);
  const pause=useCallback(()=>{quickFlight.current=null;setQuickArmed(false);displayedSummary.current=null;pausedRef.current=true;setPaused(true);setNotice('Your session expired. Local editing is available. Sign in, then reconnect to read the current direction.');setCtx(prev=>({...prev,quickAuthorization:'none',quickGenerationAuthorizationSnapshot:null}));},[setCtx]);
  useEffect(()=>{window.addEventListener("workspace-session-expired",pause);return()=>window.removeEventListener("workspace-session-expired",pause);},[pause]);
  const api=useCallback(async(path:string,init?:RequestInit)=>{
    if(init?.method&&init.method!=='GET'&&pausedRef.current)throw new Error('Sign in and reconnect before saving or sending.');
    const version=epoch.current;
    const result=await fetch(path,init);assertEpoch(version);
    if(result.status===401)pause();
    const body=await result.json().catch(()=>({}));
    if(!result.ok){if(result.status===409)setSaveState('conflict');throw Object.assign(new Error(body.error??body.code??'The service is unavailable. Your local draft is preserved.'),{body,status:result.status});}
    return body;
  },[pause]);
  const flushLocal=useCallback(async()=>{
    if(!enabled)return;
    const next={...localRef.current,snapshot:toPersistedState(contextRef.current),snapshotRevision:responseRef.current?.direction.draftRevision,lastViewed:Date.now()};
    localRef.current=next;writer.current?.schedule(next);
    if(!writer.current)throw new Error('Local storage is unavailable. Copy or export your draft before continuing.');
    await writer.current.flush();
  },[enabled]);
  /** plan-10：本会话内刚产生的 unknown 不立即重复回读；恢复检查留给重载/重连 */
  const memorySaveLiveUnknownRef=useRef(false);
  /** plan-10（AC-18）：同指纹未确认意图复用原 requestKey；换内容才生成新键。
   *  键与意图立即落盘（不等待 300ms debounce），刷新/关闭后表单与原键不丢。 */
  const memorySaveKeyFor=useCallback((fingerprint:string)=>{
    const prior=localRef.current.memorySaveIntent;
    if(prior&&prior.fingerprint===fingerprint&&prior.state!=='committed')return prior.requestKey;
    const requestKey=newKey();
    updateLocal(value=>({...value,memorySaveIntent:{requestKey,fingerprint,state:'pending',committedMemoryId:null,form:prior&&prior.state!=='committed'?(prior.form??null):null}}));
    void flushLocal().catch(()=>{});
    return requestKey;
  },[updateLocal,flushLocal]);
  /** plan-10：保存意图状态/表单快照更新；unknown 立即持久化并标记本会话已查 */
  const updateMemorySaveIntent=useCallback((patch:Partial<MemorySaveIntent>)=>{
    if(patch.state==='unknown')memorySaveLiveUnknownRef.current=true;
    updateLocal(value=>value.memorySaveIntent?{...value,memorySaveIntent:{...value.memorySaveIntent,...patch}}:value);
    void flushLocal().catch(()=>{});
  },[updateLocal,flushLocal]);
  const invalidateQuick=useCallback(async()=>{
    const version=epoch.current;const captured=quickFlight.current;quickFlight.current=null;setQuickArmed(false);if(captured)setQuickNotice('Unused quick authorization cleared. Any submitted image task continues in its original direction.');
    const current=responseRef.current;if(!current||pausedRef.current)return;
    if(!captured&&current.direction.quickState!=='armed')return;
    try{await api(`/api/workspace/directions/${current.direction.id}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:newKey(),action:'clearQuick',baseRevision:current.direction.draftRevision,...(captured?{activationId:captured.activationId}:{})})});}catch{if(version!==epoch.current)return;setNotice('Unused quick authorization is inactive on this page. Reconnect to clear its server record.');}
  },[api]);
  const readDirection=useCallback(async(id:string,replace=true)=>{
    const currentEpoch=epoch.current;
    const result=await api(`/api/workspace/directions/${id}`) as DirectionResponse;
    if(currentEpoch!==epoch.current)return;
    if(!ready.current&&result.direction.quickState==='armed'&&!quickFlight.current){await api(`/api/workspace/directions/${id}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:newKey(),action:'clearQuick',baseRevision:result.direction.draftRevision})});assertEpoch(currentEpoch);result.direction.quickState='none';}
    if(quickFlight.current&&result.source.analysisStatus==='failed')void invalidateQuick();
    const editing=responseRef.current;
    if(!replace && editing && editing.direction.draftRevision!==result.direction.draftRevision && localRef.current.pendingSave){
      setSaveState('conflict');setNotice('The server direction changed. Your local edits are preserved; review before saving.');return editing;
    }
    responseRef.current=result;setResponse(result);
    if(result.activeTask&&contextRef.current.generationTaskId!==result.activeTask.id)setCtx(value=>({...value,generationTaskId:result.activeTask!.id,state:'generating'}));
    if(replace || (!localRef.current.pendingSave && (editing?.direction.draftRevision !== result.direction.draftRevision || editing?.direction.analysisTaskId !== result.direction.analysisTaskId || editing?.direction.sourceAssetId !== result.direction.sourceAssetId))){const projected=contextFromDirection(result);if(contextRef.current.quickAuthorization==='armed'&&result.source.analysisStatus!=='completed'){projected.creationPace=contextRef.current.creationPace;projected.quickAuthorization='armed';projected.quickGenerationAuthorizationSnapshot=contextRef.current.quickGenerationAuthorizationSnapshot;}if(contextRef.current.quickAuthorization==='armed'&&result.source.analysisStatus==='completed')projected.quickAuthorizationClearedReason="Quick recreate requires a current server authorization. Generate manually after reviewing your draft.";baseline.current=projected;contextRef.current=projected;setCtx(projected);}
    return result;
  },[api,setCtx]);
  useEffect(()=>{
    if(!options)return;
    if(options.directionId&&responseRef.current?.direction.id===options.directionId&&responseRef.current.direction.userId===options.userId)return;
    void invalidateQuick();
    const currentEpoch=++epoch.current;preferenceFlight.current=null;displayedSummary.current=null;displayedRetry.current=null;generationFlight.current=null;setGenerationNetworkBusy(false);setGenerationError(null);setCanConfirmGeneration(false);turnFlight.current=null;setTurnSending(false);commandFlight.current=null;setCommandBusy(false);initializationFailed.current=false;ready.current=false;writer.current?.cancel();
    responseRef.current=null;setResponse(null);setEvents([]);pageRef.current={page:1,throughSequence:0,hasMore:false};setPreview(null);setCtx(initialContext);setLocal(blankLocal(options.userId??''));setSaveState('loading');
    if(!options.userId){setPaused(true);pausedRef.current=true;return;}
    pausedRef.current=false;setPaused(false);
    try{
      storage.current=createIndexedDraftStorage();
      writer.current=createDraftWriter(storage.current,()=>{setSaveState('unavailable');setNotice('Local storage is unavailable. Keep this page open; copy or export your draft.');},300,()=>setSaveState('local'));
    }catch{initializationFailed.current=true;setSaveState('unavailable');ready.current=true;return;}
    initialization.current=(async()=>{
      try{
        const legacy=loadPersistedState();
        const entrySource=options.source??(legacy?.pendingIterationRestore?{kind:'iteration' as const,id:legacy.pendingIterationRestore.iterationId}:null);
        const id=options.directionId??(entrySource?'unsent':await storage.current!.recent(options.userId!))??'unsent';
        const saved=await storage.current!.read(options.userId!,id)??blankLocal(options.userId!,id);
        if(epoch.current!==currentEpoch)return;
        localRef.current=saved;setLocal(saved);
        if(entrySource&&!options.directionId){
          const sourceIntent=entrySource;
          const sourceResult=await api(`/api/${sourceIntent.kind==='iteration'?'generation':sourceIntent.kind==='template'?'templates':'analysis'}/${sourceIntent.id}`);
          assertEpoch(currentEpoch);
          const sourceKey=saved.requestKeys[`source:${sourceIntent.kind}:${sourceIntent.id}`]??newKey();
          const prepared={...saved,requestKeys:{...saved.requestKeys,[`source:${sourceIntent.kind}:${sourceIntent.id}`]:sourceKey}};
          await storage.current!.write(prepared);
          const created=sourceIntent.kind==='analysis'&&sourceResult.directionId?{direction:{id:sourceResult.directionId}}:await api('/api/workspace/directions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:sourceKey,title:'Untitled direction',sourceKind:sourceIntent.kind,sourceId:sourceIntent.id})});
          const result=await readDirection(created.direction.id);if(!result||epoch.current!==currentEpoch)return;
          const next={...prepared,directionId:created.direction.id};await storage.current!.write(next);localRef.current=next;setLocal(next);ready.current=true;setSaveState('local');
          window.history.replaceState(null,'',`/workspace?directionId=${created.direction.id}`);return;
        }
        if(legacy?.analysisTaskId && (id==='unsent' || saved.migration&&!saved.migration.migrated)){
          const creationKey=saved.requestKeys.migration??newKey();
          const prepared={...saved,requestKeys:{...saved.requestKeys,migration:creationKey}};
          await storage.current!.write(prepared);
          const created=saved.migration?{direction:{id:saved.migration.directionId}}:await api('/api/workspace/directions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:creationKey,title:'Imported local direction',sourceKind:'analysis',sourceId:legacy.analysisTaskId})});
          const source=await readDirection(created.direction.id);if(!source||epoch.current!==currentEpoch)return;
          const restored=restoreFromPersistedState(legacy)??contextFromDirection(source);
          restored.quickAuthorization='none';restored.quickGenerationAuthorizationSnapshot=null;
          const changes=saved.pendingSave?.changes??contextPatches(contextFromDirection(source),restored,source.direction);
          const patch=saved.pendingSave??{requestKey:saved.migration?.patchKey??newKey(),baseRevision:source.direction.draftRevision,changes};
          const importing={...prepared,directionId:source.direction.id,snapshot:toPersistedState(restored),pendingSave:changes.length?patch:null,migration:{directionId:source.direction.id,patchKey:patch.requestKey,migrated:false}};
          localRef.current=importing;setLocal(importing);setCtx(restored);await storage.current!.write(importing);
          if(changes.length)await api(`/api/workspace/directions/${source.direction.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:patch.requestKey,baseRevision:patch.baseRevision,changes:patch.changes})});
          const migrated={...importing,pendingSave:null,migration:{...importing.migration,migrated:true}};
          await storage.current!.write(migrated);localRef.current=migrated;setLocal(migrated);
          await readDirection(source.direction.id);ready.current=true;setSaveState('local');
          window.history.replaceState(null,'',`/workspace?directionId=${source.direction.id}`);return;
        }
        if(id==='unsent'&&saved.snapshot){const snapshot=saved.snapshot as WorkspacePersistedState;setCtx({...initialContext,...snapshot,quickAuthorization:'none',quickGenerationAuthorizationSnapshot:null});}
        if(id!=='unsent'){
          const result=await readDirection(id);
          if(!result||epoch.current!==currentEpoch)return;
          if(saved.pendingSave&&saved.pendingSave.baseRevision!==result.direction.draftRevision){setSaveState('conflict');setNotice('The server direction changed. Your local edits are preserved; review before saving.');}
          if(saved.snapshot&&!saved.pendingSave&&saved.snapshotRevision===result.direction.draftRevision){
            const snapshot=saved.snapshot as WorkspacePersistedState;
            const projected={...contextFromDirection(result),...(snapshot.expert?{expert:snapshot.expert}:{}),...(snapshot.v2PromptState?{v2PromptState:snapshot.v2PromptState}:{}),currentTemplateId:snapshot.currentTemplateId??null,memoryIdentity:sanitizeMemoryIdentity(snapshot.memoryIdentity)};
            baseline.current=projected;contextRef.current=projected;setCtx(projected);
          }
          if(saved.snapshot&&saved.pendingSave){const snapshot=saved.snapshot as WorkspacePersistedState;setCtx({...initialContext,...snapshot,...(restoreFromPersistedState(snapshot)??{}),generationParams:result.direction.sourceIterationId?{...snapshot.generationParams,model:snapshot.generationParams?.model??""} as WorkspaceGenerationParams:sanitizeWorkspaceGenerationParams(snapshot.generationParams),quickAuthorization:'none',quickGenerationAuthorizationSnapshot:null});}
        }
        if(epoch.current!==currentEpoch)return;
        setSaveState('local');ready.current=true;
      }catch(error){if(epoch.current===currentEpoch){initializationFailed.current=true;setNotice(error instanceof Error?error.message:'Could not restore direction');setSaveState('unavailable');ready.current=true;}}
    })();
    // The effect body owns identity changes. Adopting the URL of a direction just created here is not a new identity.
    return()=>{};
    // Account and URL identity are the reset boundary, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[options?.userId,options?.directionId,options?.source?.kind,options?.source?.id]);
  useEffect(()=>()=>{epoch.current++;writer.current?.cancel();},[]);
  useEffect(()=>{
    if(!options||!ready.current)return;
    const current=responseRef.current;
    const changes=current?contextPatches(baseline.current,ctx,current.direction):[];
    if(changes.length&&quickFlight.current)void invalidateQuick();
    const preferredChanged=current&&ctx.preferredIterationId!==current.direction.preferredIterationId;
    updateLocal(value=>({...value,snapshot:toPersistedState(ctx),snapshotRevision:current?.direction.draftRevision,lastViewed:Date.now(),pendingSave:value.pendingSave?.attempted?value.pendingSave:(changes.length||preferredChanged)?{requestKey:value.pendingSave?.requestKey??newKey(),baseRevision:value.pendingSave?.baseRevision??current!.direction.draftRevision,changes,...(preferredChanged?{preferredIterationId:ctx.preferredIterationId}:{})}:null}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ctx]);
  const saveDraft=useCallback(async()=>{
    const startEpoch=epoch.current;
    await initialization.current;assertEpoch(startEpoch);
    await flushLocal();assertEpoch(startEpoch);
    if(pausedRef.current)throw new Error('Sign in and reconnect before saving.');
    if(localRef.current.preferenceIntent)throw new Error("Resolve the preferred result change before saving draft edits.");
    if(saving.current)return saving.current;
    const run=async()=>{
      assertEpoch(startEpoch);
      const current=responseRef.current;if(!current)return;
      const changes=localRef.current.pendingSave?.changes??contextPatches(baseline.current,contextRef.current,current.direction);
      const preferredChanged=contextRef.current.preferredIterationId!==current.direction.preferredIterationId;
      const localViewChanged=contextRef.current.currentTemplateId!==current.direction.sourceTemplateId||contextRef.current.memoryIdentity!==null;
      if(!changes.length&&!preferredChanged&&localRef.current.pendingSave?.preferredIterationId===undefined){setSaveState(localViewChanged||localRef.current.text||localRef.current.attachment?'local':'saved');return;}
      const pending=localRef.current.pendingSave??{requestKey:newKey(),baseRevision:current.direction.draftRevision,changes,...(preferredChanged?{preferredIterationId:contextRef.current.preferredIterationId}:{})};
      updateLocal(value=>({...value,pendingSave:{...pending,attempted:true}}));await flushLocal();assertEpoch(startEpoch);setSaveState('saving');
      const result=await api(`/api/workspace/directions/${current.direction.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:pending.requestKey,baseRevision:pending.baseRevision,changes:pending.changes,...(pending.preferredIterationId!==undefined?{preferredIterationId:pending.preferredIterationId}:{})})});
      assertEpoch(startEpoch);
      displayedSummary.current=null;const next={...current,direction:result.direction,summaryToken:null};responseRef.current=next;setResponse(next);baseline.current=contextFromDirection(next);
      const remaining=contextPatches(baseline.current,contextRef.current,next.direction);
      const remainingPreferred=contextRef.current.preferredIterationId!==next.direction.preferredIterationId;
      updateLocal(value=>({...value,pendingSave:(remaining.length||remainingPreferred)?{requestKey:newKey(),baseRevision:next.direction.draftRevision,changes:remaining,...(remainingPreferred?{preferredIterationId:contextRef.current.preferredIterationId}:{})}:null}));await flushLocal();assertEpoch(startEpoch);setSaveState(remaining.length||remainingPreferred||localViewChanged||localRef.current.text||localRef.current.attachment?'local':'saved');
    };
    saving.current=(async()=>{for(let pass=0;pass<10;pass++){await run();if(!localRef.current.pendingSave)return;}throw new Error("Your draft is still changing. Finish editing before continuing.");})().finally(()=>{saving.current=null;});return saving.current;
  },[api,flushLocal,updateLocal]);
  const ensureDirection=useCallback(async(kind:'empty'|'analysis'|'iteration'|'template'='empty',id?:string)=>{
    const version=epoch.current;
    await initialization.current;assertEpoch(version);
    if(initializationFailed.current&&!responseRef.current)throw new Error('The source direction could not be restored. Retry the source or explicitly start a new direction.');
    await flushLocal();assertEpoch(version);
    if(responseRef.current&&kind==='empty')return responseRef.current.direction.id;
    let key=localRef.current.requestKeys.creation;
    if(!key){key=newKey();updateLocal(value=>({...value,requestKeys:{...value.requestKeys,creation:key}}));await flushLocal();assertEpoch(version);}
    const result=await api('/api/workspace/directions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:key,title:'Untitled direction',sourceKind:kind,...(id?{sourceId:id}:{})})});
    assertEpoch(version);
    updateLocal(value=>({...value,directionId:result.direction.id}));await flushLocal();
    assertEpoch(version);
    const before=contextRef.current;
    await readDirection(result.direction.id);assertEpoch(version);
    setEvents([]);pageRef.current={page:1,throughSequence:0,hasMore:false};
    if(kind==='empty'){const preserved={...contextRef.current,promptText:before.promptText,negativePromptText:before.negativePromptText,generationParams:before.generationParams,promptControls:before.promptControls,expert:before.expert,v2PromptState:before.v2PromptState,creationPace:before.creationPace,quickAuthorization:before.quickAuthorization,quickGenerationAuthorizationSnapshot:before.quickGenerationAuthorizationSnapshot};contextRef.current=preserved;setCtx(preserved);}
    window.history.replaceState(null,'',`/workspace?directionId=${result.direction.id}`);
    return result.direction.id as string;
  },[api,flushLocal,readDirection,updateLocal]);
  const attach=useCallback(async(files:readonly File[], append = false)=>{
    const version=epoch.current;
    const current = append ? draftAttachments(localRef.current) : [];
    const error=validateAttachments([...current.map(item=>item.file), ...files], 3);if(error){setNotice(error);return false;}
    await initialization.current;assertEpoch(version);
    await invalidateQuick();assertEpoch(version);
    const references = [...(append ? draftAttachments(localRef.current) : []), ...files.map(file=>({file,name:file.name}))];
    if (references.length > 3) { setNotice("Attach up to 3 reference images."); return false; }
    updateLocal(value=>withAttachments({...value,requestKeys:{...value.requestKeys,analysis:newKey()}},references));
    try{await flushLocal();setNotice(null);return true;}catch{return false;}
  },[flushLocal,updateLocal]);
  const prepareAnalysis=useCallback(async()=>{
    const version=epoch.current;
    const directionId=await ensureDirection();await saveDraft();assertEpoch(version);
    let requestKey=localRef.current.requestKeys.analysis;
    if(!requestKey){requestKey=newKey();updateLocal(value=>({...value,requestKeys:{...value.requestKeys,analysis:requestKey}}));}
    await flushLocal();assertEpoch(version);return {directionId,requestKey,...(localRef.current.analysisRetryOf?{retryOf:localRef.current.analysisRetryOf}:{})};
  },[ensureDirection,flushLocal,saveDraft,updateLocal]);
  const armQuick=useCallback(async()=>{
    const version=epoch.current;const sentText=localRef.current.text,sentAttachment=localRef.current.attachment;if(sentText.trim()||!sentAttachment)throw new Error('Select a reference and send or remove your message before quick recreate.');const prepared=await prepareAnalysis();assertEpoch(version);
    const upload=localRef.current.uploaded;if(!upload)throw new Error('Upload the selected reference first.');
    const activationId=newKey();const result=await api(`/api/workspace/directions/${prepared.directionId}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:newKey(),action:'armQuick',baseRevision:responseRef.current!.direction.draftRevision,activationId})});assertEpoch(version);
    quickFlight.current={activationId,authorizationId:result.direction.quickAuthorizationId,epoch:result.direction.authorizationEpoch,sourceAssetId:upload.assetId,requestKey:prepared.requestKey,used:false,text:sentText,attachment:sentAttachment};if(localRef.current.text!==sentText||localRef.current.attachment!==sentAttachment){await invalidateQuick();throw new Error('Your input changed. Review the reference before quick recreate.');}setQuickArmed(true);setQuickNotice(null);
  },[prepareAnalysis,api,assertEpoch,invalidateQuick]);
  const acceptQuickAnalysisReceipt=useCallback((taskId:string,request:{requestKey:string;assetId:string})=>{
    const captured=quickFlight.current;if(!captured)return;
    if(captured.requestKey!==request.requestKey||captured.sourceAssetId!==request.assetId){void invalidateQuick();return;}
    captured.taskId=taskId;
    // Sent attachment and text have completed their analysis intent; preserve subsequent input.
    updateLocal(value=>withAttachments({...value,text:value.text===captured.text?'':value.text},draftAttachments(value).filter(item=>item.file!==captured.attachment)));
  },[invalidateQuick,updateLocal]);
  useEffect(()=>{
    const captured=quickFlight.current,current=response;
    if(!captured||captured.used||!captured.taskId||!current||current.source.analysisStatus!=='completed')return;
    if(current.direction.analysisTaskId!==captured.taskId||current.direction.sourceAssetId!==captured.sourceAssetId||current.direction.authorizationEpoch!==captured.epoch||current.direction.quickAuthorizationId!==captured.authorizationId||localRef.current.pendingSave||localRef.current.text.trim()||localRef.current.attachment){void invalidateQuick();return;}
    if(generationFlight.current)return;
    const flight=Symbol('quick-generation');generationFlight.current=flight;setGenerationNetworkBusy(true);
    captured.used=true;setQuickArmed(false);const version=epoch.current;
    void(async()=>{
      const intent={directionId:current.direction.id,requestKey:newKey(),baseRevision:current.direction.draftRevision,summaryToken:null,mode:'quick' as const,authorizationId:captured.authorizationId};
      updateLocal(value=>({...value,generationIntent:intent}));await flushLocal();assertEpoch(version);
      if(quickFlight.current!==captured||pausedRef.current||localRef.current.text.trim()||localRef.current.attachment||localRef.current.pendingSave||contextPatches(baseline.current,contextRef.current,current.direction).length){updateLocal(value=>({...value,generationIntent:undefined}));await flushLocal();assertEpoch(version);await invalidateQuick();return;}
      const result=await api('/api/generation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)});assertEpoch(version);
      setCtx(value=>({...value,generationTaskId:result.id,state:'generating'}));quickFlight.current=null;
    })().catch(()=>{if(version===epoch.current){void invalidateQuick();setGenerationError('Quick submission needs checking. The original request is preserved; no automatic retry will run.');}}).finally(()=>{if(generationFlight.current===flight){generationFlight.current=null;setGenerationNetworkBusy(false);}});
  },[response,api,assertEpoch,flushLocal,invalidateQuick,setCtx,updateLocal]);
  useEffect(()=>{const leave=()=>{void invalidateQuick();};window.addEventListener('pagehide',leave);return()=>{window.removeEventListener('pagehide',leave);quickFlight.current=null;};},[invalidateQuick]);
  const markSummaryDisplayed=useCallback((value:GenerationSummary)=>{
    const current=responseRef.current;if(current&&value.directionId===current.direction.id&&value.token===current.summaryToken&&value.revision===current.direction.draftRevision&&!contextPatches(baseline.current,contextRef.current,current.direction).length)displayedSummary.current=value;
  },[]);
  const generationRequest=useCallback(async(mode:'current'|'retryOriginal'='current',retryOf?:string)=>{
    const version=epoch.current;
    const prior=localRef.current.generationIntent;
    if(prior){const existing=await api(`/api/generation?requestKey=${encodeURIComponent(prior.requestKey)}`);assertEpoch(version);if(!existing.task||!['completed','failed'].includes(existing.task.status))throw new Error('Check the original submission before creating another image.');}
    if(localRef.current.text.trim()||localRef.current.attachment)throw new Error('Send or remove the unsent message and attachment first.');
    await saveDraft();await flushLocal();assertEpoch(version);
    const current=responseRef.current;if(!current)throw new Error('Analyze a reference first.');
    const shown=mode==='retryOriginal'?displayedRetry.current:{directionId:current.direction.id,token:current.summaryToken,revision:current.direction.draftRevision};
    if(!shown||shown.directionId!==current.direction.id||shown.revision!==current.direction.draftRevision||mode==='current'&&!shown.token) {await readDirection(current.direction.id,false);throw new Error('Save the draft, then generate again.');}
    const intent={directionId:current.direction.id,requestKey:newKey(),baseRevision:current.direction.draftRevision,summaryToken:shown.token,mode,...(retryOf?{retryOf}:{})};
    updateLocal(value=>({...value,generationIntent:intent}));await flushLocal();assertEpoch(version);return intent;
  },[saveDraft,flushLocal,readDirection,updateLocal,api,assertEpoch]);
  const sendGeneration=useCallback(async(mode:'current'|'retryOriginal'='current',retryOf?:string,original=false)=>{
    if(generationFlight.current||pausedRef.current)return;
    const flight=Symbol('generation');generationFlight.current=flight;setGenerationNetworkBusy(true);const version=epoch.current;
    let sent=false;
    try{
      const intent=original?localRef.current.generationIntent:await generationRequest(mode,retryOf);assertEpoch(version);
      if(!intent)throw new Error('No original submission is available.');
      if(original&&!canConfirmGeneration)throw new Error('Check the original submission first.');
      if(!original){const current=responseRef.current,shown=mode==='retryOriginal'?displayedRetry.current:current?{directionId:current.direction.id,token:current.summaryToken,revision:current.direction.draftRevision}:null;
        if(!current||!shown||shown.token!==intent.summaryToken||shown.revision!==intent.baseRevision||current.direction.draftRevision!==intent.baseRevision||localRef.current.text.trim()||localRef.current.attachment||localRef.current.pendingSave||contextPatches(baseline.current,contextRef.current,current.direction).length){updateLocal(value=>({...value,generationIntent:undefined}));await flushLocal();assertEpoch(version);throw new Error('Your draft or input changed. Review it before generating.');}
      }
      setCanConfirmGeneration(false);setGenerationError(null);sent=true;
      const result=await api('/api/generation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)});assertEpoch(version);
      setCtx(value=>({...value,generationTaskId:result.id,state:'generating'}));return result;
    }catch(error){
      if(version!==epoch.current)return;
      const failure=error as Error&{status?:number};
      if(sent&&failure.status&&failure.status>=400&&failure.status<500&&failure.status!==408){updateLocal(value=>({...value,generationIntent:undefined}));await flushLocal();assertEpoch(version);setNotice(failure.message);}
      else if(sent)setGenerationError(`${failure.message} Submission status is unknown. Check the original request before continuing.`);
      else setNotice(failure.message);
    }finally{if(generationFlight.current===flight){generationFlight.current=null;setGenerationNetworkBusy(false);}}
  },[api,generationRequest,assertEpoch,setCtx,canConfirmGeneration,updateLocal,flushLocal]);
  const checkGeneration=useCallback(async()=>{
    const intent=localRef.current.generationIntent;if(!intent)return;const version=epoch.current;
    try{const result=await api(`/api/generation?requestKey=${encodeURIComponent(intent.requestKey)}`);assertEpoch(version);
      if(result.task){setCtx(value=>({...value,generationTaskId:result.task.id,state:'generating'}));setGenerationError(null);setCanConfirmGeneration(false);}
      else{setGenerationError('No accepted submission found. Confirm the original request with its original key.');setCanConfirmGeneration(true);}
    }catch(error){if(version===epoch.current)setGenerationError(error instanceof Error?error.message:'Could not check the original request.');}
  },[api,assertEpoch,setCtx]);
  const preferenceFlight=useRef<symbol|null>(null);
  const savePreferred=useCallback(async(preferredIterationId:string|null)=>{
    if(preferenceFlight.current)return;
    const version=epoch.current,current=responseRef.current;if(!current)return;
    if(saving.current||localRef.current.pendingSave?.attempted)throw new Error('Resolve the original draft save before changing the preferred result.');
    const flight=Symbol();preferenceFlight.current=flight;
    try{
      const prior=localRef.current.preferenceIntent;
      if(prior&&prior.preferredIterationId!==preferredIterationId)throw new Error('Retry the original preferred result change first.');
      const intent=prior??{directionId:current.direction.id,requestKey:newKey(),baseRevision:current.direction.draftRevision,preferredIterationId};
      updateLocal(value=>({...value,preferenceIntent:intent}));await flushLocal();assertEpoch(version);
      const {directionId,...body}=intent;
      const result=await api(`/api/workspace/directions/${directionId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assertEpoch(version);
      const updated={...responseRef.current!,direction:result.direction,summaryToken:null};responseRef.current=updated;setResponse(updated);displayedSummary.current=null;
      baseline.current={...baseline.current,preferredIterationId:result.direction.preferredIterationId};setCtx(value=>({...value,preferredIterationId:result.direction.preferredIterationId}));
      updateLocal(value=>({...value,preferenceIntent:undefined,pendingSave:value.pendingSave?{...value.pendingSave,baseRevision:result.direction.draftRevision,requestKey:newKey()}:null}));await flushLocal();assertEpoch(version);
    }catch(error){const status=(error as {status?:number}).status;if(version===epoch.current&&status&&status>=400&&status<500){updateLocal(value=>({...value,preferenceIntent:undefined}));}throw error;}finally{if(preferenceFlight.current===flight)preferenceFlight.current=null;}
  },[api,assertEpoch,flushLocal,setCtx,updateLocal]);
  const sourceFingerprint=()=>JSON.stringify([responseRef.current?.direction.id,contextRef.current.promptText,contextRef.current.negativePromptText,contextRef.current.generationParams,contextRef.current.v2PromptState,contextRef.current.promptControls,contextRef.current.expert,localRef.current.text,localRef.current.attachmentName]);
  const previewSource=useCallback(async(kind:'empty'|'analysis'|'iteration'|'template',id?:string)=>{
    const version=epoch.current;
    await initialization.current;assertEpoch(version);
    const fingerprint=sourceFingerprint(),attachment=localRef.current.attachment,revision=responseRef.current?.direction.draftRevision??null;
    const value=kind==='empty'?{}:await api(`/api/${kind==='iteration'?'generation':kind==='template'?'templates':'analysis'}/${id}`);
    assertEpoch(version);if(fingerprint!==sourceFingerprint()||attachment!==localRef.current.attachment)throw new Error("Your draft changed. Review the source again.");setPreview({kind,id,value,fingerprint,attachment,revision});
  },[api]);
  const activateSource=useCallback(async(selected:{kind:'empty'|'analysis'|'iteration'|'template';id?:string;fingerprint?:string;attachment?:Blob|null;revision?:number|null})=>{
    const version=epoch.current;
    const fingerprint=selected.fingerprint??sourceFingerprint(),attachment=selected.attachment===undefined?localRef.current.attachment:selected.attachment;
    const assertSource=()=>{assertEpoch(version);if(fingerprint!==sourceFingerprint()||attachment!==localRef.current.attachment)throw new Error('Your draft changed. Review the source again; the original continuation is preserved.');};
    if(selected.fingerprint&&(selected.fingerprint!==sourceFingerprint()||selected.attachment!==localRef.current.attachment||selected.revision!==(responseRef.current?.direction.draftRevision??null)))throw new Error("Your draft changed. Cancel and review a new preview.");
    await invalidateQuick();assertEpoch(version);
    await saveDraft();await flushLocal();assertEpoch(version);
    if(selected.fingerprint&&(selected.fingerprint!==sourceFingerprint()||selected.attachment!==localRef.current.attachment))throw new Error("Your draft changed while saving. Review the source again.");
    const transition=localRef.current.transition;
    const key=transition&&transition.kind===selected.kind&&transition.id===selected.id?transition.requestKey:newKey();
    updateLocal(value=>({...value,transition:{...(transition?.requestKey===key?transition:{}),requestKey:key,kind:selected.kind,id:selected.id}}));await flushLocal();assertSource();
    const created=transition?.requestKey===key&&transition.createdDirectionId?{direction:{id:transition.createdDirectionId}}:await api('/api/workspace/directions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:key,title:'Untitled direction',sourceKind:selected.kind,...(selected.id?{sourceId:selected.id}:{})})});
    assertEpoch(version);
    updateLocal(value=>({...value,transition:{requestKey:key,kind:selected.kind,id:selected.id,createdDirectionId:created.direction.id}}));await flushLocal();assertSource();
    const target=await api(`/api/workspace/directions/${created.direction.id}`) as DirectionResponse;
    assertSource();
    const committedEpoch=++epoch.current;preferenceFlight.current=null;displayedSummary.current=null;displayedRetry.current=null;generationFlight.current=null;setGenerationNetworkBusy(false);setGenerationError(null);setCanConfirmGeneration(false);turnFlight.current=null;setTurnSending(false);commandFlight.current=null;setCommandBusy(false);setEvents([]);pageRef.current={page:1,throughSequence:0,hasMore:false};responseRef.current=target;setResponse(target);
    const projected=contextFromDirection(target);baseline.current=projected;contextRef.current=projected;setCtx(projected);
    updateLocal(value=>blankLocal(value.userId,target.direction.id));await flushLocal();assertEpoch(committedEpoch);setPreview(null);
    window.history.replaceState(null,'',`/workspace?directionId=${target.direction.id}`);
  },[saveDraft,flushLocal,setCtx,updateLocal,api]);
  const analyzeNewReference=useCallback(async(sourceAssetId:string)=>{
    const version=epoch.current;
    await saveDraft();await flushLocal();assertEpoch(version);
    const prior=localRef.current.newReferenceIntent;
    const intent=prior?.sourceAssetId===sourceAssetId?prior:{sourceAssetId,requestKey:newKey()};
    updateLocal(value=>({...value,newReferenceIntent:intent}));await flushLocal();assertEpoch(version);
    const task=await api('/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)});
    assertEpoch(version);
    if(!task.directionId)throw new Error('The analysis direction could not be restored. Retry to read the original request.');
    assertEpoch(version);
    const target=await api(`/api/workspace/directions/${task.directionId}`) as DirectionResponse;
    assertEpoch(version);
    const committedEpoch=++epoch.current;generationFlight.current=null;setGenerationNetworkBusy(false);setGenerationError(null);setCanConfirmGeneration(false);turnFlight.current=null;setTurnSending(false);commandFlight.current=null;setCommandBusy(false);setEvents([]);pageRef.current={page:1,throughSequence:0,hasMore:false};responseRef.current=target;setResponse(target);
    const projected=contextFromDirection(target);baseline.current=projected;contextRef.current=projected;setCtx(projected);
    updateLocal(value=>blankLocal(value.userId,target.direction.id));await flushLocal();assertEpoch(committedEpoch);
    window.history.replaceState(null,'',`/workspace?directionId=${target.direction.id}`);
    return task as {id:string;directionId:string};
  },[saveDraft,flushLocal,api,updateLocal,setCtx]);
  const loadEvents=useCallback(async(older=false)=>{
    const id=responseRef.current?.direction.id;if(!id)return;
    const previous=pageRef.current;
    if(older&&!previous.hasMore)return;
    const page=older?previous.page+1:1;
    const result=await api(`/api/workspace/directions/${id}/events?page=${page}&pageSize=20${older?`&throughSequence=${previous.throughSequence}`:''}`);
    if(responseRef.current?.direction.id!==id)return;
    const pending=localRef.current.turnIntent;
    if(pending&&result.items.some((event:WorkspaceEvent)=>event.requestKey===pending.requestKey)){
      updateLocal(value=>({...value,turnIntent:undefined,references:[],text:value.text===pending.text?'':value.text}));await flushLocal();setNotice(null);
    }
    if(older||!previous.throughSequence)pageRef.current={page,throughSequence:result.throughSequence,hasMore:result.hasMore};
    setEvents(current=>Array.from(new Map([...current,...result.items].map((item:WorkspaceEvent)=>[item.id,item])).values()).sort((a,b)=>a.sequence-b.sequence));
  },[api,updateLocal,flushLocal]);
  const commandFlight=useRef<symbol|null>(null);
  const [commandBusy,setCommandBusy]=useState(false);
  const proposalCommand=useCallback(async(action:'apply'|'discard'|'undo',event:WorkspaceEvent,changes?:DraftPatch[],checkOnly=false)=>{
    if(commandFlight.current||pausedRef.current)return;
    const flight=Symbol('command');commandFlight.current=flight;setCommandBusy(true);const version=epoch.current;
    try{
      await initialization.current;assertEpoch(version);
      let intent=localRef.current.commandIntent;
      if(!intent){await saveDraft();assertEpoch(version);}
      const direction=responseRef.current?.direction;if(!direction)throw new Error('Restore this direction first.');
      if(intent&&(intent.eventId!==event.id||intent.action!==action))throw new Error('Check the original proposal command before starting another action.');
      if(intent&&!localRef.current.commandReceipt){
        const found=await api(`/api/workspace/directions/${direction.id}/events?requestKey=${encodeURIComponent(intent.requestKey)}`);assertEpoch(version);
        if(found.event){updateLocal(value=>({...value,commandReceipt:found.event.id}));await flushLocal();assertEpoch(version);}
        else if(checkOnly){setNotice('No accepted command found. Confirm the original command to retry with its original request key.');return;}
      }
      if(!intent){intent={requestKey:newKey(),action,eventId:event.id,baseRevision:direction.draftRevision,...(action==='apply'?{changes:structuredClone(changes??event.changes)}:{})};updateLocal(value=>({...value,commandIntent:intent}));await flushLocal();assertEpoch(version);}
      if(!localRef.current.commandReceipt){
        const result=await api(`/api/workspace/directions/${direction.id}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)});assertEpoch(version);
        if(!result.event?.id)throw new Error('The command response is unknown. Check its status before retrying.');
        updateLocal(value=>({...value,commandReceipt:result.event.id}));await flushLocal();assertEpoch(version);
      }
      await readDirection(direction.id,false);assertEpoch(version);await loadEvents();assertEpoch(version);
      updateLocal(value=>({...value,commandIntent:undefined,commandReceipt:undefined}));await flushLocal();assertEpoch(version);setNotice(null);
    }catch(error){
      if(version!==epoch.current)return;
      const failure=error as Error&{status?:number};
      if(!localRef.current.commandReceipt&&failure.status&&failure.status>=400&&failure.status<500){updateLocal(value=>({...value,commandIntent:undefined}));await readDirection(responseRef.current!.direction.id,false).catch(()=>{});assertEpoch(version);await loadEvents().catch(()=>{});}
      setNotice(localRef.current.commandReceipt?'The command was saved. Refresh its result; no command will be sent again.':failure.status===409?'The draft changed. Your latest edits are preserved. Request a new proposal against the latest draft.':failure.message);throw error;
    }finally{if(commandFlight.current===flight){commandFlight.current=null;setCommandBusy(false);}}
  },[saveDraft,assertEpoch,api,updateLocal,flushLocal,readDirection,loadEvents]);
  const acceptTurn=useCallback(async(event:WorkspaceEvent)=>{
    setEvents(current=>Array.from(new Map([...current,event].map(item=>[item.id,item])).values()).sort((a,b)=>a.sequence-b.sequence));
    if(localRef.current.turnIntent?.requestKey===event.requestKey){const original=localRef.current.turnIntent;updateLocal(value=>({...value,turnIntent:undefined,references:[],text:value.text===original.text?'':value.text}));await flushLocal();}
  },[flushLocal,updateLocal]);
  const checkTurn=useCallback(async()=>{
    const intent=localRef.current.turnIntent,id=responseRef.current?.direction.id;if(!intent||!id)return;
    const version=epoch.current;const result=await api(`/api/workspace/directions/${id}/events?requestKey=${encodeURIComponent(intent.requestKey)}`);assertEpoch(version);
    if(result.event)await acceptTurn(result.event);else setNotice('No accepted message found. Confirm sending the original message with its original request key.');
  },[api,acceptTurn,assertEpoch]);
  const sendTurn=useCallback(async(references:ContextReference[]=[],retryOf?:WorkspaceEvent)=>{
    if(turnFlight.current||pausedRef.current)return;
    if(events.some(event=>event.kind==='turn'&&event.state==='processing'))return;
    const flight=Symbol('turn');turnFlight.current=flight;setTurnSending(true);const version=epoch.current;
    try{
      await initialization.current;assertEpoch(version);
      if(!responseRef.current){setNotice('Attach one reference image to start analysis. Your message is preserved.');return;}
      await saveDraft();assertEpoch(version);
      let intent=localRef.current.turnIntent;
      if(intent){const result=await api(`/api/workspace/directions/${responseRef.current.direction.id}/events?requestKey=${encodeURIComponent(intent.requestKey)}`);assertEpoch(version);if(result.event){await acceptTurn(result.event);return;}}
      if(!intent){
        if(retryOf&&retryOf.state!=='failed')return;
        const text=retryOf?.inputText??localRef.current.text;if(!text.trim())return;
        // Only a rendered current summary may accompany language authorization.
        intent={requestKey:newKey(),baseRevision:responseRef.current.direction.draftRevision,text,references:retryOf?.references??(references.length?references:localRef.current.references??[]),summaryToken:!retryOf&&!localRef.current.attachment&&displayedSummary.current?.revision===responseRef.current.direction.draftRevision&&displayedSummary.current.token===responseRef.current.summaryToken?displayedSummary.current.token:null,...(retryOf?{retryOf:retryOf.id}:{})};
        updateLocal(value=>({...value,turnIntent:intent}));await flushLocal();assertEpoch(version);
      }
      const result=await api(`/api/workspace/directions/${responseRef.current.direction.id}/turns`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)});assertEpoch(version);
      if(result.event)await acceptTurn(result.event);else throw new Error('The message response is unknown. Check its status before sending again.');
      setNotice(null);
    }catch(error){
      if(version!==epoch.current)return;
      const failure=error as Error&{status?:number;body?:{event?:WorkspaceEvent}};
      if(failure.body?.event)await acceptTurn(failure.body.event);
      else if(failure.status&&failure.status>=400&&failure.status<500){updateLocal(value=>({...value,turnIntent:undefined}));await flushLocal();}
      setNotice(failure.body?.event?'The message failed. Your input is preserved in the conversation.':failure.message);
    }finally{if(turnFlight.current===flight){turnFlight.current=null;setTurnSending(false);}}
  },[events,api,saveDraft,acceptTurn,updateLocal,flushLocal,assertEpoch]);
  useEffect(()=>{
    if(!response?.direction.id)return;
    void loadEvents().catch(()=>{});
    let timer:ReturnType<typeof setTimeout>|null=null,stopped=false,interval=2000;
    const poll=async()=>{
      if(stopped||document.visibilityState==='hidden'||pausedRef.current)return;
      try{const result=await readDirection(response.direction.id,false);if(result)await loadEvents();}catch{}
      interval=Math.min(5000,interval+500);if(!stopped)timer=setTimeout(poll,interval);
    };
    const visibility=()=>{if(timer)clearTimeout(timer);if(document.visibilityState==='visible')void poll();};
    timer=setTimeout(poll,interval);document.addEventListener('visibilitychange',visibility);
    return()=>{stopped=true;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[response?.direction.id,loadEvents,readDirection]);
  // plan-10（AC-21）：恢复期对未确认保存只做一次同键回执读取——
  // 命中则保留已保存事实并标记 recovered；未命中保持 unknown 等用户显式重试。
  const memorySaveCheckedRef=useRef<string|null>(null);
  useEffect(()=>{
    const intent=local.memorySaveIntent;
    if(!options||!intent||intent.state!=='unknown'||response?.direction.id===undefined)return;
    if(memorySaveLiveUnknownRef.current)return;
    if(memorySaveCheckedRef.current===intent.requestKey)return;
    memorySaveCheckedRef.current=intent.requestKey;
    void(async()=>{
      try{
        const res=await fetch(`/api/workspace/directions/${response.direction!.id}/events?requestKey=${encodeURIComponent('memory:'+intent.requestKey)}`);
        if(!res.ok)return;
        const data=await res.json() as {event?:{memoryId?:string|null}|null};
        if(!data.event?.memoryId)return;
        // 幂等提交：仅当意图仍是同一 requestKey 时落 committed（防陈旧回写）
        updateLocal(value=>value.memorySaveIntent?.requestKey===intent.requestKey?{...value,memorySaveIntent:{...value.memorySaveIntent,state:'committed',committedMemoryId:data.event!.memoryId,recovered:true,form:null}}:value);
      }catch{/* 回执查询失败保持 unknown，恢复仍为只读 */}
    })();
  },[response?.direction.id,local.memorySaveIntent?.state,local.memorySaveIntent?.requestKey,options,updateLocal]);
  return {
    restoreDerivedPrompt:()=>setCtx(current=>({...current,derivePromptRevision:responseRef.current?.direction.draftRevision,expert:{...current.expert,customPromptDirty:false},v2PromptState:current.v2PromptState?{...current.v2PromptState,outputMode:'standard',customPrompt:''}:null})),
    canonicalAnalysis:response?{id:response.direction.analysisTaskId,status:response.source.analysisStatus}:null,
    directionId:response?.direction.id??null,direction:response?.direction??null,summaryToken:response?.summaryToken??null,
    generationReadiness:response?.readiness,generationSubmissionUnknown:response?.activeTask?.dispatchState==='unknown'||!!local.generationIntent&&!ctx.generationTaskId,
    generationSummary:response?.summaryToken&&!local.pendingSave&&compileWorkspacePrompt(response.direction.draft,response.source.recipe,response.source.variables).text.trim()?{directionId:response.direction.id,token:response.summaryToken,revision:response.direction.draftRevision,prompt:compileWorkspacePrompt(response.direction.draft,response.source.recipe,response.source.variables).text,negative:response.direction.draft.negativePromptText,params:response.direction.draft.params,binding:response.capabilities?`${response.capabilities.binding.provider}: ${response.capabilities.binding.providerModelId}`:undefined}:null,
    sendGeneration,checkGeneration,generationNetworkBusy,generationError,canConfirmGeneration,
    armQuick,quickArmed,quickNotice,invalidateQuick,acceptQuickAnalysisReceipt,
    markSummaryDisplayed,markRetryDisplayed:(value:GenerationSummary)=>{displayedRetry.current=value;},
    clearGenerationIntent:()=>updateLocal(value=>({...value,generationIntent:undefined})),
    turnSending,sendTurn,checkTurn,commandBusy,proposalCommand,
    recoverCommand:(checkOnly=true)=>{const intent=localRef.current.commandIntent;return intent?proposalCommand(intent.action,{id:intent.eventId} as WorkspaceEvent,intent.changes,checkOnly):Promise.resolve();},
    referenceMessage:(reference:ContextReference,text?:string)=>updateLocal(value=>({...value,text:text??value.text,references:[...(value.references??[]).filter(r=>r.kind!==reference.kind||r.id!==reference.id),reference]})),
    removeReference:(reference:ContextReference)=>updateLocal(value=>({...value,references:(value.references??[]).filter(r=>r.kind!==reference.kind||r.id!==reference.id)})),
    localDraft:local,saveState,writesPaused:paused,agentNotice:notice,events,hasEarlier:pageRef.current.hasMore,sourcePreview:preview,
    rememberView,setMessage:(text:string)=>updateLocal(value=>({...value,text})),attach,flushLocal,saveDraft,ensureDirection,prepareAnalysis,
    captureIdentity:()=>epoch.current,isCurrentIdentity:(version:number)=>epoch.current===version,
    captureAnalysisAttachment:()=>draftAttachments(localRef.current),
    acceptAnalysisAttachment:(sent:ReturnType<typeof draftAttachments>)=>updateLocal(value=>withAttachments(value,draftAttachments(value).filter(item=>!sent.some(reference=>reference.file===item.file)))),
    getAttachments:()=>draftAttachments(localRef.current),
    removeAttachment:(file:Blob)=>{void invalidateQuick();updateLocal(value=>withAttachments({...value,requestKeys:{...value.requestKeys,analysis:newKey()}},draftAttachments(value).filter(item=>item.file!==file)));},
    rememberAttachmentUpload:(file:Blob,uploaded:NonNullable<LocalWorkspaceDraft['uploaded']>)=>updateLocal(value=>withAttachments(value,draftAttachments(value).map(item=>item.file===file?{...item,uploaded}:item))),
    getUploaded:()=>localRef.current.uploaded,
    getGenerationParams:()=>contextRef.current.generationParams,
    rememberUpload:(uploaded:NonNullable<LocalWorkspaceDraft['uploaded']>)=>updateLocal(value=>({...withAttachments(value,draftAttachments(value).map((item,index)=>index===0?{...item,uploaded}:item)),uploaded})),
    retryAnalysis:()=>updateLocal(value=>({...value,analysisRetryOf:contextRef.current.analysisTaskId??undefined,requestKeys:{...value.requestKeys,analysis:newKey()}})),
    savePreferred,previewSource,activateSource,confirmSource:()=>preview?activateSource(preview):Promise.resolve(),cancelSource:()=>setPreview(null),loadEarlier:()=>loadEvents(true),
    refreshDirection:()=>responseRef.current?readDirection(responseRef.current.direction.id,false):Promise.resolve(undefined),
    generationRequest,analyzeNewReference,
    setAgentNotice:setNotice,
    reconnect:async()=>{if(responseRef.current)await readDirection(responseRef.current.direction.id,false);else {const session=await api('/api/auth/session');if(!session.user?.id||session.user.id!==options?.userId)throw new Error('Sign in to the original account before reconnecting.');if(localRef.current.directionId!=='unsent')await readDirection(localRef.current.directionId,false);}pausedRef.current=false;setPaused(false);await invalidateQuick();setNotice('Connected. Review local edits before saving; no previous action was replayed.');},
    exportDraft:()=>JSON.stringify({...localRef.current,attachment:localRef.current.attachment?{name:localRef.current.attachmentName,type:localRef.current.attachment.type,size:localRef.current.attachment.size}:null},null,2),
    memorySave:{intent:local.memorySaveIntent??null,keyFor:memorySaveKeyFor,update:updateMemorySaveIntent},
  };
}
