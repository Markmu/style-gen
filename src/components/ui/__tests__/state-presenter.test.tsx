// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatePresenter } from "@/components/ui/state-presenter";

describe("StatePresenter", () => {
  it("renders empty state copy and actions", () => {
    render(<StatePresenter status="empty" />);

    expect(screen.getByText("Ready to Start")).toBeInTheDocument();
    expect(screen.getByText(/Add a reference image or choose a template/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Reference" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Browse Templates" }),
    ).toBeInTheDocument();
  });

  it("renders processing state without forcing a modal", () => {
    const { container } = render(<StatePresenter compact status="processing" />);

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(container.querySelector("[data-status='processing']")).toBeInTheDocument();
  });

  it("renders failedRecoverable as assertive and actionable", () => {
    const { container } = render(<StatePresenter status="failedRecoverable" />);

    expect(container.querySelector("[aria-live='assertive']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Edit" })).toBeInTheDocument();
  });

  it("renders auth required action", () => {
    render(<StatePresenter status="authRequired" />);

    expect(screen.getByText("Login Required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("renders no results recovery copy", () => {
    render(<StatePresenter status="noResults" />);

    expect(screen.getByText("No Matches")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Search" })).toBeInTheDocument();
  });

  it("uses overrides and invokes actions", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    const onSecondaryAction = vi.fn();

    render(
      <StatePresenter
        description="The current analysis did not finish, but the reference is preserved."
        onPrimaryAction={onPrimaryAction}
        onSecondaryAction={onSecondaryAction}
        primaryActionLabel="Retry Analysis"
        secondaryActionLabel="Replace Reference"
        status="failedRecoverable"
        title="Analysis Failed"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry Analysis" }));
    await user.click(screen.getByRole("button", { name: "Replace Reference" }));

    expect(screen.getByText("Analysis Failed")).toBeInTheDocument();
    expect(screen.getByText(/reference is preserved/)).toBeInTheDocument();
    expect(onPrimaryAction).toHaveBeenCalledOnce();
    expect(onSecondaryAction).toHaveBeenCalledOnce();
  });
});
