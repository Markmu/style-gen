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
  const hasRawAnalysisFallback =
    state === "analysis_ready" && !recipe && promptText.trim().length > 0;

  return (
    <div
      data-testid="style-breakdown-panel"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="label-tech text-[var(--accent-primary)]">Analyze</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isAnalyzing && !degradation.analysisQueueing ? (
          <AnalysisProgress isAnalyzing error={null} onRetry={onRetry} />
        ) : hasAnalysisError ||
          recipe ||
          degradation.analysisQueueing ||
          degradation.analysisUnavailable ||
          hasRawAnalysisFallback ? (
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
              After you upload a reference, visual structure, lighting, color, and mood will unfold here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
