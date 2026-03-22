// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorDisplay } from "@/components/workspace/error-display";

describe("ErrorDisplay", () => {
  const defaultProps = {
    code: "RATE_LIMITED" as const,
    message: "Too many requests",
    retryable: true,
    onRetry: vi.fn(),
    onReplace: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RATE_LIMITED 显示限流标题", () => {
    render(<ErrorDisplay {...defaultProps} />);
    expect(screen.getByText("请求过于频繁")).toBeInTheDocument();
  });

  it("RATE_LIMITED 显示等待秒数", () => {
    render(<ErrorDisplay {...defaultProps} retryAfterSeconds={30} />);
    expect(screen.getByText(/请等待 30 秒后重试/)).toBeInTheDocument();
  });

  it("RATE_LIMITED 不传等待秒数时不显示", () => {
    render(<ErrorDisplay {...defaultProps} />);
    expect(screen.queryByText(/请等待.*秒后重试/)).not.toBeInTheDocument();
  });

  it("SERVICE_UNAVAILABLE 显示服务不可用", () => {
    render(
      <ErrorDisplay
        code="SERVICE_UNAVAILABLE"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("服务暂时不可用")).toBeInTheDocument();
  });

  it("VISION_FAILED 显示重试+替换按钮", () => {
    render(
      <ErrorDisplay
        code="VISION_FAILED"
        message="vision error"
        retryable={true}
        onRetry={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更换参考图" }),
    ).toBeInTheDocument();
  });

  it("LLM_FAILED 显示结构化处理失败", () => {
    render(
      <ErrorDisplay
        code="LLM_FAILED"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("结构化处理失败")).toBeInTheDocument();
  });

  it("GENERATION_TIMEOUT 显示生成超时", () => {
    render(
      <ErrorDisplay
        code="GENERATION_TIMEOUT"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("生成超时")).toBeInTheDocument();
  });

  it("ANALYSIS_TIMEOUT 显示分析超时", () => {
    render(
      <ErrorDisplay
        code="ANALYSIS_TIMEOUT"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("分析超时")).toBeInTheDocument();
  });

  it("INVALID_REQUEST 不可重试", () => {
    render(
      <ErrorDisplay
        code="INVALID_REQUEST"
        message="bad input"
        retryable={false}
        onRetry={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    // showRetry=false for INVALID_REQUEST, and retryable=false → canRetry=false
    expect(
      screen.queryByRole("button", { name: "重试" }),
    ).not.toBeInTheDocument();
    // showReplace=true for INVALID_REQUEST
    expect(
      screen.getByRole("button", { name: "更换参考图" }),
    ).toBeInTheDocument();
  });

  it("NOT_FOUND 不显示重试按钮", () => {
    render(
      <ErrorDisplay
        code="NOT_FOUND"
        message=""
        retryable={false}
        onRetry={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "重试" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更换参考图" }),
    ).toBeInTheDocument();
  });

  it("retryable=false 时不显示重试按钮", () => {
    render(
      <ErrorDisplay
        code="RATE_LIMITED"
        message=""
        retryable={false}
        onRetry={vi.fn()}
      />,
    );
    // RATE_LIMITED has showRetry=true, but retryable=false → canRetry=false
    expect(
      screen.queryByRole("button", { name: "重试" }),
    ).not.toBeInTheDocument();
  });

  it("点击重试按钮触发回调", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <ErrorDisplay
        code="RATE_LIMITED"
        message=""
        retryable={true}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("点击替换按钮触发回调", async () => {
    const onReplace = vi.fn();
    const user = userEvent.setup();

    render(
      <ErrorDisplay
        code="VISION_FAILED"
        message=""
        retryable={true}
        onRetry={vi.fn()}
        onReplace={onReplace}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更换参考图" }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it('未知 code 的 fallback 展示 "操作失败"', () => {
    render(
      <ErrorDisplay
        code={"UNKNOWN_CODE" as any}
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("操作失败")).toBeInTheDocument();
  });
});
