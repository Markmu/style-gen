"use client";

import type { VisualRecipe } from "@/types/models";
import type {
  DegradationState,
  WorkspaceError,
  WorkspaceState,
} from "@/hooks/use-workspace-state";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";
import { RecipeEditorWithDegrade } from "@/components/workspace/recipe-editor";

interface StyleBreakdownPanelProps {
  recipe: VisualRecipe | null;
  state: WorkspaceState;
  degradation: DegradationState;
  promptText: string;
  error: WorkspaceError | null;
  onRetry: () => void;
  onReplace: () => void;
}

export function StyleBreakdownPanel({
  recipe,
  state,
  degradation,
  promptText,
  error,
  onRetry,
  onReplace,
}: StyleBreakdownPanelProps) {
  const isAnalyzing = state === "analyzing";
  const hasAnalysisError = state === "idle" && error && error.stage !== "generation";

  return (
    <div
      data-testid="style-breakdown-panel"
      className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl p-4"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="label-tech text-[var(--text-muted)]">Analyze</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isAnalyzing && !degradation.analysisQueueing ? (
          <AnalysisProgress isAnalyzing error={null} onRetry={onRetry} />
        ) : hasAnalysisError || recipe || degradation.analysisQueueing ? (
          <RecipeEditorWithDegrade
            recipe={recipe}
            state={state}
            degradation={degradation}
            promptText={promptText}
            error={error}
            onRetry={onRetry}
            onReplace={onReplace}
          />
        ) : (
          <div className="flex h-full min-h-[260px] flex-col justify-center rounded-lg bg-[var(--surface-low)] p-6">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              上传参考图后，视觉结构、光线、色彩和情绪会在这里展开。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
