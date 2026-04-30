"use client";

import { useCallback } from "react";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: { label: string; value: Quality }[] = [
  { label: "标准", value: "standard" },
  { label: "高清", value: "hd" },
];

interface LightGeneratePanelProps {
  state: WorkspaceState;
  promptText: string;
  params: { aspectRatio: AspectRatio; quality: Quality };
  generationUnavailable: boolean;
  error: WorkspaceError | null;
  onParamsChange: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onRetry: () => void;
}

export function LightGeneratePanel({
  state,
  promptText,
  params,
  generationUnavailable,
  error,
  onParamsChange,
  onGenerate,
  onRetry,
}: LightGeneratePanelProps) {
  const isGenerating = state === "generating";
  const promptReady = promptText.trim().length > 0;
  const stateReady =
    state === "analysis_ready" ||
    state === "generation_ready" ||
    state === "history_restored";
  const canGenerate = stateReady && promptReady && !generationUnavailable && !isGenerating;

  const unavailableReason = !promptReady
    ? "需要先获得或填写完整生成提示"
    : generationUnavailable
      ? "图片生成服务暂时不可用"
      : !stateReady
        ? "完成分析后即可生成"
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

  return (
    <div
      data-testid="light-generate-panel"
      className="surface-panel min-w-0 shrink-0 overflow-hidden rounded-xl p-4"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="label-tech text-[var(--text-muted)]">Generate</p>
        {error?.stage === "generation" && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-secondary rounded-md px-3 py-1.5 text-xs"
          >
            恢复生成
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <div>
            <span className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              宽高比
            </span>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleAspectRatioChange(value)}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    params.aspectRatio === value
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--surface-bright)] text-[var(--text-secondary)]"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              画质
            </span>
            <div className="flex flex-wrap gap-2">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleQualityChange(option.value)}
                  className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                    params.quality === option.value
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--surface-bright)] text-[var(--text-secondary)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-[160px]">
          {unavailableReason && (
            <p className="mb-2 text-xs leading-5 text-[var(--text-secondary)]">
              {unavailableReason}
            </p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="btn-primary w-full rounded-lg px-5 py-3 text-sm font-medium"
          >
            {isGenerating ? "正在生成..." : state === "generation_ready" ? "重新生成" : "生成图片"}
          </button>
        </div>
      </div>
    </div>
  );
}
