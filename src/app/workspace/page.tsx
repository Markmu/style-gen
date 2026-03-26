"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFileStore } from "@/components/landing/use-file-store";
import { useWorkspaceState } from "@/hooks/use-workspace-state";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { UploadZone } from "@/components/workspace/upload-zone";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";
import { RecipeCard } from "@/components/workspace/recipe-card";
import { PromptEditor } from "@/components/workspace/prompt-editor";
import {
  GeneratePanel,
  type AspectRatio,
  type Quality,
} from "@/components/workspace/generate-panel";
import { GenerationProgress } from "@/components/workspace/generation-progress";
import { ResultDisplay } from "@/components/workspace/result-display";
import { ErrorDisplay, type ApiErrorCode } from "@/components/workspace/error-display";
import { RetryButton } from "@/components/workspace/retry-button";
import { ComparisonView } from "@/components/workspace/comparison-view";

/** L1 降级阈值：轮询超过 60 秒展示排队提示 */
const QUEUEING_THRESHOLD_MS = 60_000;

/** 获取图片的真实尺寸 */
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

  // L1 降级：分析轮询超过 60 秒展示排队提示
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

  // L1 降级：生成轮询超过 60 秒展示排队提示
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

  /** 解析 API 错误响应，提取 code 和 retryable */
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
    // 清除降级状态（刷新后重置）
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

      // L2: 生成服务不可用时阻止
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
    // 清除降级状态
    ws.setGenerationUnavailable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAnalyzing = ws.state === "analyzing";
  const isGenerating = ws.state === "generating";
  const showRecipe =
    (ws.state === "analysis_ready" ||
      ws.state === "generating" ||
      ws.state === "generation_ready") &&
    ws.recipe;
  const showPromptEditor =
    ws.state === "analysis_ready" ||
    ws.state === "generating" ||
    ws.state === "generation_ready";
  const showGeneratePanel =
    ws.state === "analysis_ready" ||
    ws.state === "generating" ||
    ws.state === "generation_ready";
  const showGenerationResult =
    ws.state === "generation_ready" && ws.resultImageUrl && !ws.error;
  const showGenerationError =
    ws.state === "generation_ready" && ws.error?.stage === "generation";

  // L3 降级检测：分析完成但无 recipe 且有 errorStage === "llm"
  const isL3Degraded =
    ws.state === "analysis_ready" && !ws.recipe && !!ws.promptText;

  // 分析错误（非分析中状态）使用结构化 ErrorDisplay
  const showAnalysisError =
    ws.state === "idle" && ws.error && ws.error.stage !== "generation";

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">工作区</h1>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Left column: Reference image + Comparison view */}
          <div className="space-y-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">参考图</h2>
            <UploadZone
              referenceImageUrl={ws.referenceImageUrl}
              isUploading={isUploading || ws.state === "uploading"}
              uploadProgress={progress}
              onFileSelected={handleFileSelected}
              onReplace={handleReplace}
            />

            {/* Comparison view: shown when generation is ready */}
            {showGenerationResult && ws.referenceImageUrl && ws.resultImageUrl && (
              <ComparisonView
                referenceImageUrl={ws.referenceImageUrl}
                resultImageUrl={ws.resultImageUrl}
              />
            )}
          </div>

          {/* Right column: Analysis results + Generation */}
          <div className="space-y-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">分析结果</h2>

            {/* L4 降级提示：分析服务不可用 */}
            {ws.degradation.analysisUnavailable && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <p className="text-sm font-medium text-orange-800">
                  分析服务暂时不可用，请稍后重试
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  已有分析结果仍可查看和编辑
                </p>
              </div>
            )}

            {/* Analysis progress with L1 queueing hint */}
            {isAnalyzing && !ws.degradation.analysisQueueing && (
              <AnalysisProgress
                isAnalyzing={isAnalyzing}
                error={null}
                onRetry={handleRetry}
              />
            )}

            {/* L1 降级：分析排队提示 */}
            {isAnalyzing && ws.degradation.analysisQueueing && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      分析排队中，请耐心等待
                    </p>
                    <p className="text-xs text-yellow-600">
                      当前请求较多，处理可能需要更长时间
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis error with structured ErrorDisplay */}
            {showAnalysisError && ws.error && (
              <div className="space-y-3">
                {ws.error.code ? (
                  <ErrorDisplay
                    code={ws.error.code as ApiErrorCode}
                    message={ws.error.message}
                    retryable={ws.error.retryable ?? true}
                    onRetry={handleRetry}
                    onReplace={handleReplace}
                  />
                ) : (
                  <AnalysisProgress
                    isAnalyzing={false}
                    error={ws.error}
                    onRetry={handleRetry}
                  />
                )}
              </div>
            )}

            {/* L3 降级提示：LLM 失败，展示原始视觉分析 + 手动编写 Prompt 提示 */}
            {isL3Degraded && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  AI 结构化处理失败，已降级为原始分析结果
                </p>
                <p className="mt-1 text-xs text-amber-600">
                  您可以基于以下原始分析结果手动编写或调整 Prompt
                </p>
              </div>
            )}

            {/* Recipe card */}
            {showRecipe && ws.recipe && <RecipeCard recipe={ws.recipe} />}

            {/* Prompt editor */}
            {showPromptEditor && (
              <PromptEditor
                promptText={ws.promptText}
                negativePromptText={ws.negativePromptText}
                onPromptChange={ws.setPromptText}
                onNegativePromptChange={ws.setNegativePromptText}
              />
            )}

            {/* L2 降级提示：生成服务不可用 */}
            {ws.degradation.generationUnavailable && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <p className="text-sm font-medium text-orange-800">
                  图片生成服务暂时不可用
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  分析结果和 Prompt 编辑功能仍可使用
                </p>
              </div>
            )}

            {/* Generate panel */}
            {showGeneratePanel && (
              <GeneratePanel
                workspaceState={ws.state}
                onGenerate={handleGenerate}
                disabled={ws.degradation.generationUnavailable}
              />
            )}

            {/* Generation progress with L1 queueing hint */}
            {isGenerating && !ws.degradation.generationQueueing && (
              <GenerationProgress isGenerating={isGenerating} />
            )}

            {/* L1 降级：生成排队提示 */}
            {isGenerating && ws.degradation.generationQueueing && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      生成排队中，请耐心等待
                    </p>
                    <p className="text-xs text-yellow-600">
                      当前请求较多，生成可能需要更长时间
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Generation error with structured ErrorDisplay + retry */}
            {showGenerationError && ws.error && (
              <div className="space-y-3">
                {ws.error.code ? (
                  <ErrorDisplay
                    code={ws.error.code as ApiErrorCode}
                    message={ws.error.message}
                    retryable={ws.error.retryable ?? true}
                    onRetry={handleGenerateRetry}
                  />
                ) : (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">生成失败</p>
                    <p className="mt-1 text-xs text-red-600">{ws.error.message}</p>
                    <div className="mt-3">
                      <RetryButton type="generation" onRetry={handleGenerateRetry} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Result display */}
            {showGenerationResult && ws.resultImageUrl && generationData && (
              <ResultDisplay
                resultImageUrl={ws.resultImageUrl}
                promptSnapshot={generationData.promptSnapshot}
                negativePromptSnapshot={generationData.negativePromptSnapshot}
                params={generationData.params}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
