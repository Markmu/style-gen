// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LightGeneratePanel } from "@/components/workspace/light-generate-panel";

describe("LightGeneratePanel", () => {
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

  it("calls onGenerate with the current controlled params", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(
      <LightGeneratePanel
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
      <LightGeneratePanel
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
    render(<LightGeneratePanel {...defaultProps} promptText="" />);

    expect(screen.getByRole("button", { name: "GENERATE" })).toBeDisabled();
    expect(screen.getByText("Get or enter a complete generation prompt first")).toBeInTheDocument();
  });

  it("keeps editing available while generation service is unavailable", () => {
    render(<LightGeneratePanel {...defaultProps} generationUnavailable />);

    expect(screen.getByRole("button", { name: "GENERATE" })).toBeDisabled();
    expect(screen.getByText("Image generation is temporarily unavailable")).toBeInTheDocument();
  });

  it("disables generation when prompt still contains unresolved variables", () => {
    render(<LightGeneratePanel {...defaultProps} promptText="Create {{subject}}" />);

    expect(screen.getByRole("button", { name: "GENERATE" })).toBeDisabled();
    expect(screen.getByText("Fill in all template variables first")).toBeInTheDocument();
  });
});
