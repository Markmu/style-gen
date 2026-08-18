"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisTemplateStatus,
  GenerationParams,
  StoredVisualRecipe,
  TemplateVariable,
  V2PromptWorkspaceState,
} from "@/types/models";
import { isVisualRecipeV2Success } from "@/lib/visual-recipe";
import type { WorkspaceSnapshot } from "@/lib/iterations/restore-guard";

/** sessionStorage key */
const STORAGE_KEY = "style-gen-workspace-state";

/** 当前持久化数据版本号 */
const STORAGE_VERSION = 4;

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

/** 从 sessionStorage 读取持久化状态 */
function loadPersistedState(): Partial<WorkspacePersistedState> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as WorkspacePersistedState;

    // 版本检查：未来可在此处处理数据迁移
    if (data.version !== STORAGE_VERSION) {
      console.warn(`[workspace] Storage version mismatch, clearing stale data: ${data.version} !== ${STORAGE_VERSION}`);
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[workspace] Failed to read sessionStorage:", err);
    // 静默清理损坏的数据
    try {
      sessionStorage.removeItem(STORAGE_KEY);
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
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    version: STORAGE_VERSION,
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
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("[workspace] Failed to clear sessionStorage:", err);
  }
}

/** 从持久化状态恢复到 WorkspaceContext */
function restoreFromPersistedState(
  persisted: Partial<WorkspacePersistedState>,
): WorkspaceContext | null {
  // plan-04: 恢复链路（待应用载荷或已恢复的工作区）以恢复态挂载——
  // 快照即真相：不重建 V2 结构化视图（提示为纯文本快照）、不恢复分析模板、
  // 不进入分析轮询，避免过期分析结果覆盖恢复内容。
  const isIterationRestored =
    !!persisted.pendingIterationRestore || !!persisted.currentIterationId;

  // 数据校验：普通状态至少需要有 assetId 和 referenceImageUrl 才算有效；
  // 恢复态豁免该校验——来源图缺失（旧记录）时其余字段照常恢复，
  // 来源位保持空态占位（plan-04 边界场景）。
  if (
    !isIterationRestored &&
    (!persisted.assetId || !persisted.referenceImageUrl)
  ) {
    return null;
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
  };
}

/** 由 ctx 组装持久化条目（plan-04 恢复上下文随自动持久化一并落盘） */
function toPersistedState(ctx: WorkspaceContext): WorkspacePersistedState {
  return {
    version: STORAGE_VERSION,
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
    setCtx((prev) => ({
      ...prev,
      state: "idle",
      error: { message, stage, code, retryable },
      degradation: {
        ...prev.degradation,
        analysisQueueing: false,
        // L4: 分析返回 SERVICE_UNAVAILABLE 时标记不可用
        analysisUnavailable: code === "SERVICE_UNAVAILABLE" ? true : prev.degradation.analysisUnavailable,
      },
    }));
  }, []);

  const startGeneration = useCallback((taskId: string) => {
    setCtx((prev) => ({
      ...prev,
      state: "generating",
      generationTaskId: taskId,
      resultImageUrl: null,
      error: null,
    }));
  }, []);

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

    // 初次渲染只Done恢复/初始化，不立即回写，避免覆盖已恢复状态。
    if (!didSkipInitialPersistRef.current) {
      didSkipInitialPersistRef.current = true;
      return;
    }

    if (!ctx.assetId || !ctx.referenceImageUrl) {
      // plan-04: 恢复态豁免——来源缺失的恢复快照仍保留在通道中
      //（守卫读取与来源模板标记依赖该上下文）
      if (!ctx.currentIterationId) {
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
    flush,
    enterHistoryRestored,
    exitHistoryRestored,
  };
}
