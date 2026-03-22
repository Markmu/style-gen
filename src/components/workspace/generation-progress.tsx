"use client";

import { useEffect, useState } from "react";

interface GenerationProgressProps {
  isGenerating: boolean;
}

export function GenerationProgress({ isGenerating }: GenerationProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0);
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isGenerating]);

  if (!isGenerating) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex items-center gap-3">
        {/* Spinner */}
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
        <div>
          <p className="text-sm font-medium text-indigo-800">
            正在生成图片...
          </p>
          <p className="text-xs text-indigo-600">
            已等待 {elapsed} 秒 · 预计需要 10-60 秒
          </p>
        </div>
      </div>
    </div>
  );
}
