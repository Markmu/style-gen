// @vitest-environment jsdom
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationDialog } from "@/components/workspace/generation-dialog";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { alt, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ""} {...rest} />;
  },
}));

/**
 * plan-07（架构 §2.1.6 / §6.4）兼容性契约：GenerationDialog 组件本体保留，
 * 本组用例继续钉住其显式打开时的行为（进度/成功/失败 + 关闭/返回编辑）；
 * 「Workspace 成功/提交路径不再打开该弹层」的行为契约由
 * `e2e/workspace-generation-dialog.spec.ts` 与 `e2e/error-path.spec.ts`
 * 承载（内联终态/内联提交失败），不在此重复。
 */
describe("GenerationDialog", () => {
  const defaultProps = {
    open: true,
    state: "generating" as const,
    resultImageUrl: null,
    error: null,
    generationQueueing: false,
    onClose: vi.fn(),
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders progress in a dialog while generating", () => {
    render(<GenerationDialog {...defaultProps} />);

    expect(screen.getByRole("dialog", { name: "Generation Task" })).toBeInTheDocument();
    expect(screen.getByText("Generating image...")).toBeInTheDocument();
  });

  it("renders the completed result and closes without invoking retry", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRetry = vi.fn();

    render(
      <GenerationDialog
        {...defaultProps}
        state="generation_ready"
        resultImageUrl="https://cdn.example.com/result.png"
        onClose={onClose}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByAltText("Generated Result")).toBeInTheDocument();
    expect(screen.getByText(/reference, prompt, and params are still available/i)).toBeInTheDocument();
    await user.click(screen.getByText("Close Dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renders failure actions and returns to editing without retrying", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRetry = vi.fn();

    render(
      <GenerationDialog
        {...defaultProps}
        state="generation_ready"
        error={{ message: "failed", stage: "generation" }}
        onClose={onClose}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Generation Failed")).toBeInTheDocument();
    expect(
      screen.getByText(/reference, prompt, variables, and params are preserved/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Edit" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("does not render when closed", () => {
    render(<GenerationDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole("dialog", { name: "Generation Task" })).not.toBeInTheDocument();
  });

  it("does not expose internal stack details in failure messages", () => {
    render(
      <GenerationDialog
        {...defaultProps}
        state="generation_ready"
        error={{
          message:
            "Provider exploded\n    at secretHandler (/Users/example/app/node_modules/provider/index.js:10:5)",
          stage: "generation",
        }}
      />,
    );

    expect(screen.getByText(/workspace context is safe/i)).toBeInTheDocument();
    expect(screen.queryByText(/node_modules|\/Users|secretHandler/i)).not.toBeInTheDocument();
  });
});
