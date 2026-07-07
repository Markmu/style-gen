// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutputCard } from "@/components/workspace/output-card";
import type { RenderReadiness } from "@/lib/render-readiness";

const readyReadiness: RenderReadiness = {
  promptResolved: true,
  variablesResolved: true,
  styleSignalsAvailable: true,
  serviceAvailable: true,
  workspaceIdle: true,
  canGenerate: true,
  disabledReason: "Ready to render with the current prompt.",
  nextAction: "generate",
};

const defaultProps = {
  state: "analysis_ready" as const,
  params: { aspectRatio: "1:1" as const, quality: "standard" as const },
  readiness: readyReadiness,
  error: null,
  onParamsChange: vi.fn(),
  onGenerate: vi.fn(),
  onRetry: vi.fn(),
  onSaveStyleMemory: vi.fn(),
  onBackToEdit: vi.fn(),
};

describe("OutputCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders output controls with the generate button inside the card", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(<OutputCard {...defaultProps} onGenerate={onGenerate} />);

    expect(screen.getByTestId("output-card")).toBeInTheDocument();
    expect(screen.getByTestId("output-card")).toHaveAttribute(
      "data-readiness-can-generate",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Render Dock" })).toBeInTheDocument();
    expect(screen.getByTestId("render-readiness-list")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^render-readiness-item-/)).toHaveLength(5);
    expect(screen.getByTestId("render-readiness-item-prompt")).toHaveAttribute(
      "data-state",
      "ready",
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
    });
  });

  it("reports parameter changes to the parent state", async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    render(<OutputCard {...defaultProps} onParamsChange={onParamsChange} />);

    await user.selectOptions(screen.getByLabelText("Aspect Ratio"), "16:9");
    await user.selectOptions(screen.getByLabelText("Quality"), "hd");

    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "standard",
    });
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "hd",
    });
  });

  it("keeps generate disabled when the prompt is not ready", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    const readiness: RenderReadiness = {
      ...readyReadiness,
      variablesResolved: false,
      canGenerate: false,
      disabledReason: "Resolve template variables before generating.",
      nextAction: "resolve_variables",
    };

    render(
      <OutputCard
        {...defaultProps}
        readiness={readiness}
        onGenerate={onGenerate}
      />,
    );

    const button = screen.getByRole("button", { name: "Generate" });
    expect(button).toBeDisabled();
    expect(screen.getByTestId("render-readiness-item-variables")).toHaveAttribute(
      "data-state",
      "blocked",
    );
    expect(screen.getByTestId("render-disabled-reason")).toHaveTextContent(
      "Resolve template variables before generating.",
    );
    expect(screen.getByTestId("render-next-action")).toHaveTextContent(
      "Resolve variables",
    );

    await user.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("keeps the dock scoped as a prompt-column control surface", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card")).toHaveClass("min-w-0", "rounded-xl");
  });

  it("keeps style memory and generate actions grouped at the bottom", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card-actions")).toHaveClass(
      "grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(screen.getByRole("button", { name: "Save as style memory" })).toBeInTheDocument();
  });

  it("opens the style memory save entry when the dock save action is clicked", async () => {
    const user = userEvent.setup();
    const onSaveStyleMemory = vi.fn();

    render(
      <OutputCard
        {...defaultProps}
        onSaveStyleMemory={onSaveStyleMemory}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save as style memory" }));

    expect(onSaveStyleMemory).toHaveBeenCalledOnce();
  });

  it("keeps parameters visible but disabled while generating", () => {
    const readiness: RenderReadiness = {
      ...readyReadiness,
      workspaceIdle: false,
      canGenerate: false,
      disabledReason: "Wait for the current workspace task to finish.",
      nextAction: "wait_for_task",
    };

    render(<OutputCard {...defaultProps} state="generating" readiness={readiness} />);

    expect(screen.getByLabelText("Aspect Ratio")).toBeVisible();
    expect(screen.getByLabelText("Aspect Ratio")).toBeDisabled();
    expect(screen.getByLabelText("Quality")).toBeVisible();
    expect(screen.getByLabelText("Quality")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rendering..." })).toBeDisabled();
    expect(screen.getByTestId("render-readiness-item-workspace-idle")).toHaveAttribute(
      "data-state",
      "processing",
    );
  });

  it("shows service unavailable recovery while keeping style memory available", () => {
    const readiness: RenderReadiness = {
      ...readyReadiness,
      serviceAvailable: false,
      canGenerate: false,
      disabledReason:
        "Generation service is temporarily unavailable. Retry service when ready.",
      nextAction: "retry_service",
    };

    render(<OutputCard {...defaultProps} readiness={readiness} />);

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByTestId("render-disabled-reason")).toHaveTextContent(
      "Generation service is temporarily unavailable.",
    );
    expect(screen.getByTestId("render-recovery-actions")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry service" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save as style memory" })).toBeEnabled();
  });
});
