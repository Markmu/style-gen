"use client";

import { extractAnalysisSummary } from "@/lib/analysis-summary";
import type { DegradationState, WorkspaceState } from "@/hooks/use-workspace-state";
import type { VisualRecipe } from "@/types/models";

interface AiCopilotRibbonProps {
  state: WorkspaceState;
  recipe: VisualRecipe | null;
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

export function AiCopilotRibbon({
  state,
  recipe,
  hasReference,
  hasPrompt,
  canGenerate,
  disabledReason,
  degradation,
}: AiCopilotRibbonProps) {
  const summary = extractAnalysisSummary(recipe);
  const confidence =
    summary.length > 0
      ? Math.round(
          summary.reduce((total, item) => total + item.percentage, 0) /
            summary.length,
        )
      : 0;
  const serviceUnavailable =
    degradation.analysisUnavailable || degradation.generationUnavailable;
  const serviceLabel = serviceUnavailable ? "Limited" : "Ready";
  const serviceTone = serviceUnavailable ? "var(--color-warning)" : "var(--color-success)";
  const signalCount = summary.length || (hasReference ? 5 : 0);
  const signalDots = summary.length > 0 ? summary : [];

  return (
    <section
      data-testid="ai-copilot-ribbon"
      data-phase={phaseAttribute(state, degradation)}
      className="mx-4 mb-2 rounded-2xl border border-[color-mix(in_oklch,var(--accent-primary)_20%,var(--border-static)_80%)] bg-[color-mix(in_oklch,var(--surface-bright)_82%,var(--accent-primary-soft)_18%)] px-4 py-3 shadow-[inset_0_1px_0_oklch(99.5%_0.006_245_/_0.62)] backdrop-blur-2xl"
      aria-label="AI Copilot"
      aria-live={
        degradation.analysisUnavailable || degradation.generationUnavailable
          ? "assertive"
          : "polite"
      }
    >
      <div className="grid items-center gap-3 lg:grid-cols-[minmax(180px,0.85fr)_minmax(120px,0.55fr)_minmax(120px,0.55fr)_minmax(150px,0.7fr)_minmax(220px,1fr)_minmax(120px,0.55fr)_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]">
            <span className="icon text-[20px]" aria-hidden="true">auto_awesome</span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--accent-primary)]">
              AI Copilot
            </p>
            <p className="truncate text-xs text-[var(--text-secondary)]">
              {signalCount > 0
                ? `${signalCount} style signals detected`
                : "Waiting for reference evidence"}
            </p>
          </div>
        </div>

        <RibbonMetric label="Phase" value={phaseLabel(state)} icon="edit_note" />
        <RibbonMetric
          label="Confidence"
          value={confidence > 0 ? `${confidence}%` : "--"}
          icon="donut_large"
        />

        <div className="min-w-0">
          <p className="label-tech mb-1 text-[var(--text-muted)]">Signals</p>
          <div className="flex items-center gap-1.5">
            {signalDots.length > 0
              ? signalDots.map((item) => (
                  <span
                    key={item.dimension}
                    className="h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-bright)]"
                    style={{ background: item.iconColor }}
                    title={item.label}
                  />
                ))
              : Array.from({ length: 5 }).map((_, index) => (
                  <span
                    key={index}
                    className="h-2.5 w-2.5 rounded-full bg-[var(--surface-low)] ring-2 ring-[var(--surface-bright)]"
                  />
                ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className="label-tech mb-1 text-[var(--text-muted)]">Next</p>
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {nextAction({ state, hasReference, hasPrompt, canGenerate, disabledReason })}
          </p>
        </div>

        <div className="min-w-0">
          <p className="label-tech mb-1 text-[var(--text-muted)]">Services</p>
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: serviceTone }}
              aria-hidden="true"
            />
            {serviceLabel}
          </p>
        </div>

        <button
          type="button"
          className="btn-secondary inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium"
        >
          <span className="icon text-[16px]" aria-hidden="true">lightbulb</span>
          Copilot insights
          <span className="icon text-[16px]" aria-hidden="true">expand_more</span>
        </button>
      </div>
    </section>
  );
}

function RibbonMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="min-w-0">
      <p className="label-tech mb-1 text-[var(--text-muted)]">{label}</p>
      <p className="flex items-center gap-2 truncate text-sm font-medium text-[var(--text-primary)]">
        <span className="icon text-[16px] text-[var(--accent-primary)]" aria-hidden="true">
          {icon}
        </span>
        {value}
      </p>
    </div>
  );
}
