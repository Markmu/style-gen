"use client";

import { useCallback } from "react";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import {
  getRenderNextActionLabel,
  type RenderReadiness,
} from "@/lib/render-readiness";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

type ReadinessState = "ready" | "waiting" | "blocked" | "processing";

interface OutputCardProps {
  state: WorkspaceState;
  params: { aspectRatio: AspectRatio; quality: Quality };
  readiness: RenderReadiness;
  error: WorkspaceError | null;
  onParamsChange: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onRetry: () => void;
  onSaveStyleMemory?: () => void;
  onBackToEdit?: () => void;
}

function stateFor(value: boolean, blocked = false): ReadinessState {
  if (value) return "ready";
  return blocked ? "blocked" : "waiting";
}

export function OutputCard({
  state,
  params,
  readiness,
  error,
  onParamsChange,
  onGenerate,
  onRetry,
  onSaveStyleMemory,
  onBackToEdit,
}: OutputCardProps) {
  const isGenerating = state === "generating";
  const enabled = readiness.canGenerate && !isGenerating;
  const saveStyleMemoryDisabled =
    !readiness.promptResolved || isGenerating || !onSaveStyleMemory;
  const buttonLabel = isGenerating ? "Rendering..." : "Generate";
  const helperText = enabled
    ? "Ready to render with the current prompt."
    : readiness.disabledReason;
  const nextActionLabel = getRenderNextActionLabel(readiness.nextAction);
  const showRecoveryActions =
    error?.stage === "generation" ||
    (!readiness.serviceAvailable && readiness.promptResolved);
  const readinessItems = [
    {
      id: "prompt",
      label: "Prompt resolved",
      description: readiness.promptResolved ? "Prompt is ready" : "Prompt needs content",
      state: stateFor(readiness.promptResolved),
      icon: readiness.promptResolved ? "check" : "edit_note",
    },
    {
      id: "variables",
      label: "Variables resolved",
      description: readiness.variablesResolved ? "Variables are complete" : "Resolve template variables",
      state: stateFor(readiness.variablesResolved, true),
      icon: readiness.variablesResolved ? "check" : "data_object",
    },
    {
      id: "style-signals",
      label: "Style signals available",
      description: readiness.styleSignalsAvailable ? "Evidence is available" : "Awaiting style evidence",
      state: stateFor(readiness.styleSignalsAvailable),
      icon: readiness.styleSignalsAvailable ? "auto_awesome" : "radar",
    },
    {
      id: "service",
      label: "Service available",
      description: readiness.serviceAvailable ? "Generation service ready" : "Service unavailable",
      state: stateFor(readiness.serviceAvailable, true),
      icon: readiness.serviceAvailable ? "bolt" : "priority_high",
    },
    {
      id: "workspace-idle",
      label: "Workspace idle",
      description: readiness.workspaceIdle ? "No active task" : "Task in progress",
      state: readiness.workspaceIdle ? "ready" : isGenerating ? "processing" : "waiting",
      icon: readiness.workspaceIdle ? "check_circle" : "progress_activity",
    },
  ];

  const handleAspectRatioChange = useCallback(
    (aspectRatio: AspectRatio) => {
      onParamsChange({ ...params, aspectRatio });
    },
    [onParamsChange, params],
  );

  const handleQualityChange = useCallback(
    (quality: Quality) => {
      onParamsChange({ ...params, quality });
    },
    [onParamsChange, params],
  );

  const handleGenerate = useCallback(() => {
    if (!enabled) return;
    onGenerate(params);
  }, [enabled, onGenerate, params]);

  const handleSaveStyleMemory = useCallback(() => {
    if (saveStyleMemoryDisabled) return;
    onSaveStyleMemory?.();
  }, [onSaveStyleMemory, saveStyleMemoryDisabled]);

  return (
    <section
      data-testid="output-card"
      data-readiness-can-generate={String(readiness.canGenerate)}
      className="min-w-0 rounded-xl bg-[var(--surface-low)]/72 p-2 ring-1 ring-[var(--border-static)]"
      aria-label="Render Dock"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          Render Dock
          <span className="icon text-[0.9375rem] text-[var(--text-muted)]" aria-hidden="true">
            info
          </span>
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <label>
            <span className="sr-only">Aspect Ratio</span>
            <select
              aria-label="Aspect Ratio"
              value={params.aspectRatio}
              disabled={isGenerating}
              onChange={(event) => handleAspectRatioChange(event.target.value as AspectRatio)}
              className="input-precision h-7 w-[4.5rem] rounded-t-md px-2 text-xs"
            >
              {ASPECT_RATIOS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Quality</span>
            <select
              aria-label="Quality"
              value={params.quality}
              disabled={isGenerating}
              onChange={(event) => handleQualityChange(event.target.value as Quality)}
              className="input-precision h-7 w-[5.4rem] rounded-t-md px-2 text-xs"
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        data-testid="output-card-actions"
        className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2"
      >
        <div
          data-testid="render-readiness-list"
          className="grid min-w-0 grid-cols-2 content-center gap-1 rounded-lg bg-[var(--surface-bright)]/72 px-2 py-1.5"
        >
          {readinessItems.map((item) => (
            <div
              key={item.id}
              data-testid={`render-readiness-item-${item.id}`}
              data-state={item.state}
              className="readiness-row flex min-w-0 !min-h-0 !items-center !gap-1.5 rounded-md !px-2 !py-1 text-xs font-medium text-[var(--text-secondary)]"
            >
              <span
                className="icon text-[0.875rem]"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
              <span className="sr-only">{item.description}</span>
            </div>
          ))}
        </div>
        <div className="flex items-stretch gap-2">
          {error?.stage === "generation" && (
            <button
            type="button"
            onClick={onRetry}
              className="btn-secondary min-h-9 shrink-0 rounded-lg px-3 text-xs"
            >
              Retry
            </button>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!enabled}
            title={enabled ? "Generate image" : helperText}
            className={`min-h-9 shrink-0 rounded-lg px-6 text-sm font-semibold transition-colors ${
              enabled
                ? "btn-primary"
                : "cursor-not-allowed bg-[var(--surface-control)] text-[var(--text-muted)] ring-1 ring-[var(--border-static)]"
            }`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p
            data-testid="render-disabled-reason"
            aria-live="polite"
            className="truncate text-xs text-[var(--text-secondary)]"
          >
            {helperText}
          </p>
          <p
            data-testid="render-next-action"
            className="mt-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-[var(--text-muted)]"
          >
            Next: {nextActionLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveStyleMemory}
          disabled={saveStyleMemoryDisabled}
          className="btn-secondary h-7 shrink-0 rounded-lg px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save as style memory
        </button>
      </div>

      {showRecoveryActions && (
        <div
          data-testid="render-recovery-actions"
          className="mt-3 rounded-lg bg-[var(--surface-bright)]/72 px-3 py-2"
        >
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            Reference, prompt, variables, and params are preserved.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="btn-secondary h-8 rounded-lg px-3 text-xs font-medium"
            >
              {readiness.serviceAvailable ? "Retry" : "Retry service"}
            </button>
            <button
              type="button"
              onClick={onBackToEdit}
              className="btn-secondary h-8 rounded-lg px-3 text-xs font-medium"
            >
              Back to Edit
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
