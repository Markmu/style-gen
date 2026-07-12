"use client";

import { ChevronDown, Gauge, Lightbulb, Pencil, Sparkles } from "lucide-react";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
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
  const phase = phaseAttribute(state, degradation);
  const serviceState = serviceUnavailable ? "limited" : "ready";

  return (
    <div data-testid={phase === "idle" ? undefined : "ai-status-header"} data-phase={phase}>
      <section
        data-testid="ai-copilot-ribbon"
        data-phase={phase}
        data-service={serviceState}
        className="workspace-copilot-ribbon mx-4 mb-3"
        aria-label="AI Copilot"
        aria-live={
          degradation.analysisUnavailable || degradation.generationUnavailable
            ? "assertive"
            : "polite"
        }
      >
        <div className="workspace-copilot-ribbon-grid">
          <div className="workspace-copilot-lede flex min-w-0 items-center gap-3">
            <span className="workspace-copilot-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--accent-primary)]">
              <AppIcon icon={Sparkles} size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-[var(--accent-primary)]">
                AI Copilot
              </p>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                {signalCount > 0
                  ? `${signalCount} style signals detected`
                  : "Waiting for reference evidence"}
              </p>
            </div>
          </div>

          <RibbonMetric label="Phase" value={phaseLabel(state)} icon={Pencil} />
          <RibbonMetric
            label="Confidence"
            value={confidence > 0 ? `${confidence}%` : "--"}
            icon={Gauge}
          />

          <div className="workspace-copilot-segment min-w-0">
            <p className="workspace-copilot-label">Signals detected</p>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-sm font-semibold text-[var(--text-primary)]">
                {signalCount}
              </span>
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

          <div className="workspace-copilot-segment min-w-0">
            <p className="workspace-copilot-label">Next</p>
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {nextAction({ state, hasReference, hasPrompt, canGenerate, disabledReason })}
            </p>
          </div>

          <div className="workspace-copilot-segment min-w-0">
            <p className="workspace-copilot-label">Services</p>
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
            className="workspace-copilot-insights inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold"
          >
            <AppIcon icon={Lightbulb} size={16} />
            Copilot insights
            <AppIcon icon={ChevronDown} size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function RibbonMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: AppIconComponent;
}) {
  return (
    <div className="workspace-copilot-segment min-w-0">
      <p className="workspace-copilot-label">{label}</p>
      <p className="flex items-center gap-2 truncate text-sm font-medium text-[var(--text-primary)]">
        <AppIcon icon={icon} size={16} className="text-[var(--accent-primary)]" />
        {value}
      </p>
    </div>
  );
}
