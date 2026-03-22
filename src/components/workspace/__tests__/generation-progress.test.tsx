// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { GenerationProgress } from "@/components/workspace/generation-progress";

describe("GenerationProgress", () => {
  it('生成中显示进度 - "正在生成图片..."', () => {
    render(<GenerationProgress isGenerating={true} />);
    expect(screen.getByText("正在生成图片...")).toBeInTheDocument();
  });

  it('显示预估时间 - "预计需要 10-60 秒"', () => {
    render(<GenerationProgress isGenerating={true} />);
    expect(screen.getByText(/预计需要 10-60 秒/)).toBeInTheDocument();
  });

  it("非生成态返回 null", () => {
    const { container } = render(<GenerationProgress isGenerating={false} />);
    expect(container.innerHTML).toBe("");
  });
});
