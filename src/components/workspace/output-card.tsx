"use client";

import { useCallback } from "react";
import { ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import type { RenderReadiness } from "@/lib/render-readiness";
import {
  SUPPORTED_ASPECT_RATIOS,
  type AspectRatioSource,
} from "@/lib/generation/aspect-ratio";
import {
  DEFAULT_IMAGE_GEN_MODEL_ID,
  IMAGE_GEN_MODEL_OPTIONS,
} from "@/lib/ai/model-config";

// plan-04（架构 §6.3 实现原则）：画幅选项只消费 plan-01 的共享白名单，
// Render Dock 不复制第二份常量。
const ASPECT_RATIOS = SUPPORTED_ASPECT_RATIOS;
const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

/** 画幅来源徽标文案；fallback 不冒充「参考图推荐」（架构 §6.3.5） */
const ASPECT_RATIO_SOURCE_LABELS: Record<AspectRatioSource, string> = {
  reference: "参考图推荐",
  user: "Your selection",
  restore: "Restored iteration",
  fallback: "1:1 fallback",
};

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
  /**
   * plan-02（ADR-2）：快速复刻 armed 期间生成设置只读——自动任务将使用
   * 已确认设置；用户退出快速路径后恢复可编辑。Generate 按钮仍由 readiness 决定。
   */
  settingsLocked?: boolean;
  /**
   * plan-04（架构 §6.3 / AC-03）：画幅来源徽标。reference 显示「参考图推荐」，
   * user/restore 说明更高优先级来源，fallback 只说明回退、不冒充推荐。
   */
  aspectRatioSource?: AspectRatioSource;
  /**
   * plan-07（架构 §8.2 L1 / Task 5 降级文案收口）：生成排队（>60s）提示的
   * 内联呈现位。旧载体是阻断式 GenerationDialog（已退场）；按 DESIGN.md
   * 「Render Dock Readiness」契约，忙碌/排队状态在 Render Dock 一处可扫读。
   */
  generationQueueing?: boolean;
}

export function OutputCard({
  state,
  params,
  readiness,
  onParamsChange,
  onGenerate,
  settingsLocked = false,
  aspectRatioSource,
  generationQueueing = false,
}: OutputCardProps) {
  const isGenerating = state === "generating";
  const enabled = readiness.canGenerate && !isGenerating;
  const settingsDisabled = isGenerating || settingsLocked;
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
      {/* plan-07（架构 §8.2 L1）：生成排队（>60s）内联提示——旧弹窗载体退场后
          的唯一呈现位；三段式（发生了什么 / 保留了什么 / 下一步） */}
      {isGenerating && generationQueueing && (
        <div
          data-testid="generation-queueing-note"
          role="status"
          className="mb-2 flex items-start gap-2.5 rounded-lg bg-[var(--color-warning-soft)] p-2.5 ring-1 ring-[var(--border-interactive)]"
        >
          <AppIcon
            icon={LoaderCircle}
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-warning)] motion-reduce:animate-none"
          />
          <p className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">
            Generation is queued. Thanks for waiting。当前 Prompt、参考与生成参数
            保持不变；任务完成后，结果会直接进入本次结果区。
          </p>
        </div>
      )}
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
                disabled={settingsDisabled}
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
                disabled={settingsDisabled}
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
                disabled={settingsDisabled}
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

        {/* plan-04（AC-03）：画幅来源徽标——仅 reference 标「参考图推荐」，fallback 不冒充 */}
        {aspectRatioSource && (
          <p
            data-testid="aspect-ratio-source"
            data-source={aspectRatioSource}
            data-recommended={aspectRatioSource === "reference" ? "true" : "false"}
            className="mt-1 truncate px-1 text-[0.625rem] font-medium leading-4 text-[var(--text-muted)]"
          >
            {ASPECT_RATIO_SOURCE_LABELS[aspectRatioSource]}
          </p>
        )}

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
