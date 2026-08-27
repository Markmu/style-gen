"use client";

import { useEffect, useRef } from "react";

/**
 * plan-03（架构 ADR-6）: 弹层与菜单共用的焦点陷阱 hook。
 *
 * - `active` false→true 时挂载 trap 并记录先前焦点（背景触发元素）；
 *   true→false 或组件卸载时把焦点还原到该元素（元素已随背景卸载时跳过）。
 * - Tab / Shift+Tab 在容器内循环：可聚焦元素每次按键实时查询（支持弹层内
 *   动态增删可聚焦元素），首元素 Shift+Tab 跳末元素、末元素 Tab 跳首元素。
 * - Escape 只负责回调（`onEscape` 由消费方决定关闭语义），并在处理后
 *   `stopPropagation`：嵌套场景（菜单中打开确认层）由更深的内层原语优先接管。
 * - 监听挂在容器 `keydown` 冒泡阶段：更深的内层监听先收到事件，可通过
 *   `stopPropagation` 抢先消费按键，外层 trap 不重复响应。
 */

/** 可聚焦元素查询（plan-03 实现规格；与组件测试同口径） */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface UseFocusTrapOptions {
  /** 激活时挂载 trap 并记录先前焦点 */
  active: boolean;
  /** Escape 回调（由消费方决定关闭语义） */
  onEscape?: () => void;
  /** 打开时聚焦目标，缺省聚焦容器首个可聚焦元素；目标不可见时回退容器本身 */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export interface UseFocusTrapResult {
  /** trap 容器：消费方挂到 role=dialog / role=menu 的根元素上（需 tabIndex=-1） */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 无布局环境判定：jsdom 的 `getClientRects()` 恒为空、`offsetParent` 恒为
 * null（plan-03 风险备注），此时退化为纯样式可见性判定，不做 offsetParent 过滤。
 */
function isLayoutEngineAvailable(): boolean {
  return (
    typeof document !== "undefined" &&
    document.body !== null &&
    document.body.getClientRects().length > 0
  );
}

/** 可见性过滤：样式级判定在所有环境生效；offsetParent 过滤仅在真实布局引擎中生效 */
function isElementVisible(element: HTMLElement): boolean {
  if (element.hidden) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  if (
    isLayoutEngineAvailable() &&
    element.offsetParent === null &&
    style.position !== "fixed"
  ) {
    return false;
  }
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isElementVisible);
}

function focusInitialTarget(
  container: HTMLElement,
  preferred: HTMLElement | null,
): void {
  if (preferred) {
    // 指定目标不可见 → 回退聚焦容器本身（tabindex=-1，plan-03 边界场景）
    if (preferred.isConnected && isElementVisible(preferred)) {
      preferred.focus();
    } else {
      container.focus();
    }
    return;
  }
  const first = getFocusableElements(container)[0];
  if (first) {
    first.focus();
  } else {
    container.focus();
  }
}

export function useFocusTrap({
  active,
  onEscape,
  initialFocusRef,
}: UseFocusTrapOptions): UseFocusTrapResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 回调与焦点目标经 ref 转发：避免 options 身份变化触发 effect 重挂导致焦点误还原
  const onEscapeRef = useRef(onEscape);
  const initialFocusTargetRef = useRef(initialFocusRef);

  useEffect(() => {
    onEscapeRef.current = onEscape;
    initialFocusTargetRef.current = initialFocusRef;
  }, [onEscape, initialFocusRef]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // false→true：记录打开前的活动元素，供关闭/卸载时还原
    const restoreTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      event.preventDefault();
      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        container.focus();
        return;
      }
      const current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const currentIndex = current ? focusables.indexOf(current) : -1;
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusables.length - 1
          : currentIndex - 1
        : currentIndex === -1 || currentIndex === focusables.length - 1
          ? 0
          : currentIndex + 1;
      focusables[nextIndex]?.focus();
    };

    container.addEventListener("keydown", handleKeyDown);
    focusInitialTarget(container, initialFocusTargetRef.current?.current ?? null);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      // true→false 或卸载：焦点还原到打开前元素
      if (restoreTarget?.isConnected) {
        restoreTarget.focus();
      }
    };
  }, [active]);

  return { containerRef };
}
