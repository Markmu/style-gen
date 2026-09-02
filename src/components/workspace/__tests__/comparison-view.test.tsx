// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ComparisonView } from "@/components/workspace/comparison-view";

describe("ComparisonView", () => {
  const defaultProps = {
    referenceImageUrl: "https://example.com/ref.png",
    resultImageUrl: "https://example.com/result.png",
  };

  it("并排展示两张图", () => {
    render(<ComparisonView {...defaultProps} />);
    const refImg = screen.getByAltText("Reference");
    const resultImg = screen.getByAltText("Generated Result");
    expect(refImg).toBeInTheDocument();
    expect(resultImg).toBeInTheDocument();
    expect(screen.getByText("Reference vs Generated Result")).toBeInTheDocument();
  });

  it("标签标注 - contains 'Reference' and 'Generated Result' text labels", () => {
    render(<ComparisonView {...defaultProps} />);
    // The heading "Reference vs Generated Result" contains both, but the label <p> also contain them separately
    const labels = screen.getAllByText("Reference");
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const resultLabels = screen.getAllByText("Generated Result");
    expect(resultLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('两列网格布局 - container has "grid-cols-2" class', () => {
    const { container } = render(
      <ComparisonView {...defaultProps} aspectRatio="1:1" />,
    );
    const gridEl = container.querySelector(".grid-cols-2");
    expect(gridEl).toBeInTheDocument();
  });

  it("竖画幅切换为堆叠布局", () => {
    const { container } = render(
      <ComparisonView {...defaultProps} aspectRatio="9:16" />,
    );
    expect(container.querySelector(".grid-cols-2")).toBeNull();
    expect(container.querySelector(".grid-cols-1")).toBeInTheDocument();
  });

  it("plan-05：双图 img 挂 testid 且 src 使用真实 URL", () => {
    render(<ComparisonView {...defaultProps} />);
    const refImg = screen.getByTestId("comparison-reference-image");
    const resultImg = screen.getByTestId("comparison-result-image");
    expect(refImg).toHaveAttribute("src", "https://example.com/ref.png");
    expect(resultImg).toHaveAttribute("src", "https://example.com/result.png");
  });

  it("plan-05：参考图缺失显示真实缺失态，不渲染假图", () => {
    render(
      <ComparisonView
        referenceImageUrl={null}
        resultImageUrl="https://example.com/result.png"
      />,
    );
    expect(screen.getByTestId("comparison-reference-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("comparison-reference-image")).toBeNull();
    expect(screen.getByTestId("comparison-result-image")).toBeInTheDocument();
  });

  it("plan-05：结果图缺失显示真实缺失态，不渲染假图", () => {
    render(
      <ComparisonView
        referenceImageUrl="https://example.com/ref.png"
        resultImageUrl={null}
      />,
    );
    expect(screen.getByTestId("comparison-result-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("comparison-result-image")).toBeNull();
    expect(screen.getByTestId("comparison-reference-image")).toBeInTheDocument();
  });
});
