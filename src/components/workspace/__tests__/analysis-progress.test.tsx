// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";

describe("AnalysisProgress", () => {
  const defaultProps = {
    isAnalyzing: false,
    error: null,
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. 分析中显示加载动画 - P0
  it("分析中显示 'AI 正在分析图片风格...'", () => {
    render(<AnalysisProgress {...defaultProps} isAnalyzing={true} />);

    expect(screen.getByText("AI 正在分析图片风格...")).toBeInTheDocument();
  });

  // 2. 错误态展示 - P0
  it("错误态展示 - '分析失败', stage, error message, '重新分析' 按钮", () => {
    render(
      <AnalysisProgress
        {...defaultProps}
        error={{ message: "API timeout", stage: "vision" }}
      />,
    );

    expect(screen.getByText("分析失败")).toBeInTheDocument();
    expect(screen.getByText("阶段：视觉理解")).toBeInTheDocument();
    expect(screen.getByText("API timeout")).toBeInTheDocument();
    expect(screen.getByText("重新分析")).toBeInTheDocument();
  });

  // 3. LLM 阶段错误 - P1
  it("LLM 阶段错误 - 显示 'LLM 结构化'", () => {
    render(
      <AnalysisProgress
        {...defaultProps}
        error={{ message: "Parse error", stage: "llm" }}
      />,
    );

    expect(screen.getByText("阶段：LLM 结构化")).toBeInTheDocument();
  });

  // 4. 重试按钮点击 - P0
  it("重试按钮点击 - onRetry called", () => {
    const onRetry = vi.fn();
    render(
      <AnalysisProgress
        {...defaultProps}
        error={{ message: "失败了" }}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByText("重新分析"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  // 5. 非分析且无错误返回 null - P1
  it("非分析且无错误返回 null", () => {
    const { container } = render(
      <AnalysisProgress {...defaultProps} isAnalyzing={false} error={null} />,
    );

    expect(container.innerHTML).toBe("");
  });
});
