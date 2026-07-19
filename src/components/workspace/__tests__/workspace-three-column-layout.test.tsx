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
    expect(layout).toHaveClass("overflow-x-auto");
    expect(layout.firstElementChild).toHaveClass("min-w-[67.5rem]");
    expect(layout.firstElementChild?.getAttribute("style")).toContain(
      "clamp(max(17.5rem, 25vw), calc(38.4dvh + 2rem), 33.333vw)",
    );
    expect(layout.firstElementChild).toHaveClass("gap-3");
    expect(screen.getByLabelText("Reference Canvas column")).toHaveClass(
      "min-w-[17.5rem]",
      "max-w-[33.333vw]",
    );
    expect(screen.getByLabelText("Reference Canvas column")).toHaveTextContent("Reference slot");
    expect(screen.getByLabelText("Style Intelligence column")).toHaveTextContent("Recipe slot");
    expect(screen.getByLabelText("Prompt and Render column")).toHaveTextContent("Prompt slot");
  });
});
