"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
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
import { FloatingGenerateButton } from "@/components/workspace/floating-generate-button";
import { HistoryStrip } from "@/components/workspace/history-strip";
import {
  HistoryDetailDialog,
  type HistoryDetail,
} from "@/components/workspace/history-detail-dialog";
import { GenerationDialog } from "@/components/workspace/generation-dialog";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";
import { hasUnresolvedVariables } from "@/lib/template-parser";
import type { TemplateVariable } from "@/types/models";

/** L1 degradation threshold: show queueing hint after 60s */
const QUEUEING_THRESHOLD_MS = 60_000;

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
  const { data: historyData } = useHistoryList(true);
  const { restore: restoreHistory } = useHistoryRestore();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
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
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
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
    ws.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(
    async (params: { aspectRatio: AspectRatio; quality: Quality }) => {
      if (!ws.analysisTaskId) {
        setGenerationDialogOpen(true);
        ws.setError("Missing analysis task. Please analyze again before generating.", "generation");
        return;
      }
      const prompt = (resolvedPromptText || ws.promptText).trim();
      if (!prompt || hasUnresolvedVariables(prompt)) return;

      // L2: block when generation service unavailable
      if (ws.degradation.generationUnavailable) return;

      try {
        setGenerationDialogOpen(true);
        const res = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisTaskId: ws.analysisTaskId,
            promptText: prompt,
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
      ws.analysisTaskId,
      resolvedPromptText,
      ws.promptText,
      ws.degradation.generationUnavailable,
      ws.negativePromptText,
    ],
  );

  const handleGenerateRetry = useCallback(() => {
    ws.clearError();
    // Clear degradation state
    ws.setGenerationUnavailable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyHistoryRestore = useCallback(
    (restoredData: RestoredData) => {
      setResolvedPromptText(restoredData.promptSnapshot);
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
    [],
  );

  const handleHistorySelect = useCallback(
    async (id: string) => {
      setSelectedHistoryId(id);
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

  const activePromptText = (resolvedPromptText || ws.promptText).trim();
  const isWorkspaceBusy =
    ws.state === "uploading" ||
    ws.state === "analyzing" ||
    ws.state === "generating";
  const canGenerate =
    !!activePromptText &&
    !hasUnresolvedVariables(activePromptText) &&
    !isWorkspaceBusy &&
    !ws.degradation.generationUnavailable;
  const generateDisabledReason = !activePromptText
    ? "Analyze or write a prompt before generating"
    : hasUnresolvedVariables(activePromptText)
      ? "Resolve template variables before generating"
      : ws.degradation.generationUnavailable
        ? "Generation is temporarily unavailable"
        : isWorkspaceBusy
          ? "Wait for the current workspace task to finish"
          : "Generate image";

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

      if (isTypingTarget || !canGenerate) return;

      event.preventDefault();
      void handleGenerate(generationParams);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGenerate, generationParams, handleGenerate]);

  const historyItems = (historyData ?? []).slice(0, 20).map((item) => ({
    id: item.id,
    resultFileUrl: item.resultFileUrl,
    createdAt: item.createdAt,
  }));

  return (
    <div className="h-full overflow-hidden">
      {/* 中央Workspace */}
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <h1 className="sr-only">Workspace</h1>

        {/* Compact StatusBar */}
        <StatusBar
          state={ws.state}
          error={ws.error}
          resultImageUrl={ws.resultImageUrl}
          promptText={ws.promptText}
          manualModeOverride={manualModeOverride}
          onModeChange={handleModeChange}
          onReplace={handleReplace}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceThreeColumnLayout
            reference={
              <ReferenceCard
                state={ws.state}
                referenceImageUrl={ws.referenceImageUrl}
                isUploading={isUploading || ws.state === "uploading"}
                uploadProgress={progress}
                recipe={ws.recipe}
                error={ws.error}
                degradation={ws.degradation}
                onFileSelected={handleFileSelected}
                onReplace={handleReplace}
                onRetry={handleAnalysisRetry}
              />
            }
            recipe={<RecipeCard state={ws.state} recipe={ws.recipe} />}
            prompt={
              <PromptCard
                state={ws.state}
                promptText={ws.promptText}
                negativePromptText={ws.negativePromptText}
                templateContent={ws.analysisTemplateContent}
                templateVariables={ws.analysisTemplateVariables}
                templateStatus={ws.analysisTemplateStatus}
                templateReason={ws.analysisTemplateReason}
                templateKey={ws.analysisTaskId}
                params={generationParams}
                onResolvedPromptChange={handleResolvedPromptChange}
                onTemplateVariablesChange={setCurrentTemplateVariables}
                onNegativePromptChange={ws.setNegativePromptText}
                onParamsChange={setGenerationParams}
                onSaveTemplate={handleOpenTemplateSave}
              />
            }
          />
        </div>

        <FloatingGenerateButton
          state={ws.state}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          onGenerate={() => void handleGenerate(generationParams)}
        />

        <HistoryStrip
          historyItems={historyItems}
          selectedId={selectedHistoryId}
          onSelect={handleHistorySelect}
          onViewAll={() => router.push("/history")}
        />

        <GenerationDialog
          open={generationDialogOpen}
          state={ws.state}
          resultImageUrl={ws.resultImageUrl}
          error={ws.error}
          generationQueueing={ws.degradation.generationQueueing}
          onClose={() => setGenerationDialogOpen(false)}
          onRetry={() => {
            handleGenerateRetry();
            if (ws.state !== "generating") {
              void handleGenerate(generationParams);
            }
          }}
        />

        <HistoryDetailDialog
          open={historyDetailOpen}
          detail={historyDetail}
          onRestore={handleHistoryRestore}
          onClose={() => setHistoryDetailOpen(false)}
        />

        {/* Template Save Dialog */}
        <TemplateSaveDialog
          open={showTemplateSaveDialog}
          initialContent={templateSaveContent || ws.promptText}
          initialVariables={currentTemplateVariables}
          sourceAnalysisTaskId={ws.analysisTaskId ?? undefined}
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
