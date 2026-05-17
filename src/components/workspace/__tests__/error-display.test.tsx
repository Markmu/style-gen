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
    expect(screen.getByText("Too Many Requests")).toBeInTheDocument();
  });

  it("RATE_LIMITED 显示等待秒数", () => {
    render(<ErrorDisplay {...defaultProps} retryAfterSeconds={30} />);
    expect(screen.getByText(/Please wait 30s before retrying/)).toBeInTheDocument();
  });

  it("RATE_LIMITED 不传等待秒数时不显示", () => {
    render(<ErrorDisplay {...defaultProps} />);
    expect(screen.queryByText(/Please wait.*before retrying/)).not.toBeInTheDocument();
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
    expect(screen.getByText("Service Temporarily Unavailable")).toBeInTheDocument();
  });

  it("VISION_FAILED 显示Retry+替换按钮", () => {
    render(
      <ErrorDisplay
        code="VISION_FAILED"
        message="vision error"
        retryable={true}
        onRetry={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace Reference" }),
    ).toBeInTheDocument();
  });

  it("LLM_FAILED 显示Structuring Failed", () => {
    render(
      <ErrorDisplay
        code="LLM_FAILED"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Structuring Failed")).toBeInTheDocument();
  });

  it("GENERATION_TIMEOUT 显示Generation Timed Out", () => {
    render(
      <ErrorDisplay
        code="GENERATION_TIMEOUT"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Generation Timed Out")).toBeInTheDocument();
  });

  it("ANALYSIS_TIMEOUT 显示Analysis Timed Out", () => {
    render(
      <ErrorDisplay
        code="ANALYSIS_TIMEOUT"
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Analysis Timed Out")).toBeInTheDocument();
  });

  it("INVALID_REQUEST 不可Retry", () => {
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
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    // showReplace=true for INVALID_REQUEST
    expect(
      screen.getByRole("button", { name: "Replace Reference" }),
    ).toBeInTheDocument();
  });

  it("NOT_FOUND 不显示Retry按钮", () => {
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
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace Reference" }),
    ).toBeInTheDocument();
  });

  it("retryable=false 时不显示Retry按钮", () => {
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
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });

  it("点击Retry按钮触发回调", async () => {
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

    await user.click(screen.getByRole("button", { name: "Retry" }));
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

    await user.click(screen.getByRole("button", { name: "Replace Reference" }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it('未知 code 的 fallback 展示 "Action Failed"', () => {
    render(
      <ErrorDisplay
        code={"UNKNOWN_CODE" as any}
        message=""
        retryable={true}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Action Failed")).toBeInTheDocument();
  });
});
