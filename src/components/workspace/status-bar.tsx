"use client";

import type { WorkspaceState, WorkspaceError } from "@/hooks/use-workspace-state";

interface StatusBarConfig {
  label: string;
  description: string;
  showReplaceButton: boolean;
}

const STATUS_BAR_CONFIG: Record<WorkspaceState, StatusBarConfig> = {
  idle: {
    label: "未开始",
    description: "上传参考图，提炼风格特征，再生成可继续迭代的新图",
    showReplaceButton: false,
  },
  uploading: {
    label: "未开始",
    description: "上传参考图，提炼风格特征，再生成可继续迭代的新图",
    showReplaceButton: false,
  },
  analyzing: {
    label: "分析中",
    description: "AI 正在分析参考图的风格特征",
    showReplaceButton: false,
  },
  analysis_ready: {
    label: "可生成",
    description: "AI 已提炼出参考图的风格特征，你可以继续调整生成意图",
    showReplaceButton: true,
  },
  generating: {
    label: "生成中",
    description: "正在生成图片，请稍候",
    showReplaceButton: true,
  },
  generation_ready: {
    label: "已完成",
    description: "已生成首版结果，可继续对比、下载或迭代",
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
    <div className="flex items-center justify-between rounded-xl bg-[var(--surface-mid)] px-6 py-4 ring-1 ring-[var(--border)]">
      {/* Left: title + description */}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          基于参考图创作
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          {config.description}
        </p>
      </div>

      {/* Right: status badge + replace button */}
      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge label={config.label} state={state} />
        {config.showReplaceButton && (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-bright)]"
          >
            更换参考图
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
  }
}
