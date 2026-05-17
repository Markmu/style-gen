// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasToolbar } from "@/components/workspace/canvas-toolbar";

describe("CanvasToolbar", () => {
  const defaultProps = {
    resultImageUrl: "https://example.com/result.png",
    referenceImageUrl: "https://example.com/ref.png",
    activeView: "result" as const,
    onViewChange: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Three action buttons render ---

  it("三个操作按钮正确渲染", () => {
    render(<CanvasToolbar {...defaultProps} />);

    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  // --- Click comparison toggles activeView ---

  it("点击Compare切换视图", async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CanvasToolbar {...defaultProps} onViewChange={onViewChange} />,
    );

    await user.click(screen.getByText("Compare"));
    expect(onViewChange).toHaveBeenCalledWith("comparison");
  });

  it("点击Result切换视图", async () => {
    const onViewChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CanvasToolbar
        {...defaultProps}
        activeView="comparison"
        onViewChange={onViewChange}
      />,
    );

    await user.click(screen.getByText("Result"));
    expect(onViewChange).toHaveBeenCalledWith("result");
  });

  // --- Download button href ---

  it("Download按钮 href 正确", () => {
    render(<CanvasToolbar {...defaultProps} />);

    const downloadLink = screen.getByText("Download");
    expect(downloadLink).toHaveAttribute(
      "href",
      "https://example.com/result.png",
    );
    expect(downloadLink).toHaveAttribute("download");
  });
});
