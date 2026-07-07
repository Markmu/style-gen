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
    expect(layout.firstElementChild).toHaveClass("min-w-[1080px]");
    expect(layout.firstElementChild).toHaveClass(
      "grid-cols-[minmax(330px,1.08fr)_minmax(280px,0.86fr)_minmax(360px,1.15fr)]",
    );
    expect(layout.firstElementChild).toHaveClass("gap-3");
    expect(screen.getByLabelText("Reference Canvas column")).toHaveTextContent("Reference slot");
    expect(screen.getByLabelText("Style Intelligence column")).toHaveTextContent("Recipe slot");
    expect(screen.getByLabelText("Prompt and Render column")).toHaveTextContent("Prompt slot");
  });
});
