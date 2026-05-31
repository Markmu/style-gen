"use client";

import type { WorkspaceState } from "@/hooks/use-workspace-state";

interface FloatingGenerateButtonProps {
  state: WorkspaceState;
  canGenerate: boolean;
  disabledReason?: string;
  onGenerate: () => void;
}

export function FloatingGenerateButton({
  state,
  canGenerate,
  disabledReason = "Add a prompt before generating",
  onGenerate,
}: FloatingGenerateButtonProps) {
  const isGenerating = state === "generating";
  const isDone = state === "generation_ready";
  const enabled = canGenerate && !isGenerating;
  const label = isGenerating ? "Generating" : isDone ? "Generate Again" : "Generate";

  return (
    <div className="pointer-events-none fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
      <button
        type="button"
        data-testid="floating-generate-button"
        onClick={onGenerate}
        disabled={!enabled}
        title={enabled ? "Generate image" : disabledReason}
        className={`pointer-events-auto flex min-h-[4.75rem] min-w-[6.75rem] flex-col items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-all duration-200 ${
          enabled
            ? "btn-primary shadow-[0_18px_42px_color-mix(in_oklch,var(--accent-primary)_24%,transparent)]"
            : "cursor-not-allowed bg-[var(--surface-control)] text-[var(--text-muted)] ring-1 ring-[var(--border-static)]"
        }`}
        aria-label={label}
      >
        <span
          className={`icon text-[22px] ${isGenerating ? "animate-spin" : ""}`}
          aria-hidden="true"
        >
          {isGenerating ? "progress_activity" : "bolt"}
        </span>
        <span className="mt-1">{label}</span>
        <span className="mt-0.5 text-[10px] font-medium opacity-75">
          Enter
        </span>
      </button>
    </div>
  );
}
