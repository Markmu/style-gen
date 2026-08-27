// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
}

const TAILWIND_UNIT_PX = 4;
const ROOT_FONT_SIZE_PX = 16;

function resolveAxisHitSize(classNames: string, prefixes: string[]): number {
  let size = 0;
  for (const className of classNames.split(/\s+/).filter(Boolean)) {
    for (const prefix of prefixes) {
      const scale = new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`).exec(className);
      if (scale) {
        size = Math.max(size, Number(scale[1]) * TAILWIND_UNIT_PX);
        continue;
      }
      const arbitrary = new RegExp(
        `^${prefix}-\\[(\\d+(?:\\.\\d+)?)(px|rem)\\]$`,
      ).exec(className);
      if (arbitrary) {
        const value =
          Number(arbitrary[1]) *
          (arbitrary[2] === "rem" ? ROOT_FONT_SIZE_PX : 1);
        size = Math.max(size, value);
      }
    }
  }
  return size;
}

/**
 * jsdom 无布局（`getBoundingClientRect()` 恒为 0、`offsetParent` 恒为 null，
 * 见 plan-03「风险与边界」）。≥44×44px 命中面积以渲染类中的尺寸/最小尺寸类
 * （min-w 与 w 类、min-h 与 h 类；Tailwind 数值刻度 1 = 4px，另支持 [Npx] 与
 * [Nrem] 任意值）解析出的宽高作为 getBoundingClientRect ≥ 44px 的可落地断言口径。
 */
function expectHitAreaAtLeast44px(element: HTMLElement, description: string) {
  const classNames = element.getAttribute("class") ?? "";
  const width = resolveAxisHitSize(classNames, ["min-w", "w"]);
  const height = resolveAxisHitSize(classNames, ["min-h", "h"]);
  expect(
    width,
    `${description} 命中面积宽度需 ≥44px（解析自类 "${classNames}"）`,
  ).toBeGreaterThanOrEqual(44);
  expect(
    height,
    `${description} 命中面积高度需 ≥44px（解析自类 "${classNames}"）`,
  ).toBeGreaterThanOrEqual(44);
}

/** 遮罩口径：role=dialog 容器应包裹在固定遮罩/居中层内，点击该层等价于点击遮罩区域。 */
function getOverlayOf(dialog: HTMLElement): HTMLElement {
  const overlay = dialog.parentElement;
  if (!overlay) {
    throw new Error("ModalDialog 遮罩层缺失：role=dialog 容器需包裹在遮罩层内");
  }
  return overlay;
}

interface ModalDialogHarnessProps {
  onClose?: () => void;
  destructive?: boolean;
}

function ModalDialogHarness({
  onClose,
  destructive,
}: ModalDialogHarnessProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button type="button">Background action</button>
      <ModalDialog
        open={open}
        onClose={onClose ?? (() => setOpen(false))}
        label="Confirm delete"
        destructive={destructive}
      >
        <p>Dialog body copy</p>
        <button type="button">Keep it</button>
        <button type="button">Delete memory</button>
      </ModalDialog>
    </div>
  );
}

function renderOpenDialog() {
  render(
    <ModalDialog open onClose={vi.fn()} label="Confirm delete">
      <p>Dialog body copy</p>
      <button type="button">Keep it</button>
      <button type="button">Delete memory</button>
    </ModalDialog>,
  );
  return screen.getByRole("dialog", { name: "Confirm delete" });
}

describe("ModalDialog", () => {
  it("does not render the dialog when open is false", () => {
    render(
      <ModalDialog open={false} onClose={vi.fn()} label="Confirm delete">
        <p>Dialog body copy</p>
      </ModalDialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the dialog from label, or from labelledBy when both are provided", () => {
    const labelNamed = renderOpenDialog();
    expect(labelNamed).toHaveAttribute("aria-modal", "true");

    const labelledRender = render(
      <ModalDialog
        open
        onClose={vi.fn()}
        label="Unused label"
        labelledBy="modal-heading"
      >
        <h2 id="modal-heading">Delete this memory?</h2>
        <p>Dialog body copy</p>
      </ModalDialog>,
    );

    expect(
      screen.getByRole("dialog", { name: "Delete this memory?" }),
    ).toBeInTheDocument();
    labelledRender.unmount();
  });

  it("traps Tab/Shift+Tab inside the dialog and keeps background buttons out of reach", async () => {
    const user = userEvent.setup();
    render(<ModalDialogHarness />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Confirm delete" });
    // 打开后的初始焦点（缺省：容器首个可聚焦元素）落在弹层内
    expect(dialog).toContainElement(document.activeElement);

    const focusables = getFocusableElements(dialog);
    expect(focusables.length).toBeGreaterThanOrEqual(3);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) {
      throw new Error("ModalDialog 内应有多个可聚焦元素");
    }

    // 末元素上 Tab → 首元素；首元素上 Shift+Tab → 末元素（弹层内循环）
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    // 连续 Tab 不离开弹层：背景按钮与打开按钮均不可达
    const backgroundButton = screen.getByRole("button", {
      name: "Background action",
    });
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement);
    }
    expect(backgroundButton).not.toHaveFocus();
    expect(opener).not.toHaveFocus();
  });

  it("closes through Escape and the icon close button, restoring focus to the pre-open active element", async () => {
    const user = userEvent.setup();
    render(<ModalDialogHarness />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);
    expect(
      screen.getByRole("dialog", { name: "Confirm delete" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Confirm delete" }),
    ).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    const closeButton = screen.getByRole("button", { name: /^(close|关闭)/i });
    await user.click(closeButton);
    expect(
      screen.queryByRole("dialog", { name: "Confirm delete" }),
    ).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes from the overlay click in the default variant but not from the dialog surface", () => {
    const onClose = vi.fn();
    render(
      <ModalDialog open onClose={onClose} label="Confirm delete">
        <p>Dialog body copy</p>
      </ModalDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Confirm delete" });
    // jsdom 无命中测试，直接对遮罩层派发 click
    fireEvent.click(getOverlayOf(dialog));
    expect(onClose).toHaveBeenCalledTimes(1);

    // 容器 stopPropagation：点击弹层本体不触发 onClose
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close from the overlay for destructive or closeOnOverlayClick=false variants", () => {
    const destructiveClose = vi.fn();
    const { rerender } = render(
      <ModalDialog open onClose={destructiveClose} label="Confirm delete" destructive>
        <p>Dialog body copy</p>
      </ModalDialog>,
    );

    fireEvent.click(
      getOverlayOf(screen.getByRole("dialog", { name: "Confirm delete" })),
    );
    expect(destructiveClose).not.toHaveBeenCalled();

    // destructive 强制禁用遮罩关闭：即使消费方显式传 closeOnOverlayClick 也不生效
    rerender(
      <ModalDialog
        open
        onClose={destructiveClose}
        label="Confirm delete"
        destructive
        closeOnOverlayClick
      >
        <p>Dialog body copy</p>
      </ModalDialog>,
    );
    fireEvent.click(
      getOverlayOf(screen.getByRole("dialog", { name: "Confirm delete" })),
    );
    expect(destructiveClose).not.toHaveBeenCalled();

    const optOutClose = vi.fn();
    rerender(
      <ModalDialog
        open
        onClose={optOutClose}
        label="Confirm delete"
        closeOnOverlayClick={false}
      >
        <p>Dialog body copy</p>
      </ModalDialog>,
    );
    fireEvent.click(
      getOverlayOf(screen.getByRole("dialog", { name: "Confirm delete" })),
    );
    expect(optOutClose).not.toHaveBeenCalled();
  });

  it("gives the icon close button an understandable aria-label and a >=44x44px hit area", () => {
    const dialog = renderOpenDialog();

    // getByRole(name: ...) 命中即断言关闭按钮存在非空可访问名称（aria-label 必填）
    const closeButton = screen.getByRole("button", { name: /^(close|关闭)/i });
    expect(dialog).toContainElement(closeButton);
    expectHitAreaAtLeast44px(closeButton, "ModalDialog 关闭图标按钮");
  });

  it("focuses initialFocusRef on open and falls back to the container when the target is invisible", () => {
    // jsdom 的 offsetParent 恒为 null，无法作为可见性判据；以 display:none 为「不可见」口径
    const visibleRef = createRef<HTMLButtonElement>();
    const visibleRender = render(
      <ModalDialog
        open
        onClose={vi.fn()}
        label="Confirm delete"
        initialFocusRef={visibleRef}
      >
        <p>Dialog body copy</p>
        <button ref={visibleRef} type="button">
          Pinned target
        </button>
        <button type="button">Other action</button>
      </ModalDialog>,
    );
    expect(screen.getByRole("button", { name: "Pinned target" })).toHaveFocus();
    visibleRender.unmount();

    const hiddenRef = createRef<HTMLButtonElement>();
    render(
      <ModalDialog
        open
        onClose={vi.fn()}
        label="Confirm delete"
        initialFocusRef={hiddenRef}
      >
        <p>Dialog body copy</p>
        <button ref={hiddenRef} type="button" style={{ display: "none" }}>
          Hidden target
        </button>
        <button type="button">Other action</button>
      </ModalDialog>,
    );

    // initialFocusRef 不可见 → 回退聚焦容器本身（tabindex=-1 的 role=dialog 容器）
    const dialog = screen.getByRole("dialog", { name: "Confirm delete" });
    expect(document.activeElement).toBe(dialog);
  });
});
