"use client";

import { CircleCheck, PenLine, Radar, Zap } from "lucide-react";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
import type { WorkspaceState } from "@/hooks/use-workspace-state";

export type TopMode = "analyze" | "editing" | "generate" | "result";
export type ManualModeOverride = TopMode | null;

interface TopModeSwitcherProps {
  state: WorkspaceState;
  promptText?: string;
  manualModeOverride: ManualModeOverride;
  onModeChange: (mode: TopMode) => void;
}

interface ModeConfig {
  mode: TopMode;
  label: string;
  icon: AppIconComponent;
  selectedClass: string;
  softClass: string;
}

const MODES: ModeConfig[] = [
  {
    mode: "analyze",
    label: "Analyze",
    icon: Radar,
    selectedClass: "bg-[var(--accent-analyze)] text-[var(--text-on-primary)]",
    softClass: "bg-[var(--accent-analyze-soft)] text-[var(--accent-analyze)]",
  },
  {
    mode: "editing",
    label: "Editing",
    icon: PenLine,
    selectedClass: "bg-[var(--accent-edit)] text-[var(--text-on-primary)]",
    softClass: "bg-[var(--accent-edit-soft)] text-[var(--accent-edit)]",
  },
  {
    mode: "generate",
    label: "Generate",
    icon: Zap,
    selectedClass: "bg-[var(--accent-warm)] text-[var(--text-on-primary)]",
    softClass: "bg-[var(--accent-warm-soft)] text-[var(--accent-warm)]",
  },
  {
    mode: "result",
    label: "Result",
    icon: CircleCheck,
    selectedClass: "bg-[var(--accent-result)] text-[var(--text-on-primary)]",
    softClass: "bg-[var(--accent-result-soft)] text-[var(--accent-result)]",
  },
];

export function stateToMode(state: WorkspaceState): TopMode {
  switch (state) {
    case "idle":
    case "uploading":
    case "analyzing":
      return "analyze";
    case "analysis_ready":
    case "history_restored":
      return "editing";
    case "generating":
      return "generate";
    case "generation_ready":
      return "result";
  }
}

function isModeEnabled(
  mode: TopMode,
  state: WorkspaceState,
  promptText: string,
): boolean {
  const hasPrompt = promptText.trim().length > 0;
  const hasAnalysis =
    state === "analysis_ready" ||
    state === "generating" ||
    state === "generation_ready" ||
    state === "history_restored";

  switch (mode) {
    case "analyze":
      return true;
    case "editing":
      return hasAnalysis;
    case "generate":
      return hasAnalysis && hasPrompt;
    case "result":
      return state === "generation_ready";
  }
}

export function TopModeSwitcher({
  state,
  promptText = "",
  manualModeOverride,
  onModeChange,
}: TopModeSwitcherProps) {
  const activeMode = manualModeOverride ?? stateToMode(state);

  return (
    <div
      data-testid="top-mode-switcher"
      className="flex min-w-0 items-center gap-1 rounded-full bg-[var(--surface-low)] p-1"
      aria-label="Workspace mode"
    >
      {MODES.map((item) => {
        const enabled = isModeEnabled(item.mode, state, promptText);
        const selected = activeMode === item.mode;
        const stateClass = selected
          ? `${item.selectedClass} shadow-sm`
          : enabled
            ? `${item.softClass} hover:bg-[var(--surface-bright)]`
            : "cursor-not-allowed bg-[var(--surface-control)] text-[var(--text-muted)] opacity-60";

        return (
          <button
            key={item.mode}
            type="button"
            disabled={!enabled}
            aria-pressed={selected}
            data-mode={item.mode}
            onClick={() => onModeChange(item.mode)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/25 ${stateClass}`}
          >
            <AppIcon icon={item.icon} size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
