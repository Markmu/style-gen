"use client";

import type { VisualRecipe } from "@/types/models";
import type {
  WorkspaceState,
  DegradationState,
  WorkspaceError,
} from "@/hooks/use-workspace-state";
import { ErrorDisplay, type ApiErrorCode } from "@/components/workspace/error-display";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";

interface RecipeStepProps {
  recipe: VisualRecipe | null;
  isExpanded: boolean;
  state: WorkspaceState;
  onToggleExpanded: () => void;
  // Degradation / error props (T04)
  degradation: DegradationState;
  promptText?: string;
  error: WorkspaceError | null;
  onRetry: () => void;
  onReplace: () => void;
}

/** RecipeSummary: 5 key fields extracted from VisualRecipe */
interface RecipeSummary {
  subject: string;
  scene: string;
  lighting: string;
  color: string;
  mood: string;
}

function extractSummary(recipe: VisualRecipe): RecipeSummary {
  return {
    subject: recipe.subject,
    scene: recipe.scene,
    lighting: recipe.lighting,
    color: recipe.color,
    mood: recipe.mood,
  };
}

/* ---- Internal sub-components (ported from RecipeCard) ---- */

function RecipeSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="label-tech text-[var(--text-secondary)]">{title}</h4>
      {children}
    </div>
  );
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 label-tech text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-block rounded-full bg-[var(--surface-bright)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/* ---- RecipeSummary view: 5 core fields ---- */

function RecipeSummaryView({ summary }: { summary: RecipeSummary }) {
  const fields: { label: string; value: string }[] = [
    { label: "Subject", value: summary.subject },
    { label: "Scene", value: summary.scene },
    { label: "Light", value: summary.lighting },
    { label: "Color", value: summary.color },
    { label: "Mood", value: summary.mood },
  ];

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <FieldValue key={f.label} label={f.label} value={f.value} />
      ))}
    </div>
  );
}

/* ---- RecipeDetail view: full recipe fields ---- */

function RecipeDetailView({ recipe }: { recipe: VisualRecipe }) {
  return (
    <div className="space-y-4 pt-4">
      <RecipeSection title="Composition & Camera">
        <FieldValue label="Composition" value={recipe.composition} />
        <FieldValue label="Camera Language" value={recipe.cameraLanguage} />
        <p className="mt-1 text-xs text-[var(--text-secondary)]/60">
          Camera Language: angle, distance, movement, and other photographic cues
        </p>
      </RecipeSection>

      <RecipeSection title="Texture & Style">
        <FieldValue label="Texture" value={recipe.texture} />
      </RecipeSection>

      <RecipeSection title="Keywords">
        <TagList tags={recipe.visualKeywords} />
      </RecipeSection>

      <RecipeSection title="Keep / Replace">
        <div>
          <span className="label-tech text-emerald-400">Keep:</span>
          <div className="mt-1">
            <TagList tags={recipe.mustKeep} />
          </div>
        </div>
        <div>
          <span className="label-tech text-amber-400">Replaceable:</span>
          <div className="mt-1">
            <TagList tags={recipe.replaceable} />
          </div>
        </div>
      </RecipeSection>
    </div>
  );
}

/* ---- Amber degradation hint card ---- */

function DegradationHint({
  title,
  description,
  showSpinner,
}: {
  title: string;
  description: string;
  showSpinner?: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className={showSpinner ? "flex items-center gap-3" : ""}>
        {showSpinner && (
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        )}
        <div>
          <p className="text-sm font-medium text-amber-400">{title}</p>
          <p className="mt-1 text-xs text-amber-400/70">{description}</p>
        </div>
      </div>
    </div>
  );
}

/* ---- Main component ---- */

export function RecipeStep({
  recipe,
  isExpanded,
  state,
  onToggleExpanded,
  degradation,
  promptText,
  error,
  onRetry,
  onReplace,
}: RecipeStepProps) {
  const isGenerationReady = state === "generation_ready";
  const stepTitle = isGenerationReady
    ? "Step 1 \u00B7 Generation Settings"
    : "Step 1 \u00B7 Style Breakdown";

  // --- Determine which degradation/error to show ---
  // Error takes priority over degradation hints
  const isAnalysisError =
    state === "idle" && error && error.stage !== "generation";

  // L3: LLM failed — analysis_ready with no recipe but has promptText
  const isL3Degraded =
    state === "analysis_ready" && !recipe && !!promptText;

  // L1: analysis queueing
  const isL1AnalysisQueueing =
    state === "analyzing" && degradation.analysisQueueing;

  // L4: analysis unavailable
  const isL4AnalysisUnavailable = degradation.analysisUnavailable;

  // --- Error display (priority over degradation) ---
  if (isAnalysisError && error) {
    return (
      <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
        <h3 className="text-base font-bold text-[var(--text-primary)]">
          {stepTitle}
        </h3>
        {error.code ? (
          <ErrorDisplay
            code={error.code as ApiErrorCode}
            message={error.message}
            retryable={error.retryable ?? true}
            onRetry={onRetry}
            onReplace={onReplace}
          />
        ) : (
          <AnalysisProgress
            isAnalyzing={false}
            error={error}
            onRetry={onRetry}
          />
        )}
      </div>
    );
  }

  // --- L1 analysis queueing (replaces normal AnalysisProgress) ---
  if (isL1AnalysisQueueing) {
    return (
      <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
        <h3 className="text-base font-bold text-[var(--text-primary)]">
          {stepTitle}
        </h3>
        <DegradationHint
          title="Analysis is queued. Thanks for waiting."
          description="High demand may make processing take longer."
          showSpinner
        />
      </div>
    );
  }

  // --- L4 + L3 degradation hints (can appear above recipe content) ---
  const showL4Hint = isL4AnalysisUnavailable && !isAnalysisError;
  const showL3Hint = isL3Degraded;

  // When recipe is null and not in L3/error state, don't render the step
  if (!recipe && !showL3Hint && !showL4Hint) return null;

  const summary = recipe ? extractSummary(recipe) : null;

  return (
    <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
      {/* Step title */}
      <h3 className="text-base font-bold text-[var(--text-primary)]">
        {stepTitle}
      </h3>

      {/* L4: analysis unavailable hint */}
      {showL4Hint && (
        <DegradationHint
          title="Analysis is temporarily unavailable. Please try again later."
          description="Existing analysis results remain available to view and edit."
        />
      )}

      {/* L3: LLM failed, raw analysis fallback */}
      {showL3Hint && (
        <DegradationHint
          title="AI structuring failed, so raw analysis is shown instead."
          description="You can manually write or adjust the prompt from the raw analysis below."
        />
      )}

      {/* Recipe content (greyed out when L4 unavailable) */}
      {summary && (
        <div className={showL4Hint ? "opacity-50 pointer-events-none" : ""}>
          {/* Default view: RecipeSummary */}
          <RecipeSummaryView summary={summary} />

          {/* Expand/collapse button */}
          <button
            onClick={onToggleExpanded}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--surface-bright)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
            type="button"
          >
            <span>
              {isExpanded ? "Collapse Full Recipe" : "Expand Full Recipe"}
            </span>
            <svg
              className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Expandable detail (with CSS grid animation, <= 300ms) */}
          <div
            className={`grid overflow-hidden transition-all duration-300 ease-out ${
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0">
              <RecipeDetailView recipe={recipe!} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
