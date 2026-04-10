"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFileStore } from "@/components/landing/use-file-store";
import { useWorkspaceState } from "@/hooks/use-workspace-state";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { StatusBar } from "@/components/workspace/status-bar";
import { WorkspaceCanvas } from "@/components/workspace/workspace-canvas";
import { RecipeStep } from "@/components/workspace/recipe-step";
import { PromptEditor } from "@/components/workspace/prompt-editor";
import {
  OutputSettings,
  type AspectRatio,
  type Quality,
} from "@/components/workspace/output-settings";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";
import { TemplateDrawer } from "@/components/workspace/template-drawer";
import { TemplateWizard } from "@/components/workspace/template-wizard";
import { extractVariables } from "@/lib/template-parser";

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

  // Template UI state
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
  const [templateWarning, setTemplateWarning] = useState(false);

  // Wizard state (P1)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardContext, setWizardContext] = useState<{
    variables: import("@/types/models").TemplateVariable[];
    originalContent: string;
  } | null>(null);


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

  // --- Layout logic (lifted from DecisionPanel) ---
  const isAnalyzing = ws.state === "analyzing";
  const isGenerationReady = ws.state === "generation_ready";

  const hasAnalysisError =
    ws.state === "idle" && ws.error && ws.error.stage !== "generation";

  const showRecipeStep =
    ws.state === "analyzing" ||
    ws.state === "analysis_ready" ||
    ws.state === "generating" ||
    ws.state === "generation_ready" ||
    hasAnalysisError;

  const showPromptEditor =
    ws.state === "analysis_ready" ||
    ws.state === "generating" ||
    ws.state === "generation_ready";

  const showOutputSettings =
    ws.state === "analysis_ready" ||
    ws.state === "generating" ||
    ws.state === "generation_ready";

  // Three-column grid when prompt editor is visible
  const useThreeColumns = showPromptEditor;

  const step2Title = isGenerationReady
    ? "Step 2 \u00B7 继续调整指令"
    : "Step 2 \u00B7 生成指令";

  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-[var(--surface-base)]">
      <h1 className="sr-only">工作区</h1>

      {/* Compact StatusBar */}
      <StatusBar
        state={ws.state}
        error={ws.error}
        resultImageUrl={ws.resultImageUrl}
        onReplace={handleReplace}
      />

      {/* Workspace grid: 2-col (idle/analyzing) or 3-col (analysis_ready+) */}
      <div
        className={`grid flex-1 gap-4 px-6 pb-4 pt-4 ${
          useThreeColumns
            ? "grid-cols-[minmax(500px,1fr)_420px_460px]"
            : "grid-cols-[minmax(500px,1fr)_460px]"
        }`}
        style={{ minHeight: 0 }}
      >
        {/* Left column: Canvas */}
        <div className="min-h-0 overflow-y-auto rounded-xl">
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

        {/* Middle column: Recipe / Analysis (three-column mode only) */}
        {useThreeColumns && (
          <div className="min-h-0 overflow-y-auto">
            {showRecipeStep && (
              <>
                {isAnalyzing && !ws.degradation.analysisQueueing ? (
                  <AnalysisProgress
                    isAnalyzing={isAnalyzing}
                    error={null}
                    onRetry={handleRetry}
                  />
                ) : (
                  <RecipeStep
                    recipe={ws.recipe}
                    isExpanded={ws.isRecipeExpanded}
                    state={ws.state}
                    onToggleExpanded={ws.toggleRecipeExpanded}
                    degradation={ws.degradation}
                    promptText={ws.promptText}
                    error={ws.error}
                    onRetry={handleRetry}
                    onReplace={handleReplace}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Right column: Prompt Editor + Output Settings (or guide) */}
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {/* Idle / uploading empty state guide */}
          {(ws.state === "idle" || ws.state === "uploading") &&
            !ws.error && <EmptyStateGuide />}

          {/* Two-column fallback: show recipe here when not in three-column mode */}
          {!useThreeColumns && showRecipeStep && (
            <>
              {isAnalyzing && !ws.degradation.analysisQueueing ? (
                <AnalysisProgress
                  isAnalyzing={isAnalyzing}
                  error={null}
                  onRetry={handleRetry}
                />
              ) : (
                <RecipeStep
                  recipe={ws.recipe}
                  isExpanded={ws.isRecipeExpanded}
                  state={ws.state}
                  onToggleExpanded={ws.toggleRecipeExpanded}
                  degradation={ws.degradation}
                  promptText={ws.promptText}
                  error={ws.error}
                  onRetry={handleRetry}
                  onReplace={handleReplace}
                />
              )}
            </>
          )}

          {/* Template action toolbar — 仅在编辑器可见时显示 */}
          {showPromptEditor && (
            <div className="flex items-center justify-between mb-2">
              {templateWarning && (
                <div className="rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
                  模板含未闭合的变量标记，可能影响变量替换功能
                </div>
              )}
              {!templateWarning && <span />}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setShowTemplateSaveDialog(true)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-mid)] hover:text-[var(--text-primary)] transition-colors"
                >
                  保存为模板
                </button>
                <button
                  onClick={() => setShowTemplateDrawer(true)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-mid)] hover:text-[var(--text-primary)] transition-colors"
                >
                  我的模板
                </button>
              </div>
            </div>
          )}

          {/* Prompt Editor or Wizard mode */}
          {showPromptEditor && (
            showWizard && wizardContext ? (
              <TemplateWizard
                variables={wizardContext.variables}
                originalContent={wizardContext.originalContent}
                onApply={(rendered) => {
                  ws.setPromptText(rendered);
                  setShowWizard(false);
                  setWizardContext(null);
                }}
                onSkip={() => {
                  setShowWizard(false);
                  setWizardContext(null);
                }}
              />
            ) : (
              <PromptEditor
                promptText={ws.promptText}
                negativePromptText={ws.negativePromptText}
                onPromptChange={(text) => {
                  ws.setPromptText(text);
                  // Clear template warning when user edits text
                  if (templateWarning) setTemplateWarning(false);
                }}
                onNegativePromptChange={ws.setNegativePromptText}
                title={step2Title}
              />
            )
          )}

          {/* Output Settings */}
          {showOutputSettings && (
            <OutputSettings
              state={ws.state}
              generationUnavailable={ws.degradation.generationUnavailable}
              onGenerate={handleGenerate}
              generationQueueing={ws.degradation.generationQueueing}
              error={ws.error}
              onRetry={handleGenerateRetry}
            />
          )}
        </div>
      </div>

      {/* Template Save Dialog */}
      <TemplateSaveDialog
        open={showTemplateSaveDialog}
        initialContent={ws.promptText}
        sourceAnalysisTaskId={ws.analysisTaskId ?? undefined}
        onSave={() => {
          setShowTemplateSaveDialog(false);
        }}
        onClose={() => setShowTemplateSaveDialog(false)}
      />

      {/* Template Drawer */}
      <TemplateDrawer
        open={showTemplateDrawer}
        onLoadTemplate={(content) => {
          ws.setPromptText(content);
          // Check for unbalanced variable markers
          const openCount = (content.match(/\{\{/g) ?? []).length;
          const closeCount = (content.match(/\}\}/g) ?? []).length;
          setTemplateWarning(openCount !== closeCount);
          setShowTemplateDrawer(false);

          // P1: 检测变量标记 → 自动展示向导
          const vars = extractVariables(content);
          if (vars.length > 0) {
            setWizardContext({ variables: vars, originalContent: content });
            setShowWizard(true);
          }
        }}
        onDeleteSuccess={() => {
          // Drawer internally removed from list; extensible for logging etc.
        }}
        onClose={() => setShowTemplateDrawer(false)}
      />
    </main>
  );
}

/** Idle state guide: shows three-step workflow */
function EmptyStateGuide() {
  const steps = [
    { number: "1", label: "AI 分析风格" },
    { number: "2", label: "编辑生成指令" },
    { number: "3", label: "设置参数生成" },
  ];

  return (
    <div className="rounded-xl bg-[var(--surface-mid)] p-6 ring-1 ring-[var(--border)]">
      <h3 className="text-base font-bold text-[var(--text-primary)]">
        创作流程
      </h3>
      <div className="mt-4 space-y-3">
        {steps.map((step) => (
          <div key={step.number} className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-bright)] text-xs font-medium text-[var(--text-secondary)]">
              {step.number}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
