// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

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

function createMenuFixtures() {
  const duplicate = vi.fn();
  const share = vi.fn();
  const remove = vi.fn();
  return {
    callbacks: { duplicate, share, remove },
    items: [
      { key: "duplicate", label: "Duplicate", onSelect: duplicate },
      { key: "share", label: "Share link", onSelect: share },
      {
        key: "delete",
        label: "Delete memory",
        onSelect: remove,
        danger: true,
      },
    ],
  };
}

function renderMenu() {
  const { callbacks, items } = createMenuFixtures();
  // icon 为可选 prop：label-only 触发器必须可用（可理解名称来自 label）
  render(<DropdownMenu trigger={{ label: "More actions" }} items={items} />);
  return {
    callbacks,
    trigger: screen.getByRole("button", { name: "More actions" }),
  };
}

describe("DropdownMenu", () => {
  it("renders an aria-haspopup/aria-expanded trigger with >=44px hit area and no menu before opening", () => {
    const { trigger } = renderMenu();

    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expectHitAreaAtLeast44px(trigger, "DropdownMenu 触发按钮");
  });

  it("opens focused on the first item, flips aria-expanded, and keeps >=44px item hit areas", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(3);
    expect(
      screen.getByRole("menuitem", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Share link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete memory" }),
    ).toBeInTheDocument();

    // 打开后聚焦首项
    expect(menuItems[0]).toHaveFocus();

    for (const [index, item] of menuItems.entries()) {
      expectHitAreaAtLeast44px(item, `DropdownMenu 菜单项 ${index + 1}`);
    }
  });

  it("cycles through items with ArrowDown and ArrowUp including wrap-around", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();
    await user.click(trigger);
    const menuItems = screen.getAllByRole("menuitem");

    await user.keyboard("{ArrowDown}");
    expect(menuItems[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(menuItems[2]).toHaveFocus();
    // 末项上 ArrowDown → 回到首项
    await user.keyboard("{ArrowDown}");
    expect(menuItems[0]).toHaveFocus();
    // 首项上 ArrowUp → 回到末项
    await user.keyboard("{ArrowUp}");
    expect(menuItems[2]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(menuItems[1]).toHaveFocus();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("activates the focused item with Enter, then closes the menu and restores trigger focus", async () => {
    const user = userEvent.setup();
    const { callbacks, trigger } = renderMenu();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}");

    await user.keyboard("{Enter}");

    expect(callbacks.share).toHaveBeenCalledTimes(1);
    expect(callbacks.duplicate).not.toHaveBeenCalled();
    expect(callbacks.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("activates the focused item with Space, including danger items", async () => {
    const user = userEvent.setup();
    const { callbacks, trigger } = renderMenu();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");

    await user.keyboard(" ");

    expect(callbacks.remove).toHaveBeenCalledTimes(1);
    expect(callbacks.duplicate).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("marks danger items with a non-color cue in addition to the text label", async () => {
    const user = userEvent.setup();
    const { trigger } = renderMenu();
    await user.click(trigger);

    const dangerItem = screen.getByRole("menuitem", { name: "Delete memory" });
    // 文字标签保留（不只依赖颜色 = 文字 + 图标双通道）
    expect(dangerItem).toHaveTextContent("Delete memory");
    // danger 视觉提示附图标（svg），颜色不是唯一标识
    expect(dangerItem.querySelector("svg")).not.toBeNull();
  });
});
