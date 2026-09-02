"use client";

import type { CSSProperties, ReactNode } from "react";

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
  // plan-07（Task 4 / 架构 §8.5 三视口验收）：参考列宽度上界从 33.333vw 收紧为
  // 22rem——vw 含侧栏，在 1280 视口（侧栏 226px 后主区约 1054px）会把三列
  // 最小宽度推过容器产生结构性横向溢出（TC-7.9）。新公式在 1440×900、
  // 1280×800/720 下三列最小宽度合计始终小于主区可用宽度。
  const referenceColumnWidth = `clamp(17.5rem, calc(${referenceWidthDvh}dvh + 2rem), 22rem)`;

  return (
    <div
      data-testid="workspace-three-column-layout"
      className="h-full min-h-0 overflow-x-auto px-4 pb-2 pt-1 max-xl:overflow-y-auto"
    >
      {/* plan-07（Task 4）：xl（视口 ≥1280）保持专业三栏画布；更窄视口降级为
          单列纵向堆叠（可滚动），不再用固定 67.5rem 最小宽度制造横向滚动——
          1440×900 / 1280×800 / 390×844 验收视口下均不得出现结构性横向溢出 */}
      <div
        className="grid h-full min-h-0 grid-cols-1 content-start gap-3 xl:content-stretch xl:grid-cols-[var(--workspace-reference-column)_minmax(17rem,0.86fr)_minmax(21.5rem,1.15fr)]"
        style={
          { "--workspace-reference-column": referenceColumnWidth } as CSSProperties
        }
      >
        <section
          data-testid="workspace-reference-column"
          className="min-h-0 min-w-[17.5rem] overflow-hidden"
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
