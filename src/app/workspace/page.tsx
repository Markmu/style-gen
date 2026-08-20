"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useFileStore } from "@/components/landing/use-file-store";
import {
  consumePendingIterationRestore,
  useWorkspaceState,
  type WorkspaceState,
} from "@/hooks/use-workspace-state";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { useHistoryList } from "@/hooks/use-history-list";
import { useHistoryRestore, type RestoredData } from "@/hooks/use-history-restore";
import { WorkspaceThreeColumnLayout } from "@/components/workspace/workspace-three-column-layout";
import { ReferenceCard } from "@/components/workspace/reference-card";
import { RecipeCard } from "@/components/workspace/recipe-card";
import { PromptCard } from "@/components/workspace/prompt-card";
import { HistoryStrip } from "@/components/workspace/history-strip";
import { OutputCard } from "@/components/workspace/output-card";
import { WorkspaceBottomBar } from "@/components/workspace/workspace-bottom-bar";
import { AiCopilotRibbon } from "@/components/workspace/ai-copilot-ribbon";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";
import {
  previewHistoryItems,
  previewNegativePrompt,
  previewPrompt,
  previewRecipe,
  previewReferenceImageUrl,
  previewTemplateContent,
  previewTemplateVariables,
} from "@/components/workspace/workspace-preview-data";
import {
  HistoryDetailDialog,
  type HistoryDetail,
} from "@/components/workspace/history-detail-dialog";
import { GenerationDialog } from "@/components/workspace/generation-dialog";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";
import { hasUnresolvedVariables } from "@/lib/template-parser";
import {
  deriveEvidenceFacets,
  type EvidenceFacetId,
} from "@/lib/evidence-facets";
import { derivePromptProvenanceSpans } from "@/lib/prompt-provenance";
import { deriveRenderReadiness } from "@/lib/render-readiness";
import type { GenerationParams, TemplateVariable } from "@/types/models";
import {
  isVisualRecipeV2Success,
  toLegacyVisualRecipe,
} from "@/lib/visual-recipe";

/** L1 degradation threshold: show queueing hint after 60s */
const QUEUEING_THRESHOLD_MS = 60_000;
const EVIDENCE_COPILOT_PREVIEW = "evidence-copilot";
const previewDegradation = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

/**
 * L1 degradation: while `state` keeps polling in `activeState`, raise the
 * queueing flag once past QUEUEING_THRESHOLD_MS; reset it on any other state.
 */
