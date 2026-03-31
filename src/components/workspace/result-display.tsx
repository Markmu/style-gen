"use client";

import { useState } from "react";
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

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-700">生成结果</h3>

      {/* Result image */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full overflow-hidden rounded-lg border border-gray-100"
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
      <div className="space-y-2 text-xs text-gray-500">
        <div className="flex gap-3">
          <span>宽高比: {params.aspectRatio}</span>
          <span>画质: {params.quality === "hd" ? "高清" : "标准"}</span>
        </div>
        <details className="cursor-pointer">
          <summary className="text-xs font-medium text-gray-600">
            查看使用的 Prompt
          </summary>
          <div className="mt-2 space-y-1 rounded bg-gray-50 p-2 text-xs text-gray-600">
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
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          下载图片
        </a>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
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
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsExpanded(false);
          }}
          role="button"
          tabIndex={0}
        >
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
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">生成失败</p>
      <p className="mt-1 text-xs text-red-600">{errorMessage}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
      >
        重试
      </button>
    </div>
  );
}
