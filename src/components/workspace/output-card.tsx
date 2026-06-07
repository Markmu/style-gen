"use client";

import { useCallback } from "react";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

interface OutputCardProps {
  state: WorkspaceState;
  params: { aspectRatio: AspectRatio; quality: Quality };
  canGenerate: boolean;
  disabledReason?: string;
  generationUnavailable: boolean;
  error: WorkspaceError | null;
  onParamsChange: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onRetry: () => void;
}

export function OutputCard({
  state,
  params,
  canGenerate,
  disabledReason = "Analyze or write a prompt before generating",
  generationUnavailable,
  error,
  onParamsChange,
  onGenerate,
  onRetry,
}: OutputCardProps) {
  const isGenerating = state === "generating";
  const enabled = canGenerate && !isGenerating;
  const buttonLabel = isGenerating ? "GENERATING..." : "GENERATE";
  const helperText = generationUnavailable
    ? "Image generation is temporarily unavailable"
    : enabled
      ? "Ready to render with the current prompt"
      : disabledReason;

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

  return (
    <article
      data-testid="output-card"
      className="glass-panel flex h-full min-h-0 min-w-0 rounded-xl px-4 py-3"
      aria-label="Output"
    >
      <div className="flex h-full min-h-14 w-full min-w-0 items-center gap-3">
        <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
          Output
        </h2>

        <label className="min-w-0 shrink-0">
          <span className="sr-only">Aspect Ratio</span>
          <select
            aria-label="Aspect Ratio"
            value={params.aspectRatio}
            disabled={isGenerating}
            onChange={(event) => handleAspectRatioChange(event.target.value as AspectRatio)}
            className="input-precision h-9 w-[4.4rem] rounded-t-md px-2 text-xs"
          >
            {ASPECT_RATIOS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0 shrink-0">
          <span className="sr-only">Quality</span>
          <select
            aria-label="Quality"
            value={params.quality}
            disabled={isGenerating}
            onChange={(event) => handleQualityChange(event.target.value as Quality)}
            className="input-precision h-9 w-[5.6rem] rounded-t-md px-2 text-xs"
          >
            {QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <p className="sr-only">{helperText}</p>

        <div
          data-testid="output-card-actions"
          className="ml-auto flex shrink-0 items-center justify-end gap-2"
        >
          {error?.stage === "generation" && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-secondary shrink-0 rounded-md px-2.5 py-1 text-xs"
            >
              Retry
            </button>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!enabled}
            title={enabled ? "Generate image" : helperText}
            className={`h-9 shrink-0 rounded-lg px-4 text-xs font-semibold transition-colors ${
              enabled
                ? "btn-primary"
                : "cursor-not-allowed bg-[var(--surface-control)] text-[var(--text-muted)] ring-1 ring-[var(--border-static)]"
            }`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
