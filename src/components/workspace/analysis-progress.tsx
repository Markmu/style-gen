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
      <div className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-6">
        <p className="font-medium text-[var(--color-error)]">Analysis Failed</p>
        {error.stage && (
          <p className="mt-1 text-sm text-[var(--color-error)]/80">
            Stage: {error.stage === "vision" ? "Vision Understanding" : "LLM Structuring"}
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--color-error)]/80">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-[var(--text-on-primary)] transition-colors hover:bg-[var(--color-error)]/80"
        >
          Analyze Again
        </button>
      </div>
    );
  }

  if (!isAnalyzing) return null;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--color-info)]/30 bg-[var(--color-info-soft)] p-6">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-info)] border-t-transparent" />
        <p className="font-medium text-[var(--color-info)]">AI is analyzing the image style...</p>
      </div>
      <p className="text-sm text-[var(--color-info)]/80">Elapsed {elapsed}s</p>
    </div>
  );
}
