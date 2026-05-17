// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RetryButton } from "@/components/workspace/retry-button";

describe("RetryButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('analysis 类型显示"Analyze Again"', () => {
    render(<RetryButton type="analysis" onRetry={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Analyze Again" }),
    ).toBeInTheDocument();
  });

  it('generation 类型显示"Regenerate"', () => {
    render(<RetryButton type="generation" onRetry={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Regenerate" }),
    ).toBeInTheDocument();
  });

  it("点击触发 onRetry 回调", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(<RetryButton type="analysis" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Analyze Again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disabled 时按钮不可点击", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <RetryButton
        type="analysis"
        onRetry={onRetry}
        disabled
        disabledReason="服务不可用"
      />,
    );

    const btn = screen.getByRole("button", { name: "Analyze Again" });
    expect(btn).toBeDisabled();

    await user.click(btn);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("disabled 时显示禁用原因", () => {
    render(
      <RetryButton
        type="generation"
        onRetry={vi.fn()}
        disabled
        disabledReason="服务不可用"
      />,
    );
    expect(screen.getByText("服务不可用")).toBeInTheDocument();
  });

  it("非 disabled 时不显示禁用原因", () => {
    render(
      <RetryButton
        type="generation"
        onRetry={vi.fn()}
        disabledReason="服务不可用"
      />,
    );
    expect(screen.queryByText("服务不可用")).not.toBeInTheDocument();
  });

  it("disabled 时按钮样式变灰", () => {
    render(
      <RetryButton
        type="analysis"
        onRetry={vi.fn()}
        disabled
        disabledReason="等待中"
      />,
    );

    const btn = screen.getByRole("button", { name: "Analyze Again" });
    expect(btn.className).toContain("cursor-not-allowed");
    expect(btn.className).toContain("bg-[var(--surface-bright)]");
  });
});
