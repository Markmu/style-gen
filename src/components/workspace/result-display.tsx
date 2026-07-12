"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
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
      <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Generated Result</h3>

      {/* Result image */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full overflow-hidden rounded-lg ring-1 ring-[var(--border-static)]"
        >
          <Image
            src={resultImageUrl}
            alt="Generated Result"
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
          <span>Aspect Ratio: {params.aspectRatio}</span>
          <span>Quality: {params.quality === "hd" ? "HD" : "Standard"}</span>
        </div>
        <details className="cursor-pointer">
          <summary className="text-xs font-medium text-[var(--text-secondary)]">
            View Prompt Used
          </summary>
          <div className="mt-2 space-y-1 rounded bg-[var(--surface-low)] p-2 text-xs text-[var(--text-secondary)]">
            <p>
              <span className="font-medium">Positive:</span> {promptSnapshot}
            </p>
            {negativePromptSnapshot && (
              <p>
                <span className="font-medium">Negative:</span>{" "}
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
          Download Image
        </a>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-bright)]"
          >
            Upload New Image
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
            aria-label="Close fullscreen preview"
          >
            <AppIcon icon={X} size={24} />
          </button>

          <Image
            src={resultImageUrl}
            alt="Generated result enlarged"
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
      <p className="text-sm font-medium text-[var(--color-error)]">Generation Failed</p>
      <p className="mt-1 text-xs text-[var(--color-error)]/80">{errorMessage}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md bg-[var(--color-error)] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-error)]/80"
      >
        Retry
      </button>
    </div>
  );
}
