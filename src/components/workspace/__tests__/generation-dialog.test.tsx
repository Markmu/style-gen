// @vitest-environment jsdom
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationDialog } from "@/components/workspace/generation-dialog";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { alt, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ""} {...rest} />;
  },
}));

describe("GenerationDialog", () => {
  const defaultProps = {
    open: true,
    state: "generating" as const,
    resultImageUrl: null,
    error: null,
    generationQueueing: false,
    onClose: vi.fn(),
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders progress in a dialog while generating", () => {
    render(<GenerationDialog {...defaultProps} />);

    expect(screen.getByRole("dialog", { name: "Generation Task" })).toBeInTheDocument();
    expect(screen.getByText("Generating image...")).toBeInTheDocument();
  });

  it("renders the completed result and closes without invoking retry", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRetry = vi.fn();

    render(
      <GenerationDialog
        {...defaultProps}
        state="generation_ready"
        resultImageUrl="https://cdn.example.com/result.png"
        onClose={onClose}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByAltText("Generated Result")).toBeInTheDocument();
    await user.click(screen.getByText("Close Dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders failure actions and returns to editing without retrying", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRetry = vi.fn();

    render(
      <GenerationDialog
        {...defaultProps}
        state="generation_ready"
        error={{ message: "failed", stage: "generation" }}
        onClose={onClose}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Generation Failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Edit" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("does not render when closed", () => {
    render(<GenerationDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole("dialog", { name: "Generation Task" })).not.toBeInTheDocument();
  });
});
