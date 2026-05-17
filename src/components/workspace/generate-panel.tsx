"use client";

import { useState, useCallback } from "react";
import type { WorkspaceState } from "@/hooks/use-workspace-state";

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
  { label: "标准", value: "standard" },
  { label: "高清", value: "hd" },
];

// localStorage 存储的数据结构
interface StoredGenParams {
  aspectRatio: AspectRatio;
  quality: Quality;
}

// 默认参数
const DEFAULT_PARAMS: StoredGenParams = {
  aspectRatio: "1:1",
  quality: "standard",
};

// 从 localStorage 读取参数，带容错处理
function loadStoredParams(): StoredGenParams {
  if (typeof window === "undefined") return DEFAULT_PARAMS;

  try {
    const stored = localStorage.getItem(GEN_PARAMS_STORAGE_KEY);
    if (!stored) return DEFAULT_PARAMS;

    const parsed = JSON.parse(stored) as unknown;

    // 验证数据结构
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

    // 数据格式不兼容，忽略旧数据
    return DEFAULT_PARAMS;
  } catch (error) {
    // localStorage 不可用或解析失败，使用默认值
    console.warn("Failed to load generation params from localStorage:", error);
    return DEFAULT_PARAMS;
  }
}

// 保存参数到 localStorage
function saveStoredParams(params: StoredGenParams): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(GEN_PARAMS_STORAGE_KEY, JSON.stringify(params));
  } catch (error) {
    console.warn("Failed to save generation params to localStorage:", error);
  }
}

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
  // 组件初始化时从 localStorage 恢复参数
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    return loadStoredParams().aspectRatio;
  });
  const [quality, setQuality] = useState<Quality>(() => {
    return loadStoredParams().quality;
  });

  const isGenerating = workspaceState === "generating";
  const isAnalysisReady = workspaceState === "analysis_ready";
  const isGenerationReady = workspaceState === "generation_ready";

  const canGenerate = (isAnalysisReady || isGenerationReady) && !disabled;

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;
    onGenerate({ aspectRatio, quality });
  }, [canGenerate, onGenerate, aspectRatio, quality]);

  // 用户选择变更时写入 localStorage
  const handleAspectRatioChange = useCallback((value: AspectRatio) => {
    setAspectRatio(value);
    saveStoredParams({ aspectRatio: value, quality });
  }, [quality]);

  const handleQualityChange = useCallback((value: Quality) => {
    setQuality(value);
    saveStoredParams({ aspectRatio, quality: value });
  }, [aspectRatio]);

  const buttonLabel = isGenerating
    ? "GENERATING..."
    : "GENERATE";

  return (
    <div className="space-y-4 rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]/15">

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
              onClick={() => handleAspectRatioChange(option.value)}
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
              onClick={() => handleQualityChange(option.value)}
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
            ? "btn-primary text-white"
            : "cursor-not-allowed bg-[var(--surface-bright)] text-[var(--text-secondary)]"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
