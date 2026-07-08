"use client";

import type { ReactNode } from "react";

interface WorkspaceThreeColumnLayoutProps {
  reference: ReactNode;
  recipe: ReactNode;
  prompt: ReactNode;
}

export function WorkspaceThreeColumnLayout({
  reference,
  recipe,
  prompt,
}: WorkspaceThreeColumnLayoutProps) {
  return (
    <div
      data-testid="workspace-three-column-layout"
      className="h-full min-h-0 overflow-x-auto px-4 pb-2 pt-1"
    >
      <div className="grid h-full min-w-[67.5rem] grid-cols-[minmax(20.625rem,1.08fr)_minmax(17.5rem,0.86fr)_minmax(22.5rem,1.15fr)] gap-3">
        <section
          data-testid="workspace-reference-column"
          className="min-h-0 overflow-hidden"
          aria-label="Reference Canvas column"
        >
          {reference}
        </section>
        <section
          data-testid="workspace-style-intelligence-column"
          className="min-h-0 overflow-hidden"
          aria-label="Style Intelligence column"
        >
          {recipe}
        </section>
        <section
          data-testid="workspace-prompt-render-column"
          className="min-h-0 overflow-hidden"
          aria-label="Prompt and Render column"
        >
          {prompt}
        </section>
      </div>
    </div>
  );
}
