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

  // 1. Analyzing显示加载动画 - P0
  it("Analyzing显示 'AI is analyzing the image style...'", () => {
    render(<AnalysisProgress {...defaultProps} isAnalyzing={true} />);

    expect(screen.getByText("AI is analyzing the image style...")).toBeInTheDocument();
  });

  // 2. 错误态展示 - P0
  it("错误态展示 - 'Analysis Failed', stage, error message, 'Analyze Again' 按钮", () => {
    render(
      <AnalysisProgress
        {...defaultProps}
        error={{ message: "API timeout", stage: "vision" }}
      />,
    );

    expect(screen.getByText("Analysis Failed")).toBeInTheDocument();
    expect(screen.getByText("Stage: Vision Understanding")).toBeInTheDocument();
    expect(screen.getByText("API timeout")).toBeInTheDocument();
    expect(screen.getByText("Analyze Again")).toBeInTheDocument();
  });

  // 3. LLM 阶段错误 - P1
  it("LLM 阶段错误 - 显示 'LLM Structuring'", () => {
    render(
      <AnalysisProgress
        {...defaultProps}
        error={{ message: "Parse error", stage: "llm" }}
      />,
    );

    expect(screen.getByText("Stage: LLM Structuring")).toBeInTheDocument();
  });

  // 4. Retry按钮点击 - P0
  it("Retry按钮点击 - onRetry called", () => {
    const onRetry = vi.fn();
    render(
      <AnalysisProgress
        {...defaultProps}
        error={{ message: "失败了" }}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByText("Analyze Again"));
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
