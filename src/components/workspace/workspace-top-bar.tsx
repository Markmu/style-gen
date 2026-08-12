"use client";

import { Pencil } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";

interface WorkspaceTopBarProps {
  title: string;
  subtitle?: string;
}

export function WorkspaceTopBar({ title, subtitle }: WorkspaceTopBarProps) {
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
            <AppIcon icon={Pencil} size={16} />
          </button>
        </div>
        {subtitle && (
          <p className="mt-1 truncate text-xs font-medium text-[var(--text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}
