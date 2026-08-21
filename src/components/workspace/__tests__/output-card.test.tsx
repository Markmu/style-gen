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
  disabledReason: "Generate with the current prompt.",
  nextAction: "generate",
};

const defaultProps = {
  state: "analysis_ready" as const,
  params: {
    aspectRatio: "1:1" as const,
    quality: "standard" as const,
    model: "flux-2-dev",
  },
  readiness: readyReadiness,
  onParamsChange: vi.fn(),
  onGenerate: vi.fn(),
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
    expect(screen.getByLabelText("Aspect Ratio")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
    expect(screen.getByLabelText("Aspect Ratio")).toHaveClass("render-select", "h-9");
    expect(screen.getByLabelText("Quality")).toHaveClass("render-select", "h-9");
    expect(screen.getByLabelText("Model")).toHaveClass("render-select", "h-9");
    expect(document.querySelectorAll(".lucide-chevron-down")).toHaveLength(3);
    expect(screen.getByTestId("render-parameter-controls")).toBeInTheDocument();
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Render ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt checks")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Render Dock" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-readiness-list")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^render-readiness-item-/)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
      model: "flux-2-dev",
    });
  });

  it("renders model options from the models.json catalog", () => {
    render(<OutputCard {...defaultProps} />);

    const modelSelect = screen.getByLabelText("Model");
    const options = Array.from(modelSelect.querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "FLUX.2 [dev]",
      "Nano Banana 2 Lite",
      "Nano Banana 2 Pro",
    ]);
    expect(modelSelect).toHaveValue("flux-2-dev");
  });

  it("reports parameter changes to the parent state", async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    render(<OutputCard {...defaultProps} onParamsChange={onParamsChange} />);

    await user.selectOptions(screen.getByLabelText("Aspect Ratio"), "16:9");
    await user.selectOptions(screen.getByLabelText("Quality"), "hd");
    await user.selectOptions(
      screen.getByLabelText("Model"),
      "nano-banana-2-lite",
    );

    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "standard",
      model: "flux-2-dev",
    });
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "hd",
      model: "flux-2-dev",
    });
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
      model: "nano-banana-2-lite",
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
    expect(button).toHaveAttribute(
      "title",
      "Resolve template variables before generating.",
    );
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-readiness-item-variables")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-disabled-reason")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-next-action")).not.toBeInTheDocument();

    await user.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("keeps the dock scoped as a prompt-column control surface", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card")).toHaveClass("min-w-0", "rounded-xl");
  });

  it("keeps Render Dock scoped to generation controls", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card-actions")).toHaveClass(
      "grid",
      "sm:grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(screen.getByTestId("render-parameter-controls")).toHaveClass(
      "grid",
      "grid-cols-2",
    );
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Aspect Ratio")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Model")).toBeVisible();
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rendering..." })).toBeDisabled();
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Parameters are locked while the render runs.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-readiness-item-workspace-idle")).not.toBeInTheDocument();
  });

  it("keeps service unavailable state visually compact", () => {
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
    expect(screen.getByRole("button", { name: "Generate" })).toHaveAttribute(
      "title",
      "Generation service is temporarily unavailable. Retry service when ready.",
    );
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-disabled-reason")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-recovery-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry service" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
  });
});
