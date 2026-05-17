// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { GenerationProgress } from "@/components/workspace/generation-progress";

describe("GenerationProgress", () => {
  it('Generating显示进度 - "Generating image..."', () => {
    render(<GenerationProgress isGenerating={true} />);
    expect(screen.getByText("Generating image...")).toBeInTheDocument();
  });

  it('显示预估时间 - "usually takes 10-60s"', () => {
    render(<GenerationProgress isGenerating={true} />);
    expect(screen.getByText(/usually takes 10-60s/)).toBeInTheDocument();
  });

  it("非生成态返回 null", () => {
    const { container } = render(<GenerationProgress isGenerating={false} />);
    expect(container.innerHTML).toBe("");
  });
});
