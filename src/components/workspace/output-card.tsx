"use client";

import { useCallback } from "react";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import type { RenderReadiness } from "@/lib/render-readiness";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

interface OutputCardProps {
  state: WorkspaceState;
  params: { aspectRatio: AspectRatio; quality: Quality };
  readiness: RenderReadiness;
  onParamsChange: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
}

export function OutputCard({
  state,
  params,
  readiness,
  onParamsChange,
  onGenerate,
}: OutputCardProps) {
  const isGenerating = state === "generating";
  const enabled = readiness.canGenerate && !isGenerating;
  const buttonLabel = isGenerating ? "Rendering..." : "Generate";
  const helperText = enabled
    ? "Generate with the current prompt."
    : readiness.disabledReason;

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
    <section
      data-testid="output-card"
      data-readiness-can-generate={String(readiness.canGenerate)}
      className="min-w-0 rounded-xl bg-[var(--surface-low)]/72 p-2 ring-1 ring-[var(--border-static)]"
      aria-label="Render Dock"
    >
      <div
        data-testid="output-card-actions"
        className="grid min-h-14 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <div
          data-testid="render-parameter-controls"
          className="grid min-w-0 grid-cols-2 gap-2 rounded-lg bg-[var(--surface-bright)]/72 px-2 py-1.5 ring-1 ring-[var(--border-static)]"
        >
          <label className="grid min-w-0 gap-1">
            <span className="text-[0.625rem] font-bold uppercase text-[var(--text-muted)]">
              Ratio
            </span>
            <select
              aria-label="Aspect Ratio"
              value={params.aspectRatio}
              disabled={isGenerating}
              onChange={(event) => handleAspectRatioChange(event.target.value as AspectRatio)}
              className="input-precision h-7 w-full min-w-0 rounded-t-md px-2 text-xs"
            >
              {ASPECT_RATIOS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-1">
            <span className="text-[0.625rem] font-bold uppercase text-[var(--text-muted)]">
              Quality
            </span>
            <select
              aria-label="Quality"
              value={params.quality}
              disabled={isGenerating}
              onChange={(event) => handleQualityChange(event.target.value as Quality)}
              className="input-precision h-7 w-full min-w-0 rounded-t-md px-2 text-xs"
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!enabled}
          title={helperText}
          className={`flex h-12 min-w-[10rem] shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors ${
            enabled
              ? "btn-primary"
              : "cursor-not-allowed bg-[var(--surface-control)] text-[var(--text-muted)] ring-1 ring-[var(--border-static)]"
          }`}
        >
          <span className="icon text-[1rem]" aria-hidden="true">
            {isGenerating ? "progress_activity" : "auto_awesome"}
          </span>
          <span>{buttonLabel}</span>
        </button>
      </div>
    </section>
  );
}
