"use client";

import { useState, useEffect } from "react";

/**
 * plan-05（ADR-7 / 架构 §6.5.1）：参考 vs 结果真实双图视图。
 *
 * - 图片 URL 缺失时显示真实缺失态（说明缺什么、还能做什么），不渲染占位假图；
 * - 布局跟随画幅：横图并排（grid-cols-2）、竖图堆叠；
 * - img 本身挂 testid（comparison-reference-image / comparison-result-image），
 *   src 直接使用真实 URL。
 */

interface ComparisonViewProps {
  /** 参考图 URL；null/空时渲染真实缺失态（架构 §6.5.1） */
  referenceImageUrl: string | null;
  /** 结果图 URL；null/空时渲染真实缺失态 */
  resultImageUrl: string | null;
  aspectRatio?: string; // 从生成参数传入，如 "9:16", "16:9", "1:1"
}

export function ComparisonView({
  referenceImageUrl,
  resultImageUrl,
  aspectRatio,
}: ComparisonViewProps) {
  const [layoutMode, setLayoutMode] = useState<"side-by-side" | "stacked">("side-by-side");

  // 解析 aspectRatio 字符串（如 "9:16" -> 0.5625, "16:9" -> 1.777）
  const parseAspectRatio = (ratio: string): number => {
    const [w, h] = ratio.split(":").map(Number);
    if (w && h && !isNaN(w) && !isNaN(h)) {
      return w / h;
    }
    return 1; // 默认方形
  };

  // Landscape images sit side by side; portrait images stack.
  const determineLayout = (ratio: number): "side-by-side" | "stacked" => {
    if (ratio < 0.8) return "stacked";
    return "side-by-side";
  };

  useEffect(() => {
    // 优先使用传入的 aspectRatio 参数
    if (aspectRatio) {
      setLayoutMode(determineLayout(parseAspectRatio(aspectRatio)));
      return;
    }

    // 如果没有 aspectRatio 且参考图可用，加载图片获取自然尺寸
    if (!referenceImageUrl) return;
    const img = new window.Image();
    img.onload = () => {
      setLayoutMode(determineLayout(img.width / img.height));
    };
    img.onerror = () => {
      // 加载失败时使用默认布局
      setLayoutMode("side-by-side");
    };
    img.src = referenceImageUrl;
  }, [referenceImageUrl, aspectRatio]);

  return (
    <div className="rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
        Reference vs Generated Result
      </h3>
      <div className={layoutMode === "side-by-side" ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        {/* Reference image */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">Reference</p>
          {referenceImageUrl ? (
            <div className="overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-testid="comparison-reference-image"
                src={referenceImageUrl}
                alt="Reference"
                width={512}
                height={512}
                className="h-auto w-full object-contain"
              />
            </div>
          ) : (
            <div
              data-testid="comparison-reference-missing"
              className="flex min-h-24 items-center justify-center rounded-lg bg-[var(--surface-low)] px-3 py-4 text-center ring-1 ring-[var(--border)]"
            >
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                参考图不可用。本次比较缺少来源参考，可打开完整 Iteration 查看
                来源记录。
              </p>
            </div>
          )}
        </div>

        {/* Result image */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">Generated Result</p>
          {resultImageUrl ? (
            <div className="overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-testid="comparison-result-image"
                src={resultImageUrl}
                alt="Generated Result"
                width={512}
                height={512}
                className="h-auto w-full object-contain"
              />
            </div>
          ) : (
            <div
              data-testid="comparison-result-missing"
              className="flex min-h-24 items-center justify-center rounded-lg bg-[var(--surface-low)] px-3 py-4 text-center ring-1 ring-[var(--border)]"
            >
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                结果图片不可用。该结果缺少可展示的图片资产，可重试加载或打开
                完整 Iteration。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
