// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatePresenter } from "@/components/ui/state-presenter";

describe("StatePresenter", () => {
  it("renders empty state copy and actions", () => {
    render(<StatePresenter status="empty" />);

    expect(screen.getByText("Ready for Reference")).toBeInTheDocument();
    expect(screen.getByText(/reuse a Style Memory/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Reference" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Browse Style Memory" }),
    ).toBeInTheDocument();
  });

  it("renders processing state as polite compact feedback without forcing a modal", () => {
    const { container } = render(<StatePresenter compact status="processing" />);

    expect(screen.getByText("Reading Style Signals")).toBeInTheDocument();
    expect(screen.getByText(/color, composition, lighting, texture, and mood/)).toBeInTheDocument();
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live='polite']")).toBeInTheDocument();
    expect(container.querySelector("[data-status='processing']")).toHaveAttribute(
      "data-variant",
      "compact",
    );
    expect(screen.getByTestId("state-presenter-tone")).toHaveAttribute(
      "data-tone",
      "accent",
    );
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

    expect(screen.getByText("No Style Memories Found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Search" })).toBeInTheDocument();
  });

  it("uses copy overrides and invokes actions", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    const onSecondaryAction = vi.fn();

    render(
      <StatePresenter
        copyOverride={{
          description:
            "The current analysis did not finish, but the reference is preserved.",
          primaryActionLabel: "Retry Analysis",
          secondaryActionLabel: "Replace Reference",
          title: "Analysis Failed",
          tone: "warning",
        }}
        onPrimaryAction={onPrimaryAction}
        onSecondaryAction={onSecondaryAction}
        status="failedRecoverable"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry Analysis" }));
    await user.click(screen.getByRole("button", { name: "Replace Reference" }));

    expect(screen.getByText("Analysis Failed")).toBeInTheDocument();
    expect(screen.getByText(/reference is preserved/)).toBeInTheDocument();
    expect(screen.getByTestId("state-presenter-tone")).toHaveAttribute(
      "data-tone",
      "warning",
    );
    expect(onPrimaryAction).toHaveBeenCalledOnce();
    expect(onSecondaryAction).toHaveBeenCalledOnce();
  });

  it("keeps direct override props backward compatible", () => {
    const onPrimaryAction = vi.fn();

    render(
      <StatePresenter
        description="The style memory service is temporarily unavailable, but prompt context is kept."
        onPrimaryAction={onPrimaryAction}
        primaryActionLabel="Retry Analysis"
        secondaryActionLabel=""
        status="failedRecoverable"
        title="Service Unavailable"
        tone="danger"
      />,
    );

    expect(screen.getByText("Service Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Analysis" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Edit" })).not.toBeInTheDocument();
    expect(screen.getByTestId("state-presenter-tone")).toHaveAttribute(
      "data-tone",
      "danger",
    );
  });

  it("does not render an empty action container when labels are absent", () => {
    render(<StatePresenter status="loading" variant="full" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Restoring Context")).toBeInTheDocument();
  });
});
