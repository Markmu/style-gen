"use client";

import type { ReactNode } from "react";

interface WorkspaceBottomBarProps {
  history: ReactNode;
  output?: ReactNode;
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
      <div className="grid min-w-[67.5rem] grid-cols-[minmax(20.625rem,1.08fr)_minmax(17.5rem,0.86fr)_minmax(22.5rem,1.15fr)] items-stretch gap-3">
        <div
          data-testid="workspace-bottom-history"
          className={output ? "col-span-2 min-w-0" : "col-span-3 min-w-0"}
        >
          {history}
        </div>
        {output && (
          <div data-testid="workspace-bottom-output" className="min-w-0">
            {output}
          </div>
        )}
      </div>
    </div>
  );
}
