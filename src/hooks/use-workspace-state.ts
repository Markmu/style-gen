"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisTemplateStatus,
  TemplateVariable,
  VisualRecipe,
} from "@/types/models";

/** sessionStorage key */
const STORAGE_KEY = "style-gen-workspace-state";

/** 当前持久化数据版本号 */
const STORAGE_VERSION = 3;

/** 持久化状态结构（仅包含需要跨页面恢复的关键数据） */
export interface WorkspacePersistedState {
  version: number;
  assetId: string | null;
  referenceImageUrl: string | null;
  analysisTaskId: string | null;
  recipe: VisualRecipe | null;
  promptText: string;
  negativePromptText: string;
  analysisTemplateContent: string | null;
  analysisTemplateVariables: TemplateVariable[];
  analysisTemplateStatus: AnalysisTemplateStatus | null;
  analysisTemplateReason: string | null;
  generationTaskId: string | null;
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
  recipe: VisualRecipe | null;
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
};

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

/** 清除 sessionStorage */
function clearPersistedState(): void {
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
  // 数据校验：至少需要有 assetId 和 referenceImageUrl 才算有效状态
  if (!persisted.assetId || !persisted.referenceImageUrl) {
    return null;
  }

  return {
    state: "analysis_ready", // Resume directly into the analysis-complete state.
    assetId: persisted.assetId,
    referenceImageUrl: persisted.referenceImageUrl,
    analysisTaskId: persisted.analysisTaskId ?? null,
    recipe: persisted.recipe ?? null,
    promptText: persisted.promptText ?? "",
    negativePromptText: persisted.negativePromptText ?? "",
    analysisTemplateContent: persisted.analysisTemplateContent ?? null,
    analysisTemplateVariables: persisted.analysisTemplateVariables ?? [],
    analysisTemplateStatus: persisted.analysisTemplateStatus ?? null,
    analysisTemplateReason: persisted.analysisTemplateReason ?? null,
    generationTaskId: persisted.generationTaskId ?? null,
    resultImageUrl: null, // 不恢复 resultImageUrl，因为 URL 可能已失效
    mimeType: null,
    error: null,
    degradation: initialDegradation,
    isRecipeExpanded: false,
  };
}

export interface WorkspaceActions {
  startUpload: (mimeType?: string) => void;
  completeUpload: (assetId: string, fileUrl: string) => void;
  startAnalysis: (taskId: string) => void;
  completeAnalysis: (
    recipe: VisualRecipe | null,
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
  setError: (message: string, stage?: string) => void;
  clearError: () => void;
  reset: () => void;
  setAnalysisQueueing: (queueing: boolean) => void;
  setGenerationQueueing: (queueing: boolean) => void;
  setGenerationUnavailable: (unavailable: boolean) => void;
  setAnalysisUnavailable: (unavailable: boolean) => void;
  toggleRecipeExpanded: () => void;
  enterHistoryRestored: (
    resultFileUrl: string,
    recipe: VisualRecipe | null,
    promptSnapshot: string,
    negativePromptSnapshot: string,
    analysisTaskId: string
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
    }));
  }, []);

  const startAnalysis = useCallback((taskId: string) => {
    setCtx((prev) => ({
      ...prev,
      state: "analyzing",
      analysisTaskId: taskId,
      error: null,
    }));
  }, []);

  const completeAnalysis = useCallback(
    (
      recipe: VisualRecipe | null,
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
    clearPersistedState();
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

  const enterHistoryRestored = useCallback(
    (
      resultFileUrl: string,
      recipe: VisualRecipe | null,
      promptSnapshot: string,
      negativePromptSnapshot: string,
      analysisTaskId: string
    ) => {
      setCtx((prev) => ({
        ...prev,
        state: "history_restored",
        resultImageUrl: resultFileUrl,
        recipe,
        promptText: promptSnapshot,
        negativePromptText: negativePromptSnapshot,
        analysisTemplateContent: null,
        analysisTemplateVariables: [],
        analysisTemplateStatus: null,
        analysisTemplateReason: null,
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
      clearPersistedState();
      return;
    }

    const persistedState: WorkspacePersistedState = {
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
    };

    persistState(persistedState);
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
    setError,
    clearError,
    reset,
    setAnalysisQueueing,
    setGenerationQueueing,
    setGenerationUnavailable,
    setAnalysisUnavailable,
    toggleRecipeExpanded,
    enterHistoryRestored,
    exitHistoryRestored,
  };
}
