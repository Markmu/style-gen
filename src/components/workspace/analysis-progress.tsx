"use client";

import { useEffect, useState } from "react";

interface AnalysisProgressProps {
  isAnalyzing: boolean;
  error: { message: string; stage?: string } | null;
  onRetry: () => void;
}

export function AnalysisProgress({
  isAnalyzing,
  error,
  onRetry,
}: AnalysisProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) {
      setElapsed(0);
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isAnalyzing]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-700">分析失败</p>
        {error.stage && (
          <p className="mt-1 text-sm text-red-600">
            阶段：{error.stage === "vision" ? "视觉理解" : "LLM 结构化"}
          </p>
        )}
        <p className="mt-2 text-sm text-red-600">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          重新分析
        </button>
      </div>
    );
  }

  if (!isAnalyzing) return null;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 p-6">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="font-medium text-blue-700">AI 正在分析图片风格...</p>
      </div>
      <p className="text-sm text-blue-500">已用时 {elapsed} 秒</p>
    </div>
  );
}
