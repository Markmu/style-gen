"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * plan-03（架构 ADR-6）: 键盘可达下拉菜单原语。
 *
 * - 触发按钮 `aria-haspopup="menu"` + `aria-expanded`，label 同时作为
 *   可见文本与可理解名称；命中面积 >=44x44px（min-h/min-w-11）。
 * - 打开后聚焦首项；ArrowDown / ArrowUp 在 `role="menuitem"` 项间循环
 *   （首尾环绕）；Escape 关闭并把焦点还原到触发按钮；Enter / Space 触发
 *   聚焦项 `onSelect` 后关闭并还原焦点。焦点记录/还原由 `useFocusTrap`
 *   承担（嵌套于 ModalDialog 时，更深的本原语监听优先消费按键）。
 * - 菜单项按 ARIA APG 菜单模式实现为 `tabIndex={-1}` 的 roving-focus 项，
 *   由方向键导航而非 Tab 顺序聚焦。
 * - danger 项以错误色文字 + 图标双通道标识，不只依赖颜色。
 */

export interface DropdownMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** 删除等危险项：错误色文字 + 图标（不只依赖颜色） */
  danger?: boolean;
}

export interface DropdownMenuProps {
  /** label 为可理解名称（aria-label + 可见文本），icon 可选 */
  trigger: { icon?: LucideIcon; label: string };
  items: DropdownMenuItem[];
}

export function DropdownMenu({ trigger, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 首项 ref：trap 激活时作为 initialFocusRef（打开即聚焦首项）
  const firstItemRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  // 关闭时的焦点还原由 useFocusTrap 的卸载/失活还原承担（还原到打开前焦点 = 触发按钮）
  const { containerRef } = useFocusTrap({
    active: open,
    onEscape: closeMenu,
    initialFocusRef: firstItemRef,
  });

  const openMenu = useCallback(() => {
    setActiveIndex(0);
    setOpen(true);
  }, []);

  // 指针点到组件外部时关闭菜单（键盘路径由 Escape / 选中关闭覆盖）
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) {
        return;
      }
      item.onSelect();
      setOpen(false);
    },
    [items],
  );

  const focusItemAt = useCallback((index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  const handleMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (items.length === 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItemAt((activeIndex + 1) % items.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItemAt((activeIndex - 1 + items.length) % items.length);
        break;
      case "Home":
        event.preventDefault();
        focusItemAt(0);
        break;
      case "End":
        event.preventDefault();
        focusItemAt(items.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectItem(activeIndex);
        break;
      default:
        break;
    }
  };

  const TriggerIcon = trigger.icon;

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={trigger.label}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          // APG 菜单模式：关闭态下方向键也可打开菜单
          if (
            !open &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            openMenu();
          }
        }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-static)] bg-[var(--surface-floating)] px-3 text-[0.8125rem] font-medium text-[var(--text-primary)] shadow-2xs transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {TriggerIcon ? <AppIcon icon={TriggerIcon} size={16} /> : null}
        <span>{trigger.label}</span>
      </button>

      {open && items.length > 0 && (
        <div
          ref={containerRef}
          role="menu"
          aria-label={trigger.label}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
          className="glass-panel absolute right-0 top-[calc(100%+0.375rem)] z-50 min-w-44 rounded-xl p-1"
        >
          {items.map((item, index) => {
            const isDanger = item.danger === true;
            return (
              <div
                key={item.key}
                ref={(element) => {
                  itemRefs.current[index] = element;
                  if (index === 0) {
                    firstItemRef.current = element;
                  }
                }}
                role="menuitem"
                tabIndex={-1}
                onClick={() => selectItem(index)}
                className={`flex min-h-11 min-w-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-[0.8125rem] transition-colors focus:bg-[var(--surface-hover)] focus:outline-none hover:bg-[var(--surface-hover)] ${
                  isDanger
                    ? "text-[var(--color-error)]"
                    : "text-[var(--text-primary)]"
                }`}
              >
                {isDanger ? <AppIcon icon={Trash2} size={16} /> : null}
                <span className="truncate">{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
