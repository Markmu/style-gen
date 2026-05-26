// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingGenerateWindow } from "@/components/workspace/floating-generate-window";

describe("FloatingGenerateWindow", () => {
  const defaultProps = {
    state: "analysis_ready" as const,
    promptText: "ready prompt",
    params: { aspectRatio: "1:1" as const, quality: "standard" as const },
    generationUnavailable: false,
    error: null,
    onParamsChange: vi.fn(),
    onGenerate: vi.fn(),
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders as bottom bar generate controls", () => {
    render(<FloatingGenerateWindow {...defaultProps} />);

    expect(screen.getByTestId("floating-generate-window")).toHaveClass(
      "min-w-0",
      "shrink-0",
    );
    expect(screen.getByTestId("floating-generate-window")).not.toHaveClass(
      "glass-panel",
      "max-w-[640px]",
    );
    expect(screen.queryByText(/^Generate$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GENERATE" })).toBeEnabled();
  });

  it("calls onGenerate with the current controlled params", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(
      <FloatingGenerateWindow
        {...defaultProps}
        params={{ aspectRatio: "16:9", quality: "hd" }}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "GENERATE" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "hd",
    });
  });

  it("reports param changes to the parent controller", async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    render(
      <FloatingGenerateWindow
        {...defaultProps}
        onParamsChange={onParamsChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "9:16" }));
    await user.click(screen.getByRole("button", { name: "HD" }));

    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "9:16",
      quality: "standard",
    });
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "hd",
    });
  });

  it("disables generation and explains why when the prompt is empty", () => {
    render(<FloatingGenerateWindow {...defaultProps} promptText="" />);

    expect(screen.getByRole("button", { name: "GENERATE" })).toBeDisabled();
    expect(
      screen.getByText("Get or enter a complete generation prompt first"),
    ).toBeInTheDocument();
  });

  it("shows retry action for generation errors without generating immediately", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onGenerate = vi.fn();

    render(
      <FloatingGenerateWindow
        {...defaultProps}
        error={{ stage: "generation", message: "failed" }}
        onRetry={onRetry}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resume Generation" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
