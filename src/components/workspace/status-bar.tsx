"use client";

import { useEffect, useState } from "react";
import { Settings, Share2 } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type {
  DegradationState,
  WorkspaceState,
  WorkspaceError,
} from "@/hooks/use-workspace-state";
import {
  TopModeSwitcher,
  type ManualModeOverride,
  type TopMode,
} from "@/components/workspace/top-mode-switcher";

interface StatusBarProps {
  state: WorkspaceState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  promptText: string;
  manualModeOverride: ManualModeOverride;
  degradation?: DegradationState;
  workspaceName?: string;
  workspaceSubtitle?: string;
  onModeChange: (mode: TopMode) => void;
  onReplace: () => void;
}

type AiStatusPhase =
  | "idle"
  | "analyzing"
  | "analysis_ready"
  | "generating"
  | "failure";

const neutralDegradation: DegradationState = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

function getAiStatusModel({
  state,
  error,
  promptText,
  resultImageUrl,
  degradation,
}: {
  state: WorkspaceState;
  error: WorkspaceError | null;
  promptText: string;
  resultImageUrl: string | null;
  degradation: DegradationState;
}): {
  phase: AiStatusPhase;
  phaseLabel: string;
  title: string;
  description: string;
  readiness: string;
  nextAction: string;
  serviceLabel: string;
  serviceTone: "accent" | "success" | "warning" | "danger";
} {
  const hasPrompt = promptText.trim().length > 0;
  const serviceUnavailable =
    degradation.analysisUnavailable ||
    degradation.generationUnavailable ||
    error?.code === "SERVICE_UNAVAILABLE" ||
    /unavailable/i.test(error?.message ?? "");

  if (error) {
    return {
      phase: "failure",
      phaseLabel: "Recover",
      title: "Recoverable failure",
      description: `${error.message}. The reference, prompt, and workspace context remain available.`,
      readiness: resultImageUrl
        ? "Last render is still available"
        : "Editing context is preserved",
      nextAction: error.retryable
        ? "Next: retry the step or go back to edit"
        : "Next: go back to edit and adjust the input",
      serviceLabel: serviceUnavailable
        ? "Service unavailable"
        : "Service needs attention",
      serviceTone: serviceUnavailable ? "danger" : "warning",
    };
  }

  if (state === "generating") {
    const queued = degradation.generationQueueing;
    return {
      phase: "generating",
      phaseLabel: queued ? "Queued" : "Rendering",
      title: queued ? "Render is queued" : "AI is generating the render",
      description: queued
        ? "The render is still queued. Your prompt stays editable once this task finishes."
        : "AI is rendering the current prompt and preserving the reference evidence.",
      readiness: "Generation is processing",
      nextAction: "Next: wait for the render, then compare or retry",
      serviceLabel: serviceUnavailable
        ? "Service limited"
        : "Service ready and available",
      serviceTone: queued ? "warning" : "accent",
    };
  }

  if (state === "uploading" || state === "analyzing") {
    const queued = degradation.analysisQueueing;
    return {
      phase: "analyzing",
      phaseLabel: queued ? "Queued" : "Reading",
      title: queued ? "Analysis is queued" : "AI is reading style signals",
      description: queued
        ? "The reference is uploaded and waiting in the analysis queue."
        : "Extracting color, composition, lighting, texture, and mood evidence from the reference.",
      readiness: "Evidence is being prepared",
      nextAction: "Next: review the evidence once analysis is ready",
      serviceLabel: serviceUnavailable
        ? "Service limited"
        : "Service ready and available",
      serviceTone: queued ? "warning" : "accent",
    };
  }

  if (
    state === "analysis_ready" ||
    state === "history_restored" ||
    state === "generation_ready"
  ) {
    return {
      phase: "analysis_ready",
      phaseLabel: resultImageUrl ? "Result" : "Ready",
      title: resultImageUrl ? "Render result is ready" : "Evidence is ready",
      description: hasPrompt
        ? "Style signals and prompt evidence are ready for editing or generate."
        : "Style evidence is ready. Add prompt intent before generating.",
      readiness: hasPrompt ? "Ready to generate" : "Waiting for prompt intent",
      nextAction: hasPrompt
        ? "Next: refine intent or generate"
        : "Next: add prompt details",
      serviceLabel: serviceUnavailable
        ? "Service limited"
        : "Service ready and available",
      serviceTone: hasPrompt ? "success" : "warning",
    };
  }

  return {
    phase: "idle",
    phaseLabel: "Idle",
    title: "Upload a reference to start",
    description: "AI is waiting for a reference image before reading style evidence.",
    readiness: "Waiting for reference",
    nextAction: "Next: upload a reference image",
    serviceLabel: serviceUnavailable
      ? "Service limited"
      : "Service ready and available",
    serviceTone: serviceUnavailable ? "warning" : "success",
  };
}

export function StatusBar({
  state,
  error,
  resultImageUrl,
  promptText,
  manualModeOverride,
  degradation = neutralDegradation,
  workspaceName = "Workspace",
  workspaceSubtitle,
  onModeChange,
  onReplace,
}: StatusBarProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const canReplace =
    state === "analysis_ready" ||
    state === "generating" ||
    state === "generation_ready" ||
    state === "history_restored" ||
    !!resultImageUrl;
  const status = getAiStatusModel({
    state,
    error,
    promptText,
    resultImageUrl,
    degradation,
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <div
      data-testid={hasMounted ? "ai-status-header" : undefined}
      data-phase={status.phase}
      className="workspace-status-bar grid min-h-20 grid-cols-[minmax(16.25rem,1fr)_auto_minmax(16.25rem,0.95fr)] items-center gap-4 px-6 py-3"
      aria-label="AI status header"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="status-tone-dot mt-2 h-2.5 w-2.5 shrink-0 rounded-full"
          data-tone={status.serviceTone}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="label-tech mb-1 text-[var(--text-muted)]">
            {workspaceName}
          </p>
          <h2 className="truncate text-base font-bold text-[var(--text-primary)]">
            {status.title}
          </h2>
          {workspaceSubtitle && (
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {workspaceSubtitle}
            </p>
          )}
          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
            {status.description}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 justify-center">
        <TopModeSwitcher
          state={state}
          promptText={promptText}
          manualModeOverride={manualModeOverride}
          onModeChange={onModeChange}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="hidden min-w-0 text-right lg:block">
          <p className="label-tech mb-1 text-[var(--text-muted)]">
            Phase · {status.phaseLabel}
          </p>
          <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {status.readiness}
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {status.nextAction}
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {status.serviceLabel}
          </p>
        </div>
        <button
          type="button"
          aria-label="Share workspace"
          className="btn-secondary hidden h-9 w-9 items-center justify-center rounded-lg md:inline-flex"
        >
          <AppIcon icon={Share2} />
        </button>
        <button
          type="button"
          aria-label="Workspace settings"
          className="btn-secondary hidden h-9 w-9 items-center justify-center rounded-lg md:inline-flex"
        >
          <AppIcon icon={Settings} />
        </button>
        {canReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          >
            Replace Reference
          </button>
        )}
      </div>
    </div>
  );
}
