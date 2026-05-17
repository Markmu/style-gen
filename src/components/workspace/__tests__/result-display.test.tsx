// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultDisplay, ResultError } from "@/components/workspace/result-display";

vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

describe("ResultDisplay", () => {
  const defaultProps = {
    resultImageUrl: "https://example.com/result.png",
    promptSnapshot: "a beautiful landscape",
    negativePromptSnapshot: "blurry",
    params: { aspectRatio: "16:9", quality: "hd" },
  };

  it('渲染Result - img with alt "Generated Result"', () => {
    render(<ResultDisplay {...defaultProps} />);
    const img = screen.getByAltText("Generated Result");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/result.png");
  });

  it('显示生成参数 - "Aspect Ratio: 16:9" and "Quality: HD"', () => {
    render(<ResultDisplay {...defaultProps} />);
    expect(screen.getByText(/Aspect Ratio: 16:9/)).toBeInTheDocument();
    expect(screen.getByText(/Quality: HD/)).toBeInTheDocument();
  });

  it('StandardQuality显示文案 - "Quality: Standard"', () => {
    render(
      <ResultDisplay
        {...defaultProps}
        params={{ aspectRatio: "1:1", quality: "standard" }}
      />,
    );
    expect(screen.getByText(/Quality: Standard/)).toBeInTheDocument();
  });

  it('查看 Prompt 快照 - details/summary "View Prompt Used"', () => {
    render(<ResultDisplay {...defaultProps} />);
    expect(screen.getByText("View Prompt Used")).toBeInTheDocument();
  });
});

describe("ResultError", () => {
  it('显示错误信息 - "Generation Failed" and error message', () => {
    render(<ResultError errorMessage="network error" onRetry={vi.fn()} />);
    expect(screen.getByText("Generation Failed")).toBeInTheDocument();
    expect(screen.getByText("network error")).toBeInTheDocument();
  });

  it("Retry按钮 - onRetry called", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(<ResultError errorMessage="error" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
