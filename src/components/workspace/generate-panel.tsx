"use client";

import { useState, useCallback } from "react";
import type { WorkspaceState } from "@/hooks/use-workspace-state";

export type AspectRatio = "1:1" | "4:3" | "16:9" | "3:4" | "9:16";
export type Quality = "standard" | "hd";

const ASPECT_RATIOS: { label: string; value: AspectRatio }[] = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "16:9", value: "16:9" },
  { label: "3:4", value: "3:4" },
  { label: "9:16", value: "9:16" },
];

const QUALITY_OPTIONS: { label: string; value: Quality }[] = [
  { label: "标准", value: "standard" },
  { label: "高清", value: "hd" },
];

interface GeneratePanelProps {
  workspaceState: WorkspaceState;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  /** 降级状态下禁用生成按钮 */
  disabled?: boolean;
}

export function GeneratePanel({
  workspaceState,
  onGenerate,
  disabled = false,
}: GeneratePanelProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [quality, setQuality] = useState<Quality>("standard");

  const isGenerating = workspaceState === "generating";
  const isAnalysisReady = workspaceState === "analysis_ready";
  const isGenerationReady = workspaceState === "generation_ready";

  const canGenerate = (isAnalysisReady || isGenerationReady) && !disabled;

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    onGenerate({ aspectRatio, quality });
  }, [canGenerate, onGenerate, aspectRatio, quality]);

  const buttonLabel = isGenerating
    ? "生成中..."
    : isGenerationReady
      ? "重新生成"
      : "生成图片";

  return (
    <div className="space-y-4 rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]/15">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)]">生成参数</h3>

      {/* Aspect ratio selector */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          宽高比
        </label>
        <div className="flex flex-wrap gap-2">
          {ASPECT_RATIOS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAspectRatio(option.value)}
              disabled={isGenerating}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                aspectRatio === option.value
                  ? "bg-[var(--accent-primary)] text-white"
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
          画质
        </label>
        <div className="flex gap-2">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setQuality(option.value)}
              disabled={isGenerating}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                quality === option.value
                  ? "bg-[var(--accent-primary)] text-white"
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
            ? "btn-glow text-white"
            : "cursor-not-allowed bg-[var(--surface-bright)] text-[var(--text-secondary)]"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
