"use client";

import type { VisualRecipe } from "@/types/models";
import type {
  WorkspaceState,
  DegradationState,
  WorkspaceError,
} from "@/hooks/use-workspace-state";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";
import { PromptEditor } from "@/components/workspace/prompt-editor";
import { RecipeStep } from "@/components/workspace/recipe-step";
import {
  OutputSettings,
  type AspectRatio,
  type Quality,
} from "@/components/workspace/output-settings";

interface DecisionPanelProps {
  state: WorkspaceState;
  recipe: VisualRecipe | null;
  promptText: string;
  negativePromptText: string;
  isRecipeExpanded: boolean;
  degradation: DegradationState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  onPromptChange: (text: string) => void;
  onNegativePromptChange: (text: string) => void;
  onToggleRecipeExpanded: () => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  // T04: degradation / error callbacks
  onRetry: () => void;
  onReplace: () => void;
  onGenerateRetry: () => void;
}

/** Idle empty state: three-step guide preview */
function EmptyStatePreview() {
  const steps = [
    { number: "1", label: "AI Analyzes Style" },
    { number: "2", label: "Edit Generation Prompt" },
    { number: "3", label: "Set Parameters and Generate" },
  ];

  return (
    <div className="rounded-xl bg-[var(--surface-mid)] p-6 ring-1 ring-[var(--border)]">
      <h3 className="text-base font-bold text-[var(--text-primary)]">
        Creative Workflow
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

export function DecisionPanel({
  state,
  recipe,
  promptText,
  negativePromptText,
  isRecipeExpanded,
  degradation,
  error,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resultImageUrl,
  onPromptChange,
  onNegativePromptChange,
  onToggleRecipeExpanded,
  onGenerate,
  onRetry,
  onReplace,
  onGenerateRetry,
}: DecisionPanelProps) {
  const isAnalyzing = state === "analyzing";
  const isGenerationReady = state === "generation_ready";

  // Step rendering conditions (sunk from page.tsx)
  // Also show RecipeStep when idle with an analysis error (for ErrorDisplay)
  const hasAnalysisError =
    state === "idle" && error && error.stage !== "generation";

  const showRecipeStep =
    state === "analyzing" ||
    state === "analysis_ready" ||
    state === "generating" ||
    state === "generation_ready" ||
    hasAnalysisError;

  const showPromptEditor =
    state === "analysis_ready" ||
    state === "generating" ||
    state === "generation_ready";

  const showOutputSettings =
    state === "analysis_ready" ||
    state === "generating" ||
    state === "generation_ready";

  // Idle state with no error: show empty state preview
  if (state === "idle" && !error) {
    return <EmptyStatePreview />;
  }

  const promptEditorTitle = isGenerationReady
    ? "Keep Refining the Prompt"
    : "Generation Prompt";

  return (
    <div className="space-y-6">
      {/* Step 1: Recipe / Analysis progress / Error / Degradation */}
      {showRecipeStep && (
        <>
          {isAnalyzing && !degradation.analysisQueueing ? (
            <AnalysisProgress
              isAnalyzing={isAnalyzing}
              error={null}
              onRetry={onRetry}
            />
          ) : (
            <RecipeStep
              recipe={recipe}
              isExpanded={isRecipeExpanded}
              state={state}
              onToggleExpanded={onToggleRecipeExpanded}
              degradation={degradation}
              promptText={promptText}
              error={error}
              onRetry={onRetry}
              onReplace={onReplace}
            />
          )}
        </>
      )}

      {/* Prompt Editor */}
      {showPromptEditor && (
        <PromptEditor
          promptText={promptText}
          negativePromptText={negativePromptText}
          onPromptChange={onPromptChange}
          onNegativePromptChange={onNegativePromptChange}
          title={promptEditorTitle}
        />
      )}

      {/* Output Settings (with generation error/degradation) */}
      {showOutputSettings && (
        <OutputSettings
          state={state}
          generationUnavailable={degradation.generationUnavailable}
          onGenerate={onGenerate}
          generationQueueing={degradation.generationQueueing}
          error={error}
          onRetry={onGenerateRetry}
        />
      )}
    </div>
  );
}
