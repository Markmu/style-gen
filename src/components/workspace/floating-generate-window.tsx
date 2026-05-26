"use client";

import { useCallback } from "react";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import { hasUnresolvedVariables } from "@/lib/template-parser";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: { label: string; value: Quality }[] = [
  { label: "Standard", value: "standard" },
  { label: "HD", value: "hd" },
];

export interface FloatingGenerateWindowProps {
  state: WorkspaceState;
  promptText: string;
  params: { aspectRatio: AspectRatio; quality: Quality };
  generationUnavailable: boolean;
  error: WorkspaceError | null;
  onParamsChange: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onRetry: () => void;
  testId?: string;
  variant?: "floating" | "embedded" | "bar";
}

export function FloatingGenerateWindow({
  state,
  promptText,
  params,
  generationUnavailable,
  error,
  onParamsChange,
  onGenerate,
  onRetry,
  testId = "floating-generate-window",
  variant = "bar",
}: FloatingGenerateWindowProps) {
  const isGenerating = state === "generating";
  const promptReady = promptText.trim().length > 0;
  const hasUnresolvedTemplateVariables = hasUnresolvedVariables(promptText);
  const stateReady =
    state === "analysis_ready" ||
    state === "generation_ready" ||
    state === "history_restored";
  const canGenerate =
    stateReady &&
    promptReady &&
    !hasUnresolvedTemplateVariables &&
    !generationUnavailable &&
    !isGenerating;

  const unavailableReason = !promptReady
    ? "Get or enter a complete generation prompt first"
    : hasUnresolvedTemplateVariables
      ? "Fill in all template variables first"
      : generationUnavailable
        ? "Image generation is temporarily unavailable"
        : !stateReady
          ? "Generate after analysis is complete"
          : "";

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    onGenerate(params);
  }, [canGenerate, onGenerate, params]);

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

  const containerClass =
    variant === "floating"
      ? "glass-panel floating-generate-glass pointer-events-auto w-full max-w-[640px] rounded-xl px-4 py-3"
      : variant === "embedded"
        ? "surface-panel min-w-0 shrink-0 overflow-hidden rounded-xl p-4"
        : "min-w-0 shrink-0";

  return (
    <div data-testid={testId} className={containerClass}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
          <div
            className="flex min-w-0 flex-wrap items-center gap-2"
            role="group"
            aria-label="Aspect Ratio"
          >
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Aspect
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ASPECT_RATIOS.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleAspectRatioChange(value)}
                  className={`h-8 rounded-md px-2.5 text-xs transition-colors ${
                    params.aspectRatio === value
                      ? "bg-[var(--accent-primary)] text-[var(--text-on-primary)]"
                      : "bg-[var(--surface-bright)] text-[var(--text-secondary)]"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex min-w-0 flex-wrap items-center gap-2"
            role="group"
            aria-label="Quality"
          >
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Quality
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleQualityChange(option.value)}
                  className={`h-8 rounded-md px-2.5 text-xs transition-colors ${
                    params.quality === option.value
                      ? "bg-[var(--accent-primary)] text-[var(--text-on-primary)]"
                      : "bg-[var(--surface-bright)] text-[var(--text-secondary)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 xl:min-w-[180px] xl:items-end">
          {error?.stage === "generation" && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-secondary self-start rounded-md px-3 py-1.5 text-xs xl:self-end"
            >
              Resume Generation
            </button>
          )}
          {unavailableReason && (
            <p className="max-w-[280px] text-xs leading-5 text-[var(--text-secondary)] xl:text-right">
              {unavailableReason}
            </p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="btn-primary h-10 w-full rounded-lg px-5 text-sm font-medium xl:w-[180px]"
          >
            {isGenerating ? "GENERATING..." : "GENERATE"}
          </button>
        </div>
      </div>
    </div>
  );
}
