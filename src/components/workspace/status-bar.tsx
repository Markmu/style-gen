"use client";

import type { WorkspaceState, WorkspaceError } from "@/hooks/use-workspace-state";

interface StatusBarConfig {
  label: string;
  description: string;
  showReplaceButton: boolean;
}

const STATUS_BAR_CONFIG: Record<WorkspaceState, StatusBarConfig> = {
  idle: {
    label: "Not Started",
    description: "Upload a reference, extract style traits, then generate an image you can keep iterating",
    showReplaceButton: false,
  },
  uploading: {
    label: "Not Started",
    description: "Upload a reference, extract style traits, then generate an image you can keep iterating",
    showReplaceButton: false,
  },
  analyzing: {
    label: "Analyzing",
    description: "AI is analyzing the reference image style traits",
    showReplaceButton: false,
  },
  analysis_ready: {
    label: "Ready to Generate",
    description: "AI has extracted the reference style traits. You can refine the generation intent.",
    showReplaceButton: true,
  },
  generating: {
    label: "Generating",
    description: "Generating image. Please wait.",
    showReplaceButton: true,
  },
  generation_ready: {
    label: "Done",
    description: "First result is ready. Compare, download, or keep iterating.",
    showReplaceButton: true,
  },
  history_restored: {
    label: "History Restored",
    description: "Restored from history. Adjust settings and generate again.",
    showReplaceButton: true,
  },
};

interface StatusBarProps {
  state: WorkspaceState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  onReplace: () => void;
}

export function StatusBar({ state, onReplace }: StatusBarProps) {
  const config = STATUS_BAR_CONFIG[state];

  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-2">
      {/* Left: title + description */}
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="shrink-0 text-sm font-bold text-[var(--text-primary)]">
          Create From Reference
        </h2>
        <span className="truncate text-xs text-[var(--text-secondary)]">
          {config.description}
        </span>
      </div>

      {/* Right: status badge + replace button */}
      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge label={config.label} state={state} />
        {config.showReplaceButton && (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-md px-2.5 py-1 text-xs text-[var(--text-secondary)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-bright)]"
          >
            Replace Reference
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  state,
}: {
  label: string;
  state: WorkspaceState;
}) {
  const colorClass = getStatusColor(state);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function getStatusColor(state: WorkspaceState): string {
  switch (state) {
    case "idle":
    case "uploading":
      return "bg-[var(--surface-bright)] text-[var(--text-secondary)]";
    case "analyzing":
    case "generating":
      return "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]";
    case "analysis_ready":
      return "bg-emerald-500/10 text-emerald-400";
    case "generation_ready":
      return "bg-emerald-500/10 text-emerald-400";
    case "history_restored":
      return "bg-blue-500/10 text-blue-400";
  }
}
