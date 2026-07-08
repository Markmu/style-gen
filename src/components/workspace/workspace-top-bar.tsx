"use client";

interface WorkspaceTopBarProps {
  title: string;
  subtitle: string;
  onShare?: () => void;
  onSettings?: () => void;
  onMore?: () => void;
}

export function WorkspaceTopBar({
  title,
  subtitle,
  onShare,
  onSettings,
  onMore,
}: WorkspaceTopBarProps) {
  return (
    <header className="workspace-top-bar flex min-h-[4.625rem] items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h1>
          <button
            type="button"
            aria-label="Rename workspace"
            className="workspace-top-bar-icon-button"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              edit
            </span>
          </button>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-[var(--text-secondary)]">
          {subtitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Share workspace"
          onClick={onShare}
          className="workspace-top-bar-action inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            share
          </span>
          <span className="hidden sm:inline">Share</span>
        </button>
        <button
          type="button"
          aria-label="Workspace settings"
          onClick={onSettings}
          className="workspace-top-bar-action workspace-top-bar-square"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            settings
          </span>
        </button>
        <button
          type="button"
          aria-label="More workspace actions"
          onClick={onMore}
          className="workspace-top-bar-action workspace-top-bar-square"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            more_horiz
          </span>
        </button>
      </div>
    </header>
  );
}
