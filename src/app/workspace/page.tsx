"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useFileStore } from "@/components/landing/use-file-store";
import { useWorkspaceState } from "@/hooks/use-workspace-state";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { useHistoryList } from "@/hooks/use-history-list";
import { useHistoryRestore, type RestoredData } from "@/hooks/use-history-restore";
import { StatusBar } from "@/components/workspace/status-bar";
import { WorkspaceThreeColumnLayout } from "@/components/workspace/workspace-three-column-layout";
import { ReferenceCard } from "@/components/workspace/reference-card";
import { RecipeCard } from "@/components/workspace/recipe-card";
import { PromptCard } from "@/components/workspace/prompt-card";
import type { TopMode } from "@/components/workspace/top-mode-switcher";
import { HistoryStrip } from "@/components/workspace/history-strip";
import { OutputCard } from "@/components/workspace/output-card";
import { WorkspaceBottomBar } from "@/components/workspace/workspace-bottom-bar";
import { AiCopilotRibbon } from "@/components/workspace/ai-copilot-ribbon";
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
import type { TemplateVariable } from "@/types/models";

/** L1 degradation threshold: show queueing hint after 60s */
const QUEUEING_THRESHOLD_MS = 60_000;
const EVIDENCE_COPILOT_PREVIEW = "evidence-copilot";
const previewDegradation = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

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

