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
      className="grid h-full min-h-0 grid-cols-[minmax(22.5rem,0.88fr)_minmax(28.75rem,1.12fr)] gap-2 px-4 py-2"
    >
      <section
        data-testid="workspace-primary-column"
        className="workspace-lane-analysis min-h-0 overflow-hidden"
        aria-label="Analysis panel"
      >
        {analysis}
      </section>
      <section
        data-testid="workspace-primary-column"
        className="workspace-lane-editing min-h-0 overflow-hidden"
        aria-label="Editing panel"
      >
        {editing}
      </section>
    </div>
  );
}
