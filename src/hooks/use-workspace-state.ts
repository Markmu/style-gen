"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisualRecipe } from "@/types/models";

/** sessionStorage key */
const STORAGE_KEY = "style-gen-workspace-state";

/** 当前持久化数据版本号 */
const STORAGE_VERSION = 1;

/** 持久化状态结构（仅包含需要跨页面恢复的关键数据） */
export interface WorkspacePersistedState {
  version: number;
  assetId: string | null;
  referenceImageUrl: string | null;
  recipe: VisualRecipe | null;
  promptText: string;
  negativePromptText: string;
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
  /** 是否可重试 */
  retryable?: boolean;
}

/** 降级状态 */
export interface DegradationState {
  /** L1: 轮询超过 60 秒，展示排队提示 */
  analysisQueueing: boolean;
  /** L1: 生成轮询超过 60 秒，展示排队提示 */
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
  generationTaskId: string | null;
  resultImageUrl: string | null;
  mimeType: string | null;
  error: WorkspaceError | null;
  degradation: DegradationState;
  isRecipeExpanded: boolean;
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
      console.warn(`[workspace] 版本不匹配，清除旧数据: ${data.version} !== ${STORAGE_VERSION}`);
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[workspace] 读取 sessionStorage 失败:", err);
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
function createPersistWriter() {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (state: WorkspacePersistedState) => {
    if (typeof window === "undefined") return;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // 300ms debounce，避免频繁写入
    timeoutId = setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error("[workspace] 写入 sessionStorage 失败:", err);
      }
      timeoutId = null;
    }, 300);
  };
}

const persistState = createPersistWriter();

/** 清除 sessionStorage */
function clearPersistedState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("[workspace] 清除 sessionStorage 失败:", err);
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
    state: "analysis_ready", // 恢复后直接进入分析完成状态
    assetId: persisted.assetId,
    referenceImageUrl: persisted.referenceImageUrl,
    recipe: persisted.recipe ?? null,
    promptText: persisted.promptText ?? "",
    negativePromptText: persisted.negativePromptText ?? "",
    generationTaskId: persisted.generationTaskId ?? null,
    analysisTaskId: null, // 不恢复 analysisTaskId，因为任务可能已过期
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
  completeAnalysis: (recipe: VisualRecipe | null, promptText: string, negativePromptText: string) => void;
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
          console.log("[workspace] 从 sessionStorage 恢复状态");
          return restored;
        }
      }
    }
    return initialContext;
  };

  const [ctx, setCtx] = useState<WorkspaceContext>(getInitialState);
  const isRestoredRef = useRef(ctx !== initialContext);

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
    (recipe: VisualRecipe | null, promptText: string, negativePromptText: string) => {
      setCtx((prev) => ({
        ...prev,
        state: "analysis_ready",
        recipe,
        promptText,
        negativePromptText,
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
    // 仅在客户端执行，且跳过初始恢复时的写入
    if (typeof window === "undefined" || !isRestoredRef.current) return;

    const persistedState: WorkspacePersistedState = {
      version: STORAGE_VERSION,
      assetId: ctx.assetId,
      referenceImageUrl: ctx.referenceImageUrl,
      recipe: ctx.recipe,
      promptText: ctx.promptText,
      negativePromptText: ctx.negativePromptText,
      generationTaskId: ctx.generationTaskId,
    };

    persistState(persistedState);
  }, [
    ctx.assetId,
    ctx.referenceImageUrl,
    ctx.recipe,
    ctx.promptText,
    ctx.negativePromptText,
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
