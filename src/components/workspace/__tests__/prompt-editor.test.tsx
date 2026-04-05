// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptEditor } from "@/components/workspace/prompt-editor";

describe("PromptEditor", () => {
  const defaultProps = {
    promptText: "",
    negativePromptText: "",
    onPromptChange: vi.fn(),
    onNegativePromptChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. 渲染双文本域 - P0
  it("渲染双文本域", () => {
    render(<PromptEditor {...defaultProps} />);

    expect(screen.getByLabelText(/^Prompt/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Negative Prompt/)).toBeInTheDocument();
  });

  // 2. 编辑 Prompt - P0
  it("编辑 Prompt - onPromptChange called", () => {
    const onPromptChange = vi.fn();
    render(
      <PromptEditor {...defaultProps} onPromptChange={onPromptChange} />,
    );

    const promptTextarea = screen.getByLabelText(/^Prompt/);
    fireEvent.change(promptTextarea, { target: { value: "a cat on a roof" } });

    expect(onPromptChange).toHaveBeenCalledWith("a cat on a roof");
  });

  // 3. 编辑 Negative Prompt - P0
  it("编辑 Negative Prompt - onNegativePromptChange called", () => {
    const onNegativePromptChange = vi.fn();
    render(
      <PromptEditor
        {...defaultProps}
        onNegativePromptChange={onNegativePromptChange}
      />,
    );

    const negTextarea = screen.getByLabelText(/^Negative Prompt/);
    fireEvent.change(negTextarea, { target: { value: "blurry, low quality" } });

    expect(onNegativePromptChange).toHaveBeenCalledWith("blurry, low quality");
  });

  // 4. disabled 状态 - P1
  it("disabled 状态 - textareas disabled", () => {
    render(
      <PromptEditor {...defaultProps} disabled={true} />,
    );

    expect(screen.getByLabelText(/^Prompt/)).toBeDisabled();
    expect(screen.getByLabelText(/^Negative Prompt/)).toBeDisabled();
  });
});
