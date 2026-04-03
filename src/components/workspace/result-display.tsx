"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { GenerationParams } from "@/types/models";

interface ResultDisplayProps {
  resultImageUrl: string;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  onReset?: () => void;
}

export function ResultDisplay({
  resultImageUrl,
  promptSnapshot,
  negativePromptSnapshot,
  params,
  onReset,
}: ResultDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 全局 Esc 键监听，不依赖焦点
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      window.addEventListener("keydown", handleKeyDown);
      // 防止背景滚动
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  return (
    <div className="space-y-3 rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border-static)]">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)]">生成结果</h3>

      {/* Result image */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full overflow-hidden rounded-lg ring-1 ring-[var(--border-static)]"
        >
          <Image
            src={resultImageUrl}
            alt="生成结果"
            width={512}
            height={512}
            className="h-auto w-full object-contain"
            unoptimized
          />
        </button>
      </div>

      {/* Generation params info */}
      <div className="space-y-2 text-xs text-[var(--text-secondary)]">
        <div className="flex gap-3">
          <span>宽高比: {params.aspectRatio}</span>
          <span>画质: {params.quality === "hd" ? "高清" : "标准"}</span>
        </div>
        <details className="cursor-pointer">
          <summary className="text-xs font-medium text-[var(--text-secondary)]">
            查看使用的 Prompt
          </summary>
          <div className="mt-2 space-y-1 rounded bg-[var(--surface-low)] p-2 text-xs text-[var(--text-secondary)]">
            <p>
              <span className="font-medium">正向:</span> {promptSnapshot}
            </p>
            {negativePromptSnapshot && (
              <p>
                <span className="font-medium">反向:</span>{" "}
                {negativePromptSnapshot}
              </p>
            )}
          </div>
        </details>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <a
          href={resultImageUrl}
          download
          className="flex-1 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-center text-sm font-medium text-white ring-1 ring-[var(--border-interactive)] transition-colors hover:bg-[var(--accent-primary-dim)]"
        >
          下载图片
        </a>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-bright)]"
          >
            上传新图
          </button>
        )}
      </div>

      {/* Fullscreen overlay */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setIsExpanded(false)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="关闭全屏查看"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>

          <Image
            src={resultImageUrl}
            alt="生成结果（放大）"
            width={1024}
            height={1024}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            unoptimized
          />
        </div>
      )}
    </div>
  );
}

interface ResultErrorProps {
  errorMessage: string;
  onRetry: () => void;
}

export function ResultError({ errorMessage, onRetry }: ResultErrorProps) {
  return (
    <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4">
      <p className="text-sm font-medium text-[var(--color-error)]">生成失败</p>
      <p className="mt-1 text-xs text-[var(--color-error)]/80">{errorMessage}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md bg-[var(--color-error)] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-error)]/80"
      >
        重试
      </button>
    </div>
  );
}
