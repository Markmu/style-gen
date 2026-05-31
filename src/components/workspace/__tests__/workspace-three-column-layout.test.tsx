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
    expect(layout.firstElementChild).toHaveClass("min-w-[928px]");
    expect(layout.firstElementChild).toHaveClass(
      "grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(320px,1.2fr)]",
    );
    expect(layout.firstElementChild).toHaveClass("gap-4");
    expect(screen.getByLabelText("Reference column")).toHaveTextContent("Reference slot");
    expect(screen.getByLabelText("Visual Recipe column")).toHaveTextContent("Recipe slot");
    expect(screen.getByLabelText("Prompt column")).toHaveTextContent("Prompt slot");
  });
});
