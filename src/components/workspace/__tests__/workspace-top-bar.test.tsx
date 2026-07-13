// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";

describe("WorkspaceTopBar", () => {
  it("renders the workbench title and update state without toolbar actions", () => {
    render(
      <WorkspaceTopBar
        title="Editorial Soft Light"
        subtitle="Updated just now"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Editorial Soft Light" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More workspace actions" })).not.toBeInTheDocument();

    expect(screen.queryByTestId("top-mode-switcher")).not.toBeInTheDocument();
    expect(screen.queryByText("Replace Reference")).not.toBeInTheDocument();
  });
});
