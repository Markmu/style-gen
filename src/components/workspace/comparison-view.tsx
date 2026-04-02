"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface ComparisonViewProps {
  referenceImageUrl: string;
  resultImageUrl: string;
  aspectRatio?: string; // 从生成参数传入，如 "9:16", "16:9", "1:1"
}

export function ComparisonView({
  referenceImageUrl,
  resultImageUrl,
  aspectRatio,
}: ComparisonViewProps) {
  const [layoutMode, setLayoutMode] = useState<"side-by-side" | "stacked">("side-by-side");

  useEffect(() => {
    // 优先使用传入的 aspectRatio 参数
    if (aspectRatio) {
      const ratio = parseAspectRatio(aspectRatio);
      setLayoutMode(determineLayout(ratio));
      return;
    }

    // 如果没有 aspectRatio，加载图片获取自然尺寸
    const img = new window.Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      setLayoutMode(determineLayout(ratio));
    };
    img.onerror = () => {
      // 加载失败时使用默认布局
      setLayoutMode("side-by-side");
    };
    img.src = referenceImageUrl;
  }, [referenceImageUrl, aspectRatio]);

  // 解析 aspectRatio 字符串（如 "9:16" -> 0.5625, "16:9" -> 1.777）
  const parseAspectRatio = (ratio: string): number => {
    const [w, h] = ratio.split(":").map(Number);
    if (w && h && !isNaN(w) && !isNaN(h)) {
      return w / h;
    }
    return 1; // 默认方形
  };

  // 根据宽高比决定布局模式
  // 横版（宽高比 > 1.2）并排，竖版（< 0.8）堆叠，方形/接近方形并排
  const determineLayout = (ratio: number): "side-by-side" | "stacked" => {
    if (ratio < 0.8) return "stacked";
    return "side-by-side";
  };

  return (
    <div className="rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
        参考图 vs 生成结果
      </h3>
      <div className={layoutMode === "side-by-side" ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        {/* Reference image */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">参考图</p>
          <div className="overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
            <Image
              src={referenceImageUrl}
              alt="参考图"
              width={512}
              height={512}
              className="h-auto w-full object-contain"
              unoptimized
            />
          </div>
        </div>

        {/* Result image */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">生成结果</p>
          <div className="overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
            <Image
              src={resultImageUrl}
              alt="生成结果"
              width={512}
              height={512}
              className="h-auto w-full object-contain"
              unoptimized
            />
          </div>
        </div>
      </div>
    </div>
  );
}
