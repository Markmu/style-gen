// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";

describe("WorkspaceTopBar", () => {
  it("renders the workbench title, update state, and shell actions", () => {
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
    expect(screen.getByRole("button", { name: "Share workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More workspace actions" })).toBeInTheDocument();

    expect(screen.queryByTestId("top-mode-switcher")).not.toBeInTheDocument();
    expect(screen.queryByText("Replace Reference")).not.toBeInTheDocument();
  });

  it("calls action callbacks when toolbar controls are pressed", async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    const onSettings = vi.fn();
    const onMore = vi.fn();

    render(
      <WorkspaceTopBar
        title="Workspace"
        subtitle="Updated just now"
        onShare={onShare}
        onSettings={onSettings}
        onMore={onMore}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Share workspace" }));
    await user.click(screen.getByRole("button", { name: "Workspace settings" }));
    await user.click(screen.getByRole("button", { name: "More workspace actions" }));

    expect(onShare).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
    expect(onMore).toHaveBeenCalledOnce();
  });
});
