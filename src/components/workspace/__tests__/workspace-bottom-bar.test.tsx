// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceBottomBar } from "@/components/workspace/workspace-bottom-bar";

describe("WorkspaceBottomBar", () => {
  it("places history across the first two columns and output in the prompt-width column", () => {
    render(
      <WorkspaceBottomBar
        history={<section data-testid="history-slot">History</section>}
        output={<section data-testid="output-slot">Output</section>}
      />,
    );

    expect(screen.getByTestId("workspace-bottom-bar")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-bottom-bar").firstElementChild).toHaveClass(
      "items-stretch",
    );
    expect(screen.getByTestId("workspace-bottom-history")).toHaveClass("col-span-2");
    expect(screen.getByTestId("workspace-bottom-output")).toHaveClass("min-w-0");
    expect(screen.getByTestId("history-slot")).toBeInTheDocument();
    expect(screen.getByTestId("output-slot")).toBeInTheDocument();
  });
});