function WorkspacePageInner() {
  const fileStore = useFileStore();
  const ws = useWorkspaceState();
  const { upload, progress, isUploading } = useUpload();
  const { data: analysisData } = useAnalysis(ws.analysisTaskId);
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
  const analysisStartTime = useRef<number | null>(null);
  const generationStartTime = useRef<number | null>(null);
  const previousWorkspaceState = useRef(ws.state);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [resolvedPromptText, setResolvedPromptText] = useState("");
  const [templateSaveContent, setTemplateSaveContent] = useState("");
  const [currentTemplateVariables, setCurrentTemplateVariables] = useState<TemplateVariable[]>([]);
  const [manualModeOverride, setManualModeOverride] = useState<TopMode | null>(null);
  const [selectedFacetId, setSelectedFacetId] = useState<EvidenceFacetId | null>(null);
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

  const handleModeChange = useCallback((mode: TopMode) => {
    setManualModeOverride(mode);
  }, []);

  const handleResolvedPromptChange = useCallback(
    (value: string) => {
      setResolvedPromptText(value);
      setWorkspacePromptText(value);
    },
    [setWorkspacePromptText],
  );

  useEffect(() => {
    if (previousWorkspaceState.current === ws.state) return;
    previousWorkspaceState.current = ws.state;
    setManualModeOverride(null);
  }, [ws.state]);

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
  useEffect(() => {
    if (ws.state !== "analyzing") {
      analysisStartTime.current = null;
      if (ws.degradation.analysisQueueing) {
        ws.setAnalysisQueueing(false);
      }
      return;
    }

    if (!analysisStartTime.current) {
      analysisStartTime.current = Date.now();
    }

    const timer = setInterval(() => {
      if (
        analysisStartTime.current &&
        Date.now() - analysisStartTime.current > QUEUEING_THRESHOLD_MS &&
        !ws.degradation.analysisQueueing
      ) {
        ws.setAnalysisQueueing(true);
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.state]);

  // L1 degradation: generation polling > 60s
  useEffect(() => {
    if (ws.state !== "generating") {
      generationStartTime.current = null;
      if (ws.degradation.generationQueueing) {
        ws.setGenerationQueueing(false);
      }
      return;
    }

    if (!generationStartTime.current) {
      generationStartTime.current = Date.now();
    }

    const timer = setInterval(() => {
      if (
        generationStartTime.current &&
        Date.now() - generationStartTime.current > QUEUEING_THRESHOLD_MS &&
        !ws.degradation.generationQueueing
      ) {
        ws.setGenerationQueueing(true);
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.state]);

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

  /** Parse API error response */
  const parseApiError = async (
    res: Response,
  ): Promise<{ error: string; code?: string; retryable?: boolean }> => {
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
  };

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
        const analysisRes = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId,
            fileUrl,
            width: dimensions.width,
            height: dimensions.height,
            mimeType: file.type,
          }),
        });

        if (!analysisRes.ok) {
          const errData = await parseApiError(analysisRes);
          ws.failAnalysis(errData.error, undefined, errData.code, errData.retryable);
          return;
        }

        const analysisTask = (await analysisRes.json()) as { id: string };
        ws.startAnalysis(analysisTask.id);
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
      const analysisRes = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: ws.assetId,
          fileUrl: ws.referenceImageUrl,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: ws.mimeType ?? "image/png",
        }),
      });

      if (!analysisRes.ok) {
        const errData = await parseApiError(analysisRes);
        ws.failAnalysis(errData.error, undefined, errData.code, errData.retryable);
        return;
      }

      const analysisTask = (await analysisRes.json()) as { id: string };
      ws.startAnalysis(analysisTask.id);
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
    ws.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyHistoryRestore = useCallback(
    (restoredData: RestoredData | HistoryDetail) => {
      const restoredVariables = restoredData.variables ?? [];
      setResolvedPromptText(restoredData.promptSnapshot);
      setCurrentTemplateVariables(restoredVariables);
      setRestoredSourceContext({
        sourceAnalysisTaskId: restoredData.analysisTaskId,
        sourceAssetId: restoredData.sourceAssetId ?? ws.assetId,
        sourceImageUrl: restoredData.sourceImageUrl ?? ws.referenceImageUrl,
        variables: restoredVariables,
      });
      setGenerationParams({
        aspectRatio: restoredData.params.aspectRatio as AspectRatio,
        quality: restoredData.params.quality as Quality,
      });
      ws.enterHistoryRestored(
        restoredData.resultFileUrl,
        restoredData.recipe,
        restoredData.promptSnapshot,
        restoredData.negativePromptSnapshot,
        restoredData.analysisTaskId,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.assetId, ws.referenceImageUrl],
  );

  const handleHistorySelect = useCallback(
    async (id: string) => {
      try {
        const restoredData = await restoreHistory(id);
        setHistoryDetail({
          id,
          resultFileUrl: restoredData.resultFileUrl,
          recipe: restoredData.recipe,
          promptSnapshot: restoredData.promptSnapshot,
          negativePromptSnapshot: restoredData.negativePromptSnapshot,
          params: restoredData.params,
          analysisTaskId: restoredData.analysisTaskId,
          sourceAssetId: restoredData.sourceAssetId,
          sourceImageUrl: restoredData.sourceImageUrl,
          variables: restoredData.variables,
        });
        setHistoryDetailOpen(true);
      } catch (err) {
        console.error("Failed to load history detail:", err instanceof Error ? err.message : err);
      }
    },
    [restoreHistory],
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
      setHistoryDetail({
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
      setHistoryDetailOpen(true);
    },
    [generationParams],
  );

  const effectiveState = isEvidencePreview ? ("analysis_ready" as const) : ws.state;
  const effectiveReferenceImageUrl = isEvidencePreview
    ? previewReferenceImageUrl
    : restoredSourceContext?.sourceImageUrl ?? ws.referenceImageUrl;
  const effectiveRecipe = isEvidencePreview ? previewRecipe : ws.recipe;
  const effectivePromptText = isEvidencePreview ? previewPrompt : ws.promptText;
  const effectiveNegativePromptText = isEvidencePreview
    ? previewNegativePrompt
    : ws.negativePromptText;
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
  const effectiveDegradation = isEvidencePreview
    ? previewDegradation
    : ws.degradation;
  const activePromptText = (
    isEvidencePreview
      ? resolvedPromptText || previewPrompt
      : resolvedPromptText || ws.promptText
  ).trim();
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
  const historyStripStatus = isEvidencePreview
    ? "idle"
    : isHistoryError
      ? "error"
      : isHistoryLoading
        ? "loading"
        : "idle";

  const handleHistoryContinueEditing = useCallback(
    (detail: HistoryDetail) => {
      applyHistoryRestore(detail);
      setManualModeOverride("editing");
      setHistoryDetailOpen(false);
    },
    [applyHistoryRestore],
  );

  const handleHistorySaveStyleMemory = useCallback(
    (detail: HistoryDetail) => {
      applyHistoryRestore(detail);
      setTemplateSaveContent(detail.promptSnapshot);
      setShowTemplateSaveDialog(true);
      setHistoryDetailOpen(false);
    },
    [applyHistoryRestore],
  );

  return (
    <div className="h-full overflow-hidden">
      {/* 中央Workspace */}
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <h1 className="sr-only">Workspace</h1>

        {/* Compact StatusBar */}
        <StatusBar
          state={effectiveState}
          error={ws.error}
          resultImageUrl={ws.resultImageUrl}
          promptText={effectivePromptText}
          manualModeOverride={manualModeOverride}
          workspaceName={isEvidencePreview ? "Editorial Soft Light" : "Workspace"}
          workspaceSubtitle={
            isEvidencePreview ? "AI evidence workbench preview" : undefined
          }
          onModeChange={handleModeChange}
          onReplace={handleReplace}
        />

        <AiCopilotRibbon
          state={effectiveState}
          recipe={effectiveRecipe}
          hasReference={!!effectiveReferenceImageUrl}
          hasPrompt={!!activePromptText}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          degradation={effectiveDegradation}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceThreeColumnLayout
            reference={
              <ReferenceCard
                state={effectiveState}
                referenceImageUrl={effectiveReferenceImageUrl}
                isUploading={
                  isEvidencePreview ? false : isUploading || ws.state === "uploading"
                }
                uploadProgress={isEvidencePreview ? 0 : progress}
                recipe={effectiveRecipe}
                facets={evidenceFacets}
                selectedFacetId={selectedFacetId}
                error={ws.error}
                degradation={effectiveDegradation}
                onFileSelected={handleFileSelected}
                onReplace={handleReplace}
                onRetry={handleAnalysisRetry}
                onFacetSelect={setSelectedFacetId}
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
              />
            }
            prompt={
              <PromptCard
                state={effectiveState}
                promptText={effectivePromptText}
                negativePromptText={effectiveNegativePromptText}
                provenanceSpans={promptProvenanceSpans}
                selectedFacetId={selectedFacetId}
                error={ws.error}
                templateContent={effectiveTemplateContent}
                templateVariables={effectiveTemplateVariables}
                templateStatus={effectiveTemplateStatus}
                templateReason={effectiveTemplateReason}
                templateKey={effectiveTemplateKey}
                onResolvedPromptChange={handleResolvedPromptChange}
                onTemplateVariablesChange={setCurrentTemplateVariables}
                onNegativePromptChange={ws.setNegativePromptText}
                onSaveTemplate={handleOpenTemplateSave}
                onBackToEdit={() => setManualModeOverride("editing")}
                renderDock={
                  <OutputCard
                    state={effectiveState}
                    params={generationParams}
                    readiness={renderReadiness}
                    error={ws.error}
                    onParamsChange={setGenerationParams}
                    onGenerate={(params) => {
                      if (isEvidencePreview) return;
                      void handleGenerate(params);
                    }}
                    onRetry={handleGenerateRetry}
                    onSaveStyleMemory={() =>
                      handleOpenTemplateSave(activePromptText || effectivePromptText)
                    }
                    onBackToEdit={() => setManualModeOverride("editing")}
                  />
                }
              />
            }
          />
        </div>

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
              onViewAll={() => router.push("/history")}
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
          onSaveStyleMemory={handleHistorySaveStyleMemory}
          onClose={() => setHistoryDetailOpen(false)}
          restoreError={historyRestoreError?.message}
        />

        {/* Template Save Dialog */}
        <TemplateSaveDialog
          open={showTemplateSaveDialog}
          initialContent={templateSaveContent || effectivePromptText}
          initialVariables={
            currentTemplateVariables.length > 0
              ? currentTemplateVariables
              : effectiveTemplateVariables
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
