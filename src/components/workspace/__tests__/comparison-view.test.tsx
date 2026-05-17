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
    const { container } = render(<ComparisonView {...defaultProps} />);
    const gridEl = container.querySelector(".grid-cols-2");
    expect(gridEl).toBeInTheDocument();
  });
});
