"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useFileStore } from "@/components/landing/use-file-store";
import { useWorkspaceState } from "@/hooks/use-workspace-state";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { useHistoryRestore } from "@/hooks/use-history-restore";
import { StatusBar } from "@/components/workspace/status-bar";
import { WorkspaceTwoPaneLayout } from "@/components/workspace/workspace-two-pane-layout";
import { AnalysisPane } from "@/components/workspace/analysis-pane";
import { EditingPane } from "@/components/workspace/editing-pane";
import { LightGeneratePanel } from "@/components/workspace/light-generate-panel";
import { GenerationDialog } from "@/components/workspace/generation-dialog";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";
import { HistoryPanel } from "@/components/workspace/history-panel";
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
      reject(new Error("无法加载图片"));
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
  const { restore: restoreHistory } = useHistoryRestore();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasConsumedFile = useRef(false);
  const analysisStartTime = useRef<number | null>(null);
  const generationStartTime = useRef<number | null>(null);
  const [generationDialogOpen, setGenerationDialogOpen] = useState(false);
  const [resolvedPromptText, setResolvedPromptText] = useState("");
  const [templateSaveContent, setTemplateSaveContent] = useState("");
  const [templateContent, setTemplateContent] = useState<string | null>(null);
  const [templateVariables, setTemplateVariables] = useState<TemplateVariable[]>([]);
  const [currentTemplateVariables, setCurrentTemplateVariables] = useState<TemplateVariable[]>([]);
  const [generationParams, setGenerationParams] = useState<{
    aspectRatio: AspectRatio;
    quality: Quality;
  }>({ aspectRatio: "1:1", quality: "standard" });

  // Template UI state
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const handleOpenTemplateSave = useCallback((content?: string) => {
    if (content !== undefined) {
      setTemplateSaveContent(content);
    }
    setShowTemplateSaveDialog(true);
  }, []);

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

        setTemplateContent(template.content);
        setTemplateVariables(template.variables ?? []);
        setCurrentTemplateVariables(template.variables ?? []);
        setResolvedPromptText(template.content);
        ws.setPromptText(template.content);
      } catch {
        // 模板不存在或加载失败，静默处理（不阻塞用户）
        console.error("加载模板失败:", templateId);
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
      setTemplateContent(null);
      setTemplateVariables([]);
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
      setGenerationDialogOpen(true);
      // FEAT-02: 生成完成后刷新历史列表
      queryClient.invalidateQueries({ queryKey: ["generation-history"] });
    } else if (generationData.status === "failed") {
      ws.failGeneration(generationData.errorMessage ?? "生成失败");
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
    setResolvedPromptText("");
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
      if (!ws.analysisTaskId) {
        setGenerationDialogOpen(true);
        ws.setError("缺少分析任务，请重新分析后再生成", "generation");
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
            negativePromptText: "",
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
    [
      ws.analysisTaskId,
      resolvedPromptText,
      ws.promptText,
      ws.degradation.generationUnavailable,
    ],
  );

  const handleGenerateRetry = useCallback(() => {
    ws.clearError();
    // Clear degradation state
    ws.setGenerationUnavailable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResolvedPromptChange = useCallback((value: string) => {
    setResolvedPromptText(value);
    ws.setPromptText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTemplateContent =
    templateContent ??
    (ws.analysisTemplateStatus === "ready" || ws.analysisTemplateStatus === "partial"
      ? ws.analysisTemplateContent
      : null);
  const activeTemplateVariables =
    templateContent !== null ? templateVariables : ws.analysisTemplateVariables;
  const activeTemplateStatus =
    templateContent !== null ? null : ws.analysisTemplateStatus;
  const activeTemplateReason =
    templateContent !== null ? null : ws.analysisTemplateReason;
  const activeTemplateKey =
    templateContent !== null
      ? `template:${searchParams.get("templateId") ?? "loaded"}:${templateContent}`
      : ws.analysisTaskId
        ? `analysis:${ws.analysisTaskId}:${ws.analysisTemplateStatus ?? "none"}`
        : null;

  // FEAT-02: 历史恢复回调
  const handleHistoryRestore = useCallback(
    async (id: string) => {
      try {
        const restoredData = await restoreHistory(id);
        setResolvedPromptText(restoredData.promptSnapshot);
        ws.enterHistoryRestored(
          restoredData.resultFileUrl,
          restoredData.recipe,
          restoredData.promptSnapshot,
          restoredData.negativePromptSnapshot,
          restoredData.analysisTaskId
        );
      } catch (err) {
        // Toast 提示错误（简单 console.warn，后续可接入 toast 系统）
        console.error("历史恢复失败:", err instanceof Error ? err.message : err);
      }
    },
    [restoreHistory, ws]
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* 中央工作区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <h1 className="sr-only">工作区</h1>

        {/* Compact StatusBar */}
        <StatusBar
          state={ws.state}
          error={ws.error}
          resultImageUrl={ws.resultImageUrl}
          onReplace={handleReplace}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceTwoPaneLayout
            analysis={
              <AnalysisPane
              state={ws.state}
              referenceImageUrl={ws.referenceImageUrl}
              recipe={ws.recipe}
              isUploading={isUploading || ws.state === "uploading"}
              uploadProgress={progress}
                degradation={ws.degradation}
                promptText={ws.promptText}
                error={ws.error}
              onFileSelected={handleFileSelected}
              onReplace={handleReplace}
                onRetry={handleRetry}
            />
            }
            editing={
              <EditingPane
                promptText={ws.promptText}
                templateContent={activeTemplateContent}
                templateVariables={activeTemplateVariables}
                templateStatus={activeTemplateStatus}
                templateReason={activeTemplateReason}
                templateKey={activeTemplateKey}
                onResolvedPromptChange={handleResolvedPromptChange}
                onTemplateContentChange={setTemplateSaveContent}
                onTemplateVariablesChange={setCurrentTemplateVariables}
                onSaveTemplate={handleOpenTemplateSave}
                generatePanel={
                  <LightGeneratePanel
                    state={ws.state}
                    promptText={ws.promptText}
                    params={generationParams}
                    generationUnavailable={ws.degradation.generationUnavailable}
                    error={ws.error}
                    onParamsChange={setGenerationParams}
                    onGenerate={handleGenerate}
                    onRetry={handleGenerateRetry}
                  />
                }
              />
            }
          />
        </div>

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

        {/* Template Save Dialog */}
        <TemplateSaveDialog
          open={showTemplateSaveDialog}
          initialContent={templateSaveContent || activeTemplateContent || ws.promptText}
          initialVariables={currentTemplateVariables}
          sourceAnalysisTaskId={ws.analysisTaskId ?? undefined}
          onSave={() => {
            setShowTemplateSaveDialog(false);
          }}
          onClose={() => setShowTemplateSaveDialog(false)}
        />
      </div>

      {/* 右侧历史面板 */}
      <HistoryPanel
        currentGenerationTaskId={ws.generationTaskId ?? undefined}
        onRestore={handleHistoryRestore}
      />
    </div>
  );
}

/** Suspense boundary for useSearchParams() (Next.js 15 requirement) */
export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">加载中...</div>}>
      <WorkspacePageInner />
    </Suspense>
  );
}
