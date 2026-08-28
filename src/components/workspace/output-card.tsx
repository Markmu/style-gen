"use client";

import { useCallback } from "react";
import { ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import type { RenderReadiness } from "@/lib/render-readiness";
import {
  DEFAULT_IMAGE_GEN_MODEL_ID,
  IMAGE_GEN_MODEL_OPTIONS,
} from "@/lib/ai/model-config";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

interface OutputCardParams {
  aspectRatio: AspectRatio;
  quality: Quality;
  /** models.json 稳定模型 id；由页面状态以配置默认模型初始化 */
  model: string;
}

interface OutputCardProps {
  state: WorkspaceState;
  params: OutputCardParams;
  readiness: RenderReadiness;
  onParamsChange: (params: OutputCardParams) => void;
  onGenerate: (params: OutputCardParams) => void;
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
  const selectedModel = params.model ?? DEFAULT_IMAGE_GEN_MODEL_ID;

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

  const handleModelChange = useCallback(
    (model: string) => {
      onParamsChange({ ...params, model });
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
          className="grid min-w-0 grid-cols-2 gap-2 rounded-lg bg-[var(--surface-control)]/58 p-1.5 sm:grid-cols-3"
        >
          <label className="group grid min-w-0 gap-1.5">
            <span className="px-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Ratio
            </span>
            <span className="relative block min-w-0">
              <select
                aria-label="Aspect Ratio"
                value={params.aspectRatio}
                disabled={isGenerating}
                onChange={(event) => handleAspectRatioChange(event.target.value as AspectRatio)}
                className="render-select h-9 min-w-0"
              >
                {ASPECT_RATIOS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <AppIcon
                icon={ChevronDown}
                size={14}
                strokeWidth={1.5}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
              />
            </span>
          </label>

          <label className="group grid min-w-0 gap-1.5">
            <span className="px-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Quality
            </span>
            <span className="relative block min-w-0">
              <select
                aria-label="Quality"
                value={params.quality}
                disabled={isGenerating}
                onChange={(event) => handleQualityChange(event.target.value as Quality)}
                className="render-select h-9 min-w-0"
              >
                {QUALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <AppIcon
                icon={ChevronDown}
                size={14}
                strokeWidth={1.5}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
              />
            </span>
          </label>

          <label className="group grid min-w-0 gap-1.5">
            <span className="px-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Model
            </span>
            <span className="relative block min-w-0">
              <select
                aria-label="Model"
                value={selectedModel}
                disabled={isGenerating}
                onChange={(event) => handleModelChange(event.target.value)}
                className="render-select h-9 min-w-0"
              >
                {IMAGE_GEN_MODEL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <AppIcon
                icon={ChevronDown}
                size={14}
                strokeWidth={1.5}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
              />
            </span>
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
          <AppIcon
            icon={isGenerating ? LoaderCircle : Sparkles}
            size={16}
            className={isGenerating ? "animate-spin" : undefined}
          />
          <span>{buttonLabel}</span>
        </button>
      </div>

      {/* plan-07（ADR-7）：就绪结论单一来源——Memory 复用中的缺失必填清单与身份条消费同一对象 */}
      {readiness.memoryActive && readiness.missingVariableNames.length > 0 && (
        <p
          data-testid="output-card-missing-variables"
          role="status"
          className="truncate px-1 text-xs leading-5 text-[var(--color-warning)]"
        >
          {readiness.missingVariableNames.length} fields left to fill:{" "}
          {readiness.missingVariableNames.join(", ")}
        </p>
      )}
    </section>
  );
}
