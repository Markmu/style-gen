"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFileStore } from "@/components/landing/use-file-store";
import { useWorkspaceState } from "@/hooks/use-workspace-state";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { StatusBar } from "@/components/workspace/status-bar";
import { WorkspaceCanvas } from "@/components/workspace/workspace-canvas";
import { DecisionPanel } from "@/components/workspace/decision-panel";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";

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
      reject(new Error("无法加载图片"));
    };
    img.src = typeof file === "string" ? file : URL.createObjectURL(file);
  });
}

export default function WorkspacePage() {
  const fileStore = useFileStore();
  const ws = useWorkspaceState();
  const { upload, progress, isUploading } = useUpload();
  const { data: analysisData } = useAnalysis(ws.analysisTaskId);
  const { data: generationData } = useGeneration(ws.generationTaskId);
  const hasConsumedFile = useRef(false);
  const analysisStartTime = useRef<number | null>(null);
  const generationStartTime = useRef<number | null>(null);


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
      ws.completeAnalysis(
        analysisData.recipe,
        analysisData.promptText ?? "",
        analysisData.negativePromptText ?? "",
      );
    } else if (analysisData.status === "failed") {
      ws.failAnalysis(
        analysisData.errorMessage ?? "分析失败",
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
    } else if (generationData.status === "failed") {
      ws.failGeneration(generationData.errorMessage ?? "生成失败");
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
        error: data.error ?? "请求失败",
        code: data.code,
        retryable: data.retryable,
      };
    } catch {
      return { error: "请求失败" };
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
          err instanceof Error ? err.message : "上传失败",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload],
  );

  const handleReplace = useCallback(() => {
    ws.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(() => {
    if (!ws.assetId || !ws.referenceImageUrl) return;
    ws.clearError();
    // Clear degradation state
    ws.setAnalysisUnavailable(false);
    void (async () => {
      try {
        ws.startUpload();
        ws.completeUpload(ws.assetId!, ws.referenceImageUrl!);

        const dimensions = await getImageDimensions(ws.referenceImageUrl!);
        const analysisRes = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: ws.assetId,
            fileUrl: ws.referenceImageUrl,
            width: dimensions.width,
            height: dimensions.height,
            mimeType: ws.mimeType ?? "image/jpeg",
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
          err instanceof Error ? err.message : "重试失败",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.assetId, ws.referenceImageUrl, ws.mimeType]);

  const handleGenerate = useCallback(
    async (params: { aspectRatio: AspectRatio; quality: Quality }) => {
      if (!ws.analysisTaskId) return;

      // L2: block when generation service unavailable
      if (ws.degradation.generationUnavailable) return;

      try {
        const res = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisTaskId: ws.analysisTaskId,
            promptText: ws.promptText,
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
          err instanceof Error ? err.message : "生成请求失败",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.analysisTaskId, ws.promptText, ws.negativePromptText, ws.degradation.generationUnavailable],
  );

  const handleGenerateRetry = useCallback(() => {
    ws.clearError();
    // Clear degradation state
    ws.setGenerationUnavailable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[var(--surface-base)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="sr-only">工作区</h1>

        {/* StatusBar */}
        <StatusBar
          state={ws.state}
          error={ws.error}
          resultImageUrl={ws.resultImageUrl}
          onReplace={handleReplace}
        />

        {/* Two-column grid layout (T01) */}
        <div className="mt-6 grid grid-cols-[1fr_380px] gap-6">
          {/* Left column: Canvas */}
          <div className="min-w-[55%]">
            <WorkspaceCanvas
              state={ws.state}
              referenceImageUrl={ws.referenceImageUrl}
              resultImageUrl={ws.resultImageUrl}
              recipe={ws.recipe}
              isUploading={isUploading || ws.state === "uploading"}
              uploadProgress={progress}
              onFileSelected={handleFileSelected}
              onReplace={handleReplace}
            />
          </div>

          {/* Right column: Decision Panel */}
          <div className="min-w-[360px] max-w-[420px] space-y-6">

            <DecisionPanel
              state={ws.state}
              recipe={ws.recipe}
              promptText={ws.promptText}
              negativePromptText={ws.negativePromptText}
              isRecipeExpanded={ws.isRecipeExpanded}
              degradation={ws.degradation}
              error={ws.error}
              resultImageUrl={ws.resultImageUrl}
              onPromptChange={ws.setPromptText}
              onNegativePromptChange={ws.setNegativePromptText}
              onToggleRecipeExpanded={ws.toggleRecipeExpanded}
              onGenerate={handleGenerate}
              onRetry={handleRetry}
              onReplace={handleReplace}
              onGenerateRetry={handleGenerateRetry}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
