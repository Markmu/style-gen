// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ReplaceConfirmDialog,
  type ReplaceConfirmDialogProps,
} from "@/components/iterations/replace-confirm-dialog";

const CURRENT_PROMPT = "Lavender haze editorial study";
const TARGET_PROMPT = "Neon cityscape at dusk with amber towers";

function renderDialog(
  overrides: Partial<ReplaceConfirmDialogProps> = {},
): { onCancel: ReturnType<typeof vi.fn>; onConfirm: ReturnType<typeof vi.fn> } {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ReplaceConfirmDialog
      open
      currentPrompt={CURRENT_PROMPT}
      targetPrompt={TARGET_PROMPT}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onCancel, onConfirm };
}

describe("ReplaceConfirmDialog — 渲染契约（plan-04 / 架构 §6.3 步骤 3）", () => {
  it("open 时以 role=dialog 渲染，并完整展示当前方向与目标方向两侧提示摘要", () => {
    renderDialog();

    const dialog = screen.getByTestId("replace-confirm-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");

    const currentSide = dialog.querySelector('[data-summary-side="current"]');
    const targetSide = dialog.querySelector('[data-summary-side="target"]');
    expect(currentSide).toHaveTextContent(CURRENT_PROMPT);
    expect(targetSide).toHaveTextContent(TARGET_PROMPT);

    // 说明文案：切换语义 + 当前内容不会作为新 Iteration 保存
    expect(dialog).toHaveTextContent(/switches the workspace to the selected iteration/i);
    expect(dialog).toHaveTextContent(/will not be saved as a new iteration/i);

    // 取消与确认按钮均可见
    expect(
      within(dialog).getByRole("button", { name: /^cancel$/i }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: /switch and continue/i }),
    ).toBeVisible();
  });

  it("open=false 时不渲染任何内容", () => {
    renderDialog({ open: false });

    expect(screen.queryByTestId("replace-confirm-dialog")).not.toBeInTheDocument();
  });

  it("当前提示为空时以占位说明展示当前方向摘要", () => {
    renderDialog({ currentPrompt: "   " });

    const currentSide = screen
      .getByTestId("replace-confirm-dialog")
      .querySelector('[data-summary-side="current"]');
    expect(currentSide).toHaveTextContent(/\(no prompt yet\)/i);
  });
});

describe("ReplaceConfirmDialog — 交互契约", () => {
  it("取消只触发 onCancel，不触发 onConfirm（停留详情，两侧零变更）", async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("继续切换只触发 onConfirm，不触发 onCancel", async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();

    await user.click(
      screen.getByRole("button", { name: /switch and continue/i }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Escape 视为取消", async () => {
    const { onCancel } = renderDialog();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("ReplaceConfirmDialog — “确认期间切换详情关闭不应用”边界（plan-04 边界场景）", () => {
  it("宿主在未确认时把 open 置 false（切换/关闭详情）：对话框消失且 onConfirm 未被调用，载荷不被应用", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const props: ReplaceConfirmDialogProps = {
      open: true,
      currentPrompt: CURRENT_PROMPT,
      targetPrompt: TARGET_PROMPT,
      onCancel,
      onConfirm,
    };
    const { rerender } = render(<ReplaceConfirmDialog {...props} />);

    // 对话框已打开且未点击确认
    expect(screen.getByTestId("replace-confirm-dialog")).toBeInTheDocument();

    // 宿主（详情面板）在确认前切换详情：受控关闭对话框
    rerender(<ReplaceConfirmDialog {...props} open={false} />);

    expect(screen.queryByTestId("replace-confirm-dialog")).not.toBeInTheDocument();
    // 关闭不等于确认：恢复载荷未被应用
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
