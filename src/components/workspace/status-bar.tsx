"use client";

import type { WorkspaceState, WorkspaceError } from "@/hooks/use-workspace-state";
import {
  TopModeSwitcher,
  type ManualModeOverride,
  type TopMode,
} from "@/components/workspace/top-mode-switcher";

interface StatusBarProps {
  state: WorkspaceState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  promptText: string;
  manualModeOverride: ManualModeOverride;
  onModeChange: (mode: TopMode) => void;
  onReplace: () => void;
}

export function StatusBar({
  state,
  resultImageUrl,
  promptText,
  manualModeOverride,
  onModeChange,
  onReplace,
}: StatusBarProps) {
  const canReplace =
    state === "analysis_ready" ||
    state === "generating" ||
    state === "generation_ready" ||
    state === "history_restored" ||
    !!resultImageUrl;

  return (
    <div
      data-testid="workspace-status-bar"
      className="workspace-status-bar grid min-h-14 grid-cols-[minmax(160px,1fr)_auto_minmax(160px,1fr)] items-center gap-4 px-6 py-2"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-[var(--text-primary)]">
            Workspace
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Style Gen
          </p>
        </div>
      </div>

      <div className="flex min-w-0 justify-center">
        <TopModeSwitcher
          state={state}
          promptText={promptText}
          manualModeOverride={manualModeOverride}
          onModeChange={onModeChange}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        {canReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          >
            Replace Reference
          </button>
        )}
        <button
          type="button"
          aria-label="Workspace help"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
        >
          <span className="icon text-[18px]" aria-hidden="true">
            help
          </span>
        </button>
        <div
          aria-label="User avatar"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-bright)] text-[10px] font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-static)]"
        >
          SG
        </div>
      </div>
    </div>
  );
}
