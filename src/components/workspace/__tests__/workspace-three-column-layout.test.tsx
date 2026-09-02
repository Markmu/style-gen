// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { WorkspaceThreeColumnLayout } from "@/components/workspace/workspace-three-column-layout";

describe("WorkspaceThreeColumnLayout", () => {
  it("renders reference, recipe, and prompt columns in a stable grid", () => {
    render(
      <WorkspaceThreeColumnLayout
        reference={<div>Reference slot</div>}
        recipe={<div>Recipe slot</div>}
        prompt={<div>Prompt slot</div>}
      />,
    );

    const layout = screen.getByTestId("workspace-three-column-layout");
    expect(layout).toBeInTheDocument();
    // plan-07（Task 4 / 架构 §8.5）：根容器保持水平滚动安全阀，窄视口叠加为
    // 单列时提供纵向滚动（max-xl:overflow-y-auto）
    expect(layout).toHaveClass("overflow-x-auto");
    expect(layout).toHaveClass("max-xl:overflow-y-auto");

    const grid = layout.firstElementChild;
    // 基础形态：单列纵向堆叠（内容不足视口时不再制造结构性横向溢出）
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("content-start");
    // xl 起：专业三栏画布（CSS 变量承载动态参考列宽）
    expect(grid).toHaveClass(
      "xl:grid-cols-[var(--workspace-reference-column)_minmax(17rem,0.86fr)_minmax(21.5rem,1.15fr)]",
    );
    expect(grid).toHaveClass("xl:content-stretch");
    expect(grid).not.toHaveClass("min-w-[67.5rem]");
    // 参考列宽度经 CSS 变量注入：clamp 上界 22rem，不再使用含侧栏的 33.333vw
    const gridStyle = grid?.getAttribute("style") ?? "";
    expect(gridStyle).toContain("--workspace-reference-column");
    expect(gridStyle).toContain("clamp(17.5rem, calc(38.4dvh + 2rem), 22rem)");
    expect(grid).toHaveClass("gap-3");
    expect(screen.getByLabelText("Reference Canvas column")).toHaveClass(
      "min-w-[17.5rem]",
    );
    expect(screen.getByLabelText("Reference Canvas column")).toHaveTextContent("Reference slot");
    expect(screen.getByLabelText("Style Intelligence column")).toHaveTextContent("Recipe slot");
    expect(screen.getByLabelText("Prompt and Render column")).toHaveTextContent("Prompt slot");
  });

  it("keeps the reference column ratio-driven width inside the 22rem cap", () => {
    render(
      <WorkspaceThreeColumnLayout
        referenceAspectRatio={1}
        reference={<div>Reference slot</div>}
        recipe={<div>Recipe slot</div>}
        prompt={<div>Prompt slot</div>}
      />,
    );

    const grid = screen.getByTestId("workspace-three-column-layout").firstElementChild;
    // 1:1 参考 → 48dvh；极端高度下也被 22rem 上界约束，避免三列最小宽度
    // 之和超过 1280 视口主区（约 1054px）产生横向溢出（plan-07 TC-7.9 契约）
    expect(grid?.getAttribute("style")).toContain("calc(48dvh + 2rem)");
    expect(grid?.getAttribute("style")).toContain("22rem");
  });
});
