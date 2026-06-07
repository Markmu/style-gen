"use client";

import type { ReactNode } from "react";

interface WorkspaceBottomBarProps {
  history: ReactNode;
  output: ReactNode;
}

export function WorkspaceBottomBar({
  history,
  output,
}: WorkspaceBottomBarProps) {
  return (
    <div
      data-testid="workspace-bottom-bar"
      className="shrink-0 overflow-x-auto px-4 pb-3"
    >
      <div className="grid min-w-[928px] grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(320px,1.2fr)] items-stretch gap-4">
        <div data-testid="workspace-bottom-history" className="col-span-2 min-w-0">
          {history}
        </div>
        <div data-testid="workspace-bottom-output" className="min-w-0">
          {output}
        </div>
      </div>
    </div>
  );
}