function useQueueingDegradationTimer(
  state: WorkspaceState,
  activeState: "analyzing" | "generating",
  queueing: boolean,
  setQueueing: (queueing: boolean) => void,
): void {
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (state !== activeState) {
      startTimeRef.current = null;
      if (queueing) {
        setQueueing(false);
      }
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const timer = setInterval(() => {
      if (
        startTimeRef.current &&
        Date.now() - startTimeRef.current > QUEUEING_THRESHOLD_MS &&
        !queueing
      ) {
        setQueueing(true);
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

interface RestoredSourceContext {
  sourceAnalysisTaskId: string | null;
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  variables: TemplateVariable[];
}

/** Get real image dimensions */
function getImageDimensions(
  file: File | string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Unable to load image"));
    };
    img.src = typeof file === "string" ? file : URL.createObjectURL(file);
  });
}

/** Parse API error response */
async function parseApiError(
  res: Response,
): Promise<{ error: string; code?: string; retryable?: boolean }> {
  try {
    const data = (await res.json()) as {
      error?: string;
      code?: string;
      retryable?: boolean;
    };
    return {
      error: data.error ?? "Request failed",
      code: data.code,
      retryable: data.retryable,
    };
  } catch {
    return { error: "Request failed" };
  }
}

function deriveHistoryStripStatus(options: {
  isPreview: boolean;
  isError: boolean;
  isLoading: boolean;
}): "idle" | "loading" | "error" {
  if (options.isPreview) return "idle";
  if (options.isError) return "error";
  if (options.isLoading) return "loading";
  return "idle";
}

function WorkspacePageInner() {
  const fileStore = useFileStore();
  const ws = useWorkspaceState();
  const { upload, progress, isUploading } = useUpload();
  // plan-04: 恢复态（history_restored）不再轮询分析端点——快照已完整落地，
  // 轮询只会用过期分析结果覆盖恢复内容（或触发会话过期跳转）。
  // 上传新参考图/新分析开始后状态离开恢复态，轮询自然恢复。
  const { data: analysisData } = useAnalysis(
    ws.state === "history_restored" ? null : ws.analysisTaskId,
  );
  const { data: generationData } = useGeneration(ws.generationTaskId);
  const searchParams = useSearchParams();
  const browserPreviewParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("preview")
      : null;
  const isEvidencePreview =
    searchParams.get("preview") === EVIDENCE_COPILOT_PREVIEW ||
    browserPreviewParam === EVIDENCE_COPILOT_PREVIEW;
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
  } = useHistoryList(!isEvidencePreview);
  const { restore: restoreHistory, error: historyRestoreError } = useHistoryRestore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const hasConsumedFile = useRef(false);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [resolvedPromptText, setResolvedPromptText] = useState("");
  const [templateSaveContent, setTemplateSaveContent] = useState("");
  const [currentTemplateVariables, setCurrentTemplateVariables] = useState<TemplateVariable[]>([]);
  const [selectedFacetId, setSelectedFacetId] = useState<EvidenceFacetId | null>(null);
  const [referenceAspectRatio, setReferenceAspectRatio] = useState(4 / 5);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [restoredSourceContext, setRestoredSourceContext] =
    useState<RestoredSourceContext | null>(null);
  const [generationParams, setGenerationParams] = useState<{
    aspectRatio: AspectRatio;
    quality: Quality;
  }>({ aspectRatio: "1:1", quality: "standard" });

  // Template UI state
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const setWorkspacePromptText = ws.setPromptText;

  const handleOpenTemplateSave = useCallback((content: string) => {
    setTemplateSaveContent(content);
    setShowTemplateSaveDialog(true);
  }, []);

  const handleResolvedPromptChange = useCallback(
    (value: string) => {
      setResolvedPromptText(value);
      setWorkspacePromptText(value);
    },
    [setWorkspacePromptText],
  );

  // FEAT-04: templateId query 参数加载逻辑
  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (!templateId) return;

    let aborted = false;

    async function loadTemplate() {
      try {
        const res = await fetch(`/api/templates/${templateId}`);
        if (!res.ok) throw new Error("Template not found");
        const template = await res.json();

        if (aborted) return;

        setCurrentTemplateVariables(template.variables ?? []);
        setResolvedPromptText(template.content);
        ws.setPromptText(template.content);
        // plan-04（AC-02）：从 Style Memory 进入加载模板时记录 currentTemplateId，
        // 后续生成请求携带 sourceTemplateId（保障记录可按来源模板名搜索）
        ws.setRestoreContext({
          currentIterationId: null,
          currentTemplateId: templateId,
          previousResultUrl: null,
          restoredParams: null,
        });
      } catch {
        // Template not found或加载失败，静默处理（不阻塞用户）
        console.error("Failed to load template:", templateId);
      } finally {
        if (!aborted) {
          router.replace("/workspace");
        }
      }
    }

    void loadTemplate();

    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("templateId")]);

  // Handle file from landing page (T06 global state)
  useEffect(() => {
    if (hasConsumedFile.current) return;
    const pendingFile = fileStore.consumeFile();
    if (pendingFile) {
      hasConsumedFile.current = true;
      void handleFileSelected(pendingFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L1 degradation: analysis polling > 60s
  useQueueingDegradationTimer(
    ws.state,
    "analyzing",
    ws.degradation.analysisQueueing,
    ws.setAnalysisQueueing,
  );

  // L1 degradation: generation polling > 60s
  useQueueingDegradationTimer(
    ws.state,
    "generating",
    ws.degradation.generationQueueing,
    ws.setGenerationQueueing,
  );

  // Watch analysis polling results
  useEffect(() => {
    if (!analysisData) return;

    // Guard: ignore stale data from previous analysis task
    if (analysisData.id !== ws.analysisTaskId) return;

    if (analysisData.status === "completed") {
      const templateStatus = analysisData.analysisTemplateStatus ?? null;
      const analysisTemplateVariables = analysisData.analysisTemplateVariables ?? [];
      const hasAnalysisTemplate =
        (templateStatus === "ready" || templateStatus === "partial") &&
        !!analysisData.analysisTemplateContent &&
        analysisTemplateVariables.length > 0;
      setCurrentTemplateVariables(
        hasAnalysisTemplate ? analysisTemplateVariables : [],
      );
      setRestoredSourceContext(null);
      const nextPromptText = analysisData.promptText ?? "";
      setResolvedPromptText(nextPromptText);
      ws.completeAnalysis(
        analysisData.recipe,
        nextPromptText,
        analysisData.negativePromptText ?? "",
        {
          analysisTemplateContent: analysisData.analysisTemplateContent,
          analysisTemplateVariables,
          analysisTemplateStatus: templateStatus,
          analysisTemplateReason: analysisData.analysisTemplateReason,
        },
      );
    } else if (analysisData.status === "failed") {
      ws.failAnalysis(
        analysisData.errorMessage ?? "Analysis Failed",
        analysisData.errorStage ?? undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisData?.status, analysisData?.id]);

  // Watch generation polling results
  useEffect(() => {
    if (!generationData) return;

    // Guard: ignore stale data from previous generation task
    if (generationData.id !== ws.generationTaskId) return;

    if (generationData.status === "completed" && generationData.resultFileUrl) {
      ws.completeGeneration(generationData.resultFileUrl);
      setGenerationDialogOpen(true);
      // FEAT-02: Generation Complete后刷新历史列表
      queryClient.invalidateQueries({ queryKey: ["generation-history"] });
    } else if (generationData.status === "failed") {
      ws.failGeneration(generationData.errorMessage ?? "Generation Failed");
      setGenerationDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationData?.status, generationData?.id]);

  /** POST /api/analysis and enter the polling state; failures go through failAnalysis */
  const startAnalysisTask = useCallback(
    async (request: {
      assetId: string;
      fileUrl: string;
      width: number;
      height: number;
      mimeType: string;
    }) => {
      const analysisRes = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!analysisRes.ok) {
        const errData = await parseApiError(analysisRes);
        ws.failAnalysis(errData.error, undefined, errData.code, errData.retryable);
        return;
      }

      const analysisTask = (await analysisRes.json()) as { id: string };
      ws.startAnalysis(analysisTask.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      setRestoredSourceContext(null);
      ws.startUpload(file.type);
      try {
        const [{ assetId, fileUrl }, dimensions] = await Promise.all([
          upload(file),
          getImageDimensions(file),
        ]);
        ws.completeUpload(assetId, fileUrl);

        // Auto-trigger analysis
        await startAnalysisTask({
          assetId,
          fileUrl,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: file.type,
        });
      } catch (err) {
        ws.failAnalysis(
          err instanceof Error ? err.message : "Upload failed",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload],
  );

  const handleAnalysisRetry = useCallback(async () => {
    if (!ws.assetId || !ws.referenceImageUrl) return;

    ws.clearError();
    ws.setAnalysisUnavailable(false);

    try {
      const dimensions = await getImageDimensions(ws.referenceImageUrl);
      await startAnalysisTask({
        assetId: ws.assetId,
        fileUrl: ws.referenceImageUrl,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: ws.mimeType ?? "image/png",
      });
    } catch (err) {
      ws.failAnalysis(
        err instanceof Error ? err.message : "Analysis retry failed",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.assetId, ws.referenceImageUrl, ws.mimeType]);

  const handleReplace = useCallback(() => {
    setResolvedPromptText("");
    setCurrentTemplateVariables([]);
    setRestoredSourceContext(null);
    setReferenceAspectRatio(4 / 5);
    ws.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Apply a restored snapshot's page-level state: prompt, variables, params, source context */
  const applyRestoredSnapshot = useCallback(
    (restored: {
      promptSnapshot: string;
      params: GenerationParams;
      analysisTaskId: string | null;
      sourceAssetId: string | null;
      sourceImageUrl: string | null;
      variables: TemplateVariable[];
    }) => {
      setResolvedPromptText(restored.promptSnapshot);
      setCurrentTemplateVariables(restored.variables);
      setRestoredSourceContext({
        sourceAnalysisTaskId: restored.analysisTaskId,
        sourceAssetId: restored.sourceAssetId,
        sourceImageUrl: restored.sourceImageUrl,
        variables: restored.variables,
      });
      setGenerationParams({
        aspectRatio: restored.params.aspectRatio as AspectRatio,
        quality: restored.params.quality as Quality,
      });
    },
    [],
  );

  const applyHistoryRestore = useCallback(
    (restoredData: RestoredData | HistoryDetail) => {
      const sourceAssetId = restoredData.sourceAssetId ?? ws.assetId;
      const sourceImageUrl = restoredData.sourceImageUrl ?? ws.referenceImageUrl;
      applyRestoredSnapshot({
        promptSnapshot: restoredData.promptSnapshot,
        params: restoredData.params,
        analysisTaskId: restoredData.analysisTaskId,
        sourceAssetId,
        sourceImageUrl,
        variables: restoredData.variables ?? [],
      });
      ws.enterHistoryRestored(
        restoredData.resultFileUrl,
        restoredData.recipe,
        restoredData.promptSnapshot,
        restoredData.negativePromptSnapshot,
        restoredData.analysisTaskId,
        {
          sourceAssetId,
          sourceImageUrl,
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.assetId, ws.referenceImageUrl],
  );

  // plan-04: 消费 Iteration Memory 恢复载荷（模式与既有 useHistoryRestore 一致）。
  // ws 初始状态已按恢复快照以 history_restored 挂载（提示/排除项/配方/来源/
  // currentIterationId / currentTemplateId / 上一轮结果），这里应用页面级状态：
  // 输出参数、变量与来源上下文。恢复动作本身不触发任何生成请求（ADR-4）。
  const didConsumeIterationRestoreRef = useRef(false);
  const iterationRestoreAppliedRef = useRef(false);
  useEffect(() => {
    if (didConsumeIterationRestoreRef.current) return;
    didConsumeIterationRestoreRef.current = true;

    const payload = consumePendingIterationRestore();
    if (!payload) return;
    iterationRestoreAppliedRef.current = true;

    applyRestoredSnapshot(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // plan-04（架构 §6.3）: 恢复载荷应用后同步 flush——固化应用后的快照，
  // 确保通道中不再残留待应用标记（防重复应用）。
  const didFlushIterationRestoreRef = useRef(false);
  useEffect(() => {
    if (!iterationRestoreAppliedRef.current) return;
    if (ws.currentIterationId === null) return;
    if (didFlushIterationRestoreRef.current) return;
    didFlushIterationRestoreRef.current = true;
    ws.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.currentIterationId]);

  const openHistoryDetail = useCallback((detail: HistoryDetail) => {
    setHistoryDetail(detail);
    setHistoryDetailOpen(true);
  }, []);

  const handleHistorySelect = useCallback(
    async (id: string) => {
      try {
        const restoredData = await restoreHistory(id);
        openHistoryDetail({ id, ...restoredData });
      } catch (err) {
        console.error("Failed to load history detail:", err instanceof Error ? err.message : err);
      }
    },
    [restoreHistory, openHistoryDetail],
  );

  const handleHistoryRestore = useCallback(
    (id: string) => {
      if (historyDetail?.id === id) {
        applyHistoryRestore(historyDetail);
        setHistoryDetailOpen(false);
        return;
      }

      void restoreHistory(id)
        .then((restoredData) => {
          applyHistoryRestore(restoredData);
          setHistoryDetailOpen(false);
        })
        .catch((err) => {
          console.error("Failed to restore history:", err instanceof Error ? err.message : err);
        });
    },
    [applyHistoryRestore, historyDetail, restoreHistory],
  );

  const handlePreviewHistorySelect = useCallback(
    (id: string) => {
      openHistoryDetail({
        id,
        resultFileUrl: previewReferenceImageUrl,
        recipe: previewRecipe,
        promptSnapshot: previewPrompt,
        negativePromptSnapshot: previewNegativePrompt,
        params: generationParams,
        analysisTaskId: EVIDENCE_COPILOT_PREVIEW,
        sourceAssetId: "preview-reference-asset",
        sourceImageUrl: previewReferenceImageUrl,
        variables: previewTemplateVariables,
      });
    },
    [generationParams, openHistoryDetail],
  );

  // Effective (preview-or-live) values: Evidence Copilot preview substitutes
  // static fixtures; live mode derives everything from workspace state.
  const effectiveState = isEvidencePreview ? ("analysis_ready" as const) : ws.state;
  const effectiveReferenceImageUrl = isEvidencePreview
    ? previewReferenceImageUrl
    : ws.referenceImageUrl;
  const effectiveDegradation = isEvidencePreview
    ? previewDegradation
    : ws.degradation;

  // Recipe + evidence
  const effectiveRecipe = isEvidencePreview ? previewRecipe : ws.recipe;
  const effectiveLegacyRecipe = toLegacyVisualRecipe(effectiveRecipe);
  const hasStructuredRecipe = isVisualRecipeV2Success(effectiveRecipe);

  // Prompt text (a resolved edit wins over the mode's fallback)
  const effectivePromptText = isEvidencePreview ? previewPrompt : ws.promptText;
  const effectiveNegativePromptText = isEvidencePreview
    ? previewNegativePrompt
    : ws.negativePromptText;
  const activePromptText = (
    resolvedPromptText || (isEvidencePreview ? previewPrompt : ws.promptText)
  ).trim();

  // Analysis template
  const effectiveTemplateContent = isEvidencePreview
    ? previewTemplateContent
    : ws.analysisTemplateContent;
  const effectiveTemplateVariables = isEvidencePreview
    ? previewTemplateVariables
    : restoredSourceContext?.variables.length
      ? restoredSourceContext.variables
      : ws.analysisTemplateVariables;
  const effectiveTemplateStatus = isEvidencePreview
    ? ("ready" as const)
    : ws.analysisTemplateStatus;
  const effectiveTemplateReason = isEvidencePreview
    ? null
    : ws.analysisTemplateReason;
  const effectiveTemplateKey = isEvidencePreview
    ? EVIDENCE_COPILOT_PREVIEW
    : ws.analysisTaskId;
  const activePromptHasUnresolvedVariables = hasUnresolvedVariables(activePromptText);
  const evidenceFacets = useMemo(
    () => deriveEvidenceFacets(effectiveRecipe),
    [effectiveRecipe],
  );
  const promptProvenanceSpans = useMemo(
    () => derivePromptProvenanceSpans(activePromptText || effectivePromptText, evidenceFacets),
    [activePromptText, effectivePromptText, evidenceFacets],
  );
  const renderReadiness = useMemo(
    () =>
      deriveRenderReadiness({
        promptText: activePromptText,
        variables:
          currentTemplateVariables.length > 0
            ? currentTemplateVariables
            : effectiveTemplateVariables,
        hasUnresolvedVariables: activePromptHasUnresolvedVariables,
        facets: evidenceFacets,
        workspaceState: effectiveState,
        degradation: effectiveDegradation,
        error: isEvidencePreview ? null : ws.error,
        analysisTaskId: isEvidencePreview ? EVIDENCE_COPILOT_PREVIEW : ws.analysisTaskId,
      }),
    [
      activePromptHasUnresolvedVariables,
      activePromptText,
      currentTemplateVariables,
      effectiveDegradation,
      effectiveState,
      effectiveTemplateVariables,
      evidenceFacets,
      isEvidencePreview,
      ws.analysisTaskId,
      ws.error,
    ],
  );
  const canGenerate = renderReadiness.canGenerate;
  const generateDisabledReason = renderReadiness.disabledReason;
  // Template Save Dialog: custom V2 output mode starts from an empty variable set
  const isCustomV2OutputMode =
    hasStructuredRecipe && ws.v2PromptState?.outputMode === "custom";
  const templateSaveInitialVariables =
    currentTemplateVariables.length > 0
      ? currentTemplateVariables
      : effectiveTemplateVariables;

  const handleGenerate = useCallback(
    async (params: { aspectRatio: AspectRatio; quality: Quality }) => {
      if (!renderReadiness.canGenerate || !ws.analysisTaskId) return;

      try {
        setGenerationDialogOpen(true);
        const res = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisTaskId: ws.analysisTaskId,
            promptText: activePromptText,
            negativePromptText: ws.negativePromptText,
            params: {
              aspectRatio: params.aspectRatio,
              quality: params.quality,
            },
            // plan-04（AC-02 / PRD 业务规则 4）：从 Style Memory 进入（?templateId=）
            // 或恢复携带来源模板的迭代时，记录本次生成的来源模板，
            // 保障记录可按来源 Style Memory 名称搜索
            ...(ws.currentTemplateId
              ? { sourceTemplateId: ws.currentTemplateId }
              : {}),
          }),
        });

        if (!res.ok) {
          const errData = await parseApiError(res);
          ws.failGeneration(errData.error, errData.code, errData.retryable);
          return;
        }

        const task = (await res.json()) as { id: string; status: string };
        ws.startGeneration(task.id);
      } catch (err) {
        ws.failGeneration(
          err instanceof Error ? err.message : "Generation request failed",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activePromptText,
      renderReadiness.canGenerate,
      ws.analysisTaskId,
      ws.negativePromptText,
      ws.currentTemplateId,
    ],
  );

  const handleGenerateRetry = useCallback(() => {
    ws.clearError();
    ws.setGenerationUnavailable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      selectedFacetId &&
      !evidenceFacets.some((facet) => facet.id === selectedFacetId)
    ) {
      setSelectedFacetId(null);
    }
  }, [evidenceFacets, selectedFacetId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isTypingTarget =
        tagName === "textarea" ||
        tagName === "input" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (isTypingTarget || !canGenerate || isEvidencePreview) return;

      event.preventDefault();
      void handleGenerate(generationParams);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGenerate, generationParams, handleGenerate, isEvidencePreview]);

  const historyItems = (historyData ?? []).slice(0, 20).map((item) => ({
    id: item.id,
    resultFileUrl: item.resultFileUrl,
    createdAt: item.createdAt,
  }));
  const effectiveHistoryItems = isEvidencePreview
    ? previewHistoryItems
    : historyItems;
  const historyErrorStatus =
    historyError && "status" in historyError
      ? (historyError as { status?: number }).status
      : undefined;
  const historyStripStatus = deriveHistoryStripStatus({
    isPreview: isEvidencePreview,
    isError: isHistoryError,
    isLoading: isHistoryLoading,
  });
  const workspaceTitle = isEvidencePreview ? "Editorial Soft Light" : "Workspace";

  const handleHistoryContinueEditing = useCallback(
    (detail: HistoryDetail) => {
      applyHistoryRestore(detail);
      setHistoryDetailOpen(false);
    },
    [applyHistoryRestore],
  );

  return (
    <div className="h-full overflow-hidden">
      {/* 中央Workspace */}
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <WorkspaceTopBar title={workspaceTitle} subtitle="Reference to render workbench" />

        <AiCopilotRibbon
          state={effectiveState}
          recipe={effectiveLegacyRecipe}
          hasReference={!!effectiveReferenceImageUrl}
          hasPrompt={!!activePromptText}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          degradation={effectiveDegradation}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceThreeColumnLayout
            referenceAspectRatio={referenceAspectRatio}
            reference={
              <ReferenceCard
                state={effectiveState}
                referenceImageUrl={effectiveReferenceImageUrl}
                isUploading={
                  isEvidencePreview ? false : isUploading || ws.state === "uploading"
                }
                uploadProgress={isEvidencePreview ? 0 : progress}
                error={ws.error}
                onFileSelected={handleFileSelected}
                onReplace={handleReplace}
                onRetry={handleAnalysisRetry}
                onAspectRatioChange={setReferenceAspectRatio}
              />
            }
            recipe={
              <RecipeCard
                state={effectiveState}
                recipe={effectiveRecipe}
                facets={evidenceFacets}
                provenanceSpans={promptProvenanceSpans}
                selectedFacetId={selectedFacetId}
                onFacetSelect={setSelectedFacetId}
                enabledInvariantIds={ws.v2PromptState?.enabledInvariantIds}
                onInvariantToggle={(invariantId) => {
                  ws.setV2PromptState((current) => ({
                    ...current,
                    enabledInvariantIds: current.enabledInvariantIds.includes(invariantId)
                      ? current.enabledInvariantIds.filter((id) => id !== invariantId)
                      : [...current.enabledInvariantIds, invariantId],
                  }));
                }}
              />
            }
            prompt={
              <PromptCard
                state={effectiveState}
                promptText={effectivePromptText}
                negativePromptText={effectiveNegativePromptText}
                error={ws.error}
                templateContent={effectiveTemplateContent}
                templateVariables={effectiveTemplateVariables}
                templateStatus={effectiveTemplateStatus}
                templateReason={effectiveTemplateReason}
                templateKey={effectiveTemplateKey}
                recipe={effectiveRecipe}
                v2PromptState={ws.v2PromptState}
                provenanceSpans={promptProvenanceSpans}
                selectedFacetId={selectedFacetId}
                onV2PromptStateChange={ws.setV2PromptState}
                onResolvedPromptChange={handleResolvedPromptChange}
                onTemplateVariablesChange={setCurrentTemplateVariables}
                onNegativePromptChange={ws.setNegativePromptText}
                onSaveTemplate={handleOpenTemplateSave}
                renderDock={
                  <OutputCard
                    state={effectiveState}
                    params={generationParams}
                    readiness={renderReadiness}
                    onParamsChange={setGenerationParams}
                    onGenerate={(params) => {
                      if (isEvidencePreview) return;
                      void handleGenerate(params);
                    }}
                  />
                }
              />
            }
          />
        </div>

        {/* plan-04: 上一轮结果展示位——恢复携带 resultFileUrl 的迭代时保留可见 */}
        {ws.previousResultUrl && (
          <div
            data-testid="previous-result-preview"
            className="mx-4 mb-2 flex shrink-0 items-center gap-3 rounded-lg bg-[var(--surface-low)]/72 p-2 ring-1 ring-[var(--border-static)] sm:mx-6 lg:mx-8"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ws.previousResultUrl}
              alt="Previous iteration result"
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Previous result
              </p>
              <p className="truncate text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
                Kept from the restored iteration for reference. Your next render
                creates a new iteration.
              </p>
            </div>
          </div>
        )}

        <WorkspaceBottomBar
          history={
            <HistoryStrip
              historyItems={effectiveHistoryItems}
              status={historyStripStatus}
              errorMessage={historyError?.message}
              errorStatus={historyErrorStatus}
              onSelect={
                isEvidencePreview ? handlePreviewHistorySelect : handleHistorySelect
              }
              onViewAll={() => router.push("/workspace/iterations?status=all")}
            />
          }
        />

        <GenerationDialog
          open={generationDialogOpen}
          state={ws.state}
          resultImageUrl={ws.resultImageUrl}
          error={ws.error}
          generationQueueing={ws.degradation.generationQueueing}
          onClose={() => setGenerationDialogOpen(false)}
          onRetry={() => {
            const shouldOnlyRecoverService =
              ws.degradation.generationUnavailable ||
              ws.error?.code === "SERVICE_UNAVAILABLE";
            handleGenerateRetry();
            if (!shouldOnlyRecoverService && ws.state !== "generating") {
              void handleGenerate(generationParams);
            }
          }}
        />

        <HistoryDetailDialog
          open={historyDetailOpen}
          detail={historyDetail}
          onRestore={handleHistoryRestore}
          onContinueEditing={handleHistoryContinueEditing}
          onClose={() => setHistoryDetailOpen(false)}
          restoreError={historyRestoreError?.message}
        />

        {/* Template Save Dialog */}
        <TemplateSaveDialog
          open={showTemplateSaveDialog}
          initialContent={templateSaveContent || effectivePromptText}
          initialVariables={
            isCustomV2OutputMode ? [] : templateSaveInitialVariables
          }
          sourceAnalysisTaskId={
            restoredSourceContext?.sourceAnalysisTaskId ?? ws.analysisTaskId ?? undefined
          }
          sourceAssetId={restoredSourceContext?.sourceAssetId ?? ws.assetId}
          sourceImageUrl={
            restoredSourceContext?.sourceImageUrl ?? effectiveReferenceImageUrl
          }
          onSave={() => {
            setShowTemplateSaveDialog(false);
          }}
          onClose={() => setShowTemplateSaveDialog(false)}
        />
      </div>
    </div>
  );
}

/** Suspense boundary for useSearchParams() (Next.js 15 requirement) */
export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Loading...</div>}>
      <WorkspacePageInner />
    </Suspense>
  );
}
