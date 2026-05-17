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
    <div className="rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 p-4">
      <div className="flex items-center gap-3">
        {/* Spinner */}
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-primary)]/40 border-t-[var(--accent-primary)]" />
        <div>
          <p className="text-sm font-medium text-[var(--accent-primary)]">
            Generating image...
          </p>
          <p className="text-xs text-[var(--accent-primary)]/70">
            Waited {elapsed}s · usually takes 10-60s
          </p>
        </div>
      </div>
    </div>
  );
}
