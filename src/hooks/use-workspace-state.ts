"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
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
import { isVisualRecipeV2Success } from "@/lib/visual-recipe";
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
function loadPersistedState(): Partial<WorkspacePersistedState> | null {
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

export function useWorkspaceState(): WorkspaceContext & WorkspaceActions {
  // 尝试从 sessionStorage 恢复状态
  const getInitialState = (): WorkspaceContext => {
    if (typeof window !== "undefined") {
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
      writePersistedStateSync(toPersistedState(next));
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
    if (typeof window === "undefined") return;

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
    flush,
    enterHistoryRestored,
    exitHistoryRestored,
  };
}
