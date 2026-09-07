"use client";

import { deriveEvidenceFacets } from "@/lib/evidence-facets";
import type { DegradationState, WorkspaceState } from "@/hooks/use-workspace-state";
import type { StoredVisualRecipe } from "@/types/models";

interface AiCopilotRibbonProps {
  state: WorkspaceState;
  recipe: StoredVisualRecipe | null;
  hasReference: boolean;
  hasPrompt: boolean;
  canGenerate: boolean;
  disabledReason: string;
  degradation: DegradationState;
}

function phaseLabel(state: WorkspaceState) {
  switch (state) {
    case "idle":
      return "Analyze";
    case "uploading":
      return "Uploading";
    case "analyzing":
      return "Reading";
    case "analysis_ready":
    case "history_restored":
      return "Editing";
    case "generating":
      return "Rendering";
    case "generation_ready":
      return "Result";
  }
}

function phaseAttribute(
  state: WorkspaceState,
  degradation: DegradationState,
) {
  if (degradation.analysisUnavailable || degradation.generationUnavailable) {
    return "failure";
  }
  if (state === "uploading" || state === "analyzing") return "analyzing";
  if (state === "generating") return "generating";
  if (
    state === "analysis_ready" ||
    state === "history_restored" ||
    state === "generation_ready"
  ) {
    return "analysis_ready";
  }
  return "idle";
}

function nextAction({
  state,
  hasReference,
  hasPrompt,
  canGenerate,
  disabledReason,
}: Pick<
  AiCopilotRibbonProps,
  "state" | "hasReference" | "hasPrompt" | "canGenerate" | "disabledReason"
>) {
  if (state === "uploading") return "Upload in progress";
  if (state === "analyzing") return "AI is extracting style signals";
  if (state === "generating") return "Rendering current prompt";
  if (state === "generation_ready") return "Compare result or refine";
  if (!hasReference) return "Upload a reference image";
  if (!hasPrompt) return "Review style intelligence";
  if (canGenerate) return "Refine intent or render";
  return disabledReason;
}

export function AiCopilotRibbon(props: AiCopilotRibbonProps) {
  const { state, recipe, degradation } = props;
  const signalCount = new Set(deriveEvidenceFacets(recipe)
    .filter((facet) => facet.sourceField !== "subject" && facet.summary.trim())
    .map((facet) => facet.sourceField)).size;
  const phase = phaseAttribute(state, degradation);
  return (
    <div data-testid={phase === "idle" ? undefined : "ai-status-header"} data-phase={phase}>
      <section data-testid="ai-copilot-ribbon" data-phase={phase}
        className="mx-4 mb-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-[var(--surface-panel)] px-3 py-2 text-xs"
        aria-label="Workspace status" aria-live="polite">
        <span className="font-semibold text-[var(--text-primary)]">{phaseLabel(state)}</span>
        <span className="text-[var(--text-secondary)]">{nextAction(props)}</span>
        <span className="text-[var(--text-muted)]" data-testid="evidence-coverage">
          {signalCount ? `${signalCount} evidence dimensions` : "Waiting for reference evidence"}
        </span>
      </section>
    </div>
  );
}
