// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ComparisonView } from "@/components/workspace/comparison-view";

vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

describe("ComparisonView", () => {
  const defaultProps = {
    referenceImageUrl: "https://example.com/ref.png",
    resultImageUrl: "https://example.com/result.png",
  };

  it("并排展示两张图", () => {
    render(<ComparisonView {...defaultProps} />);
    const refImg = screen.getByAltText("参考图");
    const resultImg = screen.getByAltText("生成结果");
    expect(refImg).toBeInTheDocument();
    expect(resultImg).toBeInTheDocument();
    expect(screen.getByText("参考图 vs 生成结果")).toBeInTheDocument();
  });

  it("标签标注 - contains '参考图' and '生成结果' text labels", () => {
    render(<ComparisonView {...defaultProps} />);
    // The heading "参考图 vs 生成结果" contains both, but the label <p> also contain them separately
    const labels = screen.getAllByText("参考图");
    expect(labels.length).toBeGreaterThanOrEqual(1);
    const resultLabels = screen.getAllByText("生成结果");
    expect(resultLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('两列网格布局 - container has "grid-cols-2" class', () => {
    const { container } = render(<ComparisonView {...defaultProps} />);
    const gridEl = container.querySelector(".grid-cols-2");
    expect(gridEl).toBeInTheDocument();
  });
});
