"use client";

import { useState, useCallback } from "react";
import type { WorkspaceState, WorkspaceError } from "@/hooks/use-workspace-state";
import { ErrorDisplay, type ApiErrorCode } from "@/components/workspace/error-display";
import { RetryButton } from "@/components/workspace/retry-button";
import { GenerationProgress } from "@/components/workspace/generation-progress";

export type AspectRatio = "1:1" | "4:3" | "16:9" | "3:4" | "9:16";
export type Quality = "standard" | "hd";

// localStorage key for persisting generation parameters
const GEN_PARAMS_STORAGE_KEY = "style-gen-gen-params";

const ASPECT_RATIOS: { label: string; value: AspectRatio }[] = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "16:9", value: "16:9" },
  { label: "3:4", value: "3:4" },
  { label: "9:16", value: "9:16" },
];

const QUALITY_OPTIONS: { label: string; value: Quality }[] = [
  { label: "Standard", value: "standard" },
  { label: "HD", value: "hd" },
];

// localStorage stored data structure
interface StoredGenParams {
  aspectRatio: AspectRatio;
  quality: Quality;
}

// Default parameters
const DEFAULT_PARAMS: StoredGenParams = {
  aspectRatio: "1:1",
  quality: "standard",
};

// Load params from localStorage with error handling
function loadStoredParams(): StoredGenParams {
  if (typeof window === "undefined") return DEFAULT_PARAMS;

  try {
    const stored = localStorage.getItem(GEN_PARAMS_STORAGE_KEY);
    if (!stored) return DEFAULT_PARAMS;

    const parsed = JSON.parse(stored) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "aspectRatio" in parsed &&
      "quality" in parsed &&
      typeof parsed.aspectRatio === "string" &&
      typeof parsed.quality === "string" &&
      ["1:1", "4:3", "16:9", "3:4", "9:16"].includes(parsed.aspectRatio) &&
      ["standard", "hd"].includes(parsed.quality)
    ) {
      return parsed as StoredGenParams;
    }

    return DEFAULT_PARAMS;
  } catch (error) {
    console.warn("Failed to load generation params from localStorage:", error);
    return DEFAULT_PARAMS;
  }
}

// Save params to localStorage
function saveStoredParams(params: StoredGenParams): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(GEN_PARAMS_STORAGE_KEY, JSON.stringify(params));
  } catch (error) {
    console.warn("Failed to save generation params to localStorage:", error);
  }
}

interface OutputSettingsProps {
  state: WorkspaceState;
  generationUnavailable: boolean;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  // T04: degradation / error props
  generationQueueing: boolean;
  error: WorkspaceError | null;
  onRetry: () => void;
}

export function OutputSettings({
  state,
  generationUnavailable,
  onGenerate,
  generationQueueing,
  error,
  onRetry,
}: OutputSettingsProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    return loadStoredParams().aspectRatio;
  });
  const [quality, setQuality] = useState<Quality>(() => {
    return loadStoredParams().quality;
  });

  const isGenerating = state === "generating";
  const isAnalysisReady = state === "analysis_ready";
  const isGenerationReady = state === "generation_ready";
  const isHistoryRestored = state === "history_restored";

  const canGenerate =
    (isAnalysisReady || isGenerationReady || isHistoryRestored) && !generationUnavailable;

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    onGenerate({ aspectRatio, quality });
  }, [canGenerate, onGenerate, aspectRatio, quality]);

  const handleAspectRatioChange = useCallback(
    (value: AspectRatio) => {
      setAspectRatio(value);
      saveStoredParams({ aspectRatio: value, quality });
    },
    [quality],
  );

  const handleQualityChange = useCallback(
    (value: Quality) => {
      setQuality(value);
      saveStoredParams({ aspectRatio, quality: value });
    },
    [aspectRatio],
  );

  // Button label changes with state
  const buttonLabel = isGenerating
    ? "GENERATING..."
    : "GENERATE";

  const panelTitle = isGenerationReady ? "Generate Again" : "Output Settings";

  // --- Degradation / error conditions ---
  const showGenerationError =
    isGenerationReady && error?.stage === "generation";

  const showL2Unavailable = generationUnavailable;
  const showL1Queueing = isGenerating && generationQueueing;

  return (
    <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
      <h3 className="text-base font-bold text-[var(--text-primary)]">
        {panelTitle}
      </h3>

      {/* Generation error (priority over degradation hints) */}
      {showGenerationError && error && (
        <div className="space-y-3">
          {error.code ? (
            <ErrorDisplay
              code={error.code as ApiErrorCode}
              message={error.message}
              retryable={error.retryable ?? true}
              onRetry={onRetry}
            />
          ) : (
            <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4">
              <p className="text-sm font-medium text-[var(--color-error)]">Generation Failed</p>
              <p className="mt-1 text-xs text-[var(--color-error)]/80">{error.message}</p>
              <div className="mt-3">
                <RetryButton type="generation" onRetry={onRetry} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* L2: generation service unavailable */}
      {showL2Unavailable && !showGenerationError && (
        <div className="rounded-lg border border-[var(--readiness-waiting-border)] bg-[var(--color-warning-soft)] p-4">
          <p className="text-sm font-medium text-[var(--readiness-waiting-text)]">
            Image generation is temporarily unavailable
          </p>
          <p className="mt-1 text-xs text-[var(--readiness-waiting-text)]/80">
            Analysis results and the prompt editor remain available.
          </p>
        </div>
      )}

      {/* L1: generation queueing */}
      {showL1Queueing && (
        <div className="rounded-lg border border-[var(--readiness-waiting-border)] bg-[var(--color-warning-soft)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--color-warning)] border-t-transparent motion-reduce:animate-none" />
            <div>
              <p className="text-sm font-medium text-[var(--readiness-waiting-text)]">
                Generation is queued. Thanks for waiting
              </p>
              <p className="text-xs text-[var(--readiness-waiting-text)]/80">
                High demand may make generation take longer
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Normal generation progress (not queueing) */}
      {isGenerating && !showL1Queueing && (
        <GenerationProgress isGenerating={isGenerating} />
      )}

      {/* Aspect ratio selector */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          Aspect Ratio
        </label>
        <div className="flex flex-wrap gap-2">
          {ASPECT_RATIOS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleAspectRatioChange(option.value)}
              disabled={isGenerating}
              aria-disabled={isGenerating}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                aspectRatio === option.value
                  ? "bg-[var(--accent-primary)] text-[var(--text-on-primary)]"
                  : "bg-[var(--surface-bright)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
              } ${isGenerating ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality selector */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          Quality
        </label>
        <div className="flex gap-2">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleQualityChange(option.value)}
              disabled={isGenerating}
              aria-disabled={isGenerating}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                quality === option.value
                  ? "bg-[var(--accent-primary)] text-[var(--text-on-primary)]"
                  : "bg-[var(--surface-bright)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
              } ${isGenerating ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating}
        className={`w-full rounded-lg px-6 py-3 text-sm font-medium transition-colors ${
          canGenerate && !isGenerating
            ? "btn-primary"
            : "cursor-not-allowed bg-[var(--surface-bright)] text-[var(--text-secondary)]"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
