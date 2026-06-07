// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutputCard } from "@/components/workspace/output-card";

const defaultProps = {
  state: "analysis_ready" as const,
  params: { aspectRatio: "1:1" as const, quality: "standard" as const },
  canGenerate: true,
  disabledReason: "Ready",
  generationUnavailable: false,
  error: null,
  onParamsChange: vi.fn(),
  onGenerate: vi.fn(),
  onRetry: vi.fn(),
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
    expect(screen.getByRole("heading", { name: "Output" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "GENERATE" }));

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

    render(
      <OutputCard
        {...defaultProps}
        canGenerate={false}
        disabledReason="Resolve template variables before generating"
        onGenerate={onGenerate}
      />,
    );

    const button = screen.getByRole("button", { name: "GENERATE" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Resolve template variables before generating");

    await user.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("uses the same stretchable card height contract as the bottom history card", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card")).toHaveClass("h-full", "min-h-0");
  });

  it("pins the output actions to the right edge of the card row", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card-actions")).toHaveClass("ml-auto", "justify-end");
  });
});
