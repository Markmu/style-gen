"use client";

import type { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * plan-03（架构 ADR-6）: 模态弹层原语 —— focus trap / Escape / 焦点还原 /
 * 背景隔离 / 可选禁背景关闭。视觉沿用 `glass-panel` 遮罩与容器模式
 * （参照 `save-style-memory-dialog.tsx`；业务迁移由 plan-05/06/07 执行）。
 *
 * 确认导航约定（PRD 键盘旅程第 4 步，消费方执行）：确认类动作（删除、保存
 * 成功跳转等）触发 `router.push` 后，目标页面必须把初始焦点置于首要内容 ——
 * 在目标页面 `useEffect` 中聚焦页面主标题或首屏主容器（`tabIndex={-1}`），
 * 保证连续键盘旅程不断焦。
 */

export interface ModalDialogProps {
  open: boolean;
  /** Escape / 图标关闭按钮 /（非 destructive 且未关闭遮罩点击时）背景点击 */
  onClose: () => void;
  /** aria-label（与 labelledBy 二选一；同时提供时以 labelledBy 为准） */
  label: string;
  labelledBy?: string;
  /** true 时强制禁用背景点击关闭（删除确认等不可误触场景） */
  destructive?: boolean;
  /** 打开时聚焦目标；缺省聚焦容器首个可聚焦元素，不可见时回退容器本身 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 缺省 true；destructive 强制 false */
  closeOnOverlayClick?: boolean;
  /**
   * plan-06: 容器 data-testid。向导类弹层需要把 testid 挂在 focus-trap
   * 容器本身（弹层内 Tab 循环 / 焦点断言以该元素为界），缺省不添加。
   */
  testId?: string;
  children: ReactNode;
}

export function ModalDialog({
  open,
  onClose,
  label,
  labelledBy,
  destructive = false,
  initialFocusRef,
  closeOnOverlayClick = true,
  testId,
  children,
}: ModalDialogProps) {
  const { containerRef } = useFocusTrap({
    active: open,
    onEscape: onClose,
    initialFocusRef,
  });

  if (!open) {
    return null;
  }

  // destructive 强制禁用遮罩关闭：即使消费方显式传 closeOnOverlayClick 也不生效
  const overlayClosable = closeOnOverlayClick && !destructive;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md sm:p-6"
      onClick={overlayClosable ? onClose : undefined}
    >
      <div
        ref={containerRef}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="glass-panel relative flex max-h-[calc(100dvh-2.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-ambient)]"
      >
        {/* 图标关闭按钮：可理解 aria-label 必填，命中面积 >=44x44px（min-h/min-w-11） */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <AppIcon icon={X} size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
