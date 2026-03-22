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

  it('渲染结果图 - img with alt "生成结果"', () => {
    render(<ResultDisplay {...defaultProps} />);
    const img = screen.getByAltText("生成结果");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/result.png");
  });

  it('显示生成参数 - "宽高比: 16:9" and "画质: 高清"', () => {
    render(<ResultDisplay {...defaultProps} />);
    expect(screen.getByText(/宽高比: 16:9/)).toBeInTheDocument();
    expect(screen.getByText(/画质: 高清/)).toBeInTheDocument();
  });

  it('标准画质显示文案 - "画质: 标准"', () => {
    render(
      <ResultDisplay
        {...defaultProps}
        params={{ aspectRatio: "1:1", quality: "standard" }}
      />,
    );
    expect(screen.getByText(/画质: 标准/)).toBeInTheDocument();
  });

  it('查看 Prompt 快照 - details/summary "查看使用的 Prompt"', () => {
    render(<ResultDisplay {...defaultProps} />);
    expect(screen.getByText("查看使用的 Prompt")).toBeInTheDocument();
  });
});

describe("ResultError", () => {
  it('显示错误信息 - "生成失败" and error message', () => {
    render(<ResultError errorMessage="network error" onRetry={vi.fn()} />);
    expect(screen.getByText("生成失败")).toBeInTheDocument();
    expect(screen.getByText("network error")).toBeInTheDocument();
  });

  it("重试按钮 - onRetry called", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(<ResultError errorMessage="error" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
