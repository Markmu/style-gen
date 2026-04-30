"use client";

import type { ReactNode } from "react";

interface WorkspaceTwoPaneLayoutProps {
  analysis: ReactNode;
  editing: ReactNode;
}

export function WorkspaceTwoPaneLayout({
  analysis,
  editing,
}: WorkspaceTwoPaneLayoutProps) {
  return (
    <div
      data-testid="workspace-two-pane-layout"
      className="grid h-full min-h-0 grid-cols-[minmax(360px,0.88fr)_minmax(460px,1.12fr)] gap-4 px-6 pb-4 pt-4"
    >
      <section
        data-testid="workspace-primary-column"
        className="min-h-0 overflow-hidden"
        aria-label="分析区"
      >
        {analysis}
      </section>
      <section
        data-testid="workspace-primary-column"
        className="min-h-0 overflow-hidden"
        aria-label="编辑区"
      >
        {editing}
      </section>
    </div>
  );
}
