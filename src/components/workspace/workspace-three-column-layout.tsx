"use client";

import type { ReactNode } from "react";

interface WorkspaceThreeColumnLayoutProps {
  reference: ReactNode;
  recipe: ReactNode;
  prompt: ReactNode;
  referenceAspectRatio?: number;
}

export function WorkspaceThreeColumnLayout({
  reference,
  recipe,
  prompt,
  referenceAspectRatio = 4 / 5,
}: WorkspaceThreeColumnLayoutProps) {
  const boundedReferenceAspectRatio = Math.min(
    Math.max(referenceAspectRatio, 0.5),
    2,
  );
  const referenceWidthDvh = Number(
    (boundedReferenceAspectRatio * 48).toFixed(3),
  );
  const referenceColumnWidth = `clamp(max(17.5rem, 25vw), calc(${referenceWidthDvh}dvh + 2rem), 33.333vw)`;

  return (
    <div
      data-testid="workspace-three-column-layout"
      className="h-full min-h-0 overflow-x-auto px-4 pb-2 pt-1"
    >
      <div
        className="grid h-full min-w-[67.5rem] gap-3"
        style={{
          gridTemplateColumns: `${referenceColumnWidth} minmax(17.5rem, 0.86fr) minmax(22.5rem, 1.15fr)`,
        }}
      >
        <section
          data-testid="workspace-reference-column"
          className="min-h-0 min-w-[17.5rem] max-w-[33.333vw] overflow-hidden"
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
