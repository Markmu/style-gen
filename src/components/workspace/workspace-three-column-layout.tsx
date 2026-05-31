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
      className="h-full min-h-0 overflow-x-auto px-4 py-2"
    >
      <div className="grid h-full min-w-[928px] grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(320px,1.2fr)] gap-4">
        <section
          data-testid="workspace-primary-column"
          className="min-h-0 overflow-hidden"
          aria-label="Reference column"
        >
          {reference}
        </section>
        <section
          data-testid="workspace-primary-column"
          className="min-h-0 overflow-hidden"
          aria-label="Visual Recipe column"
        >
          {recipe}
        </section>
        <section
          data-testid="workspace-primary-column"
          className="min-h-0 overflow-hidden"
          aria-label="Prompt column"
        >
          {prompt}
        </section>
      </div>
    </div>
  );
}
