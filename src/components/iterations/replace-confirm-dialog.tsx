"use client";

import { useEffect } from "react";

/**
 * plan-04（架构 §6.3 步骤 3）：替换确认对话框。
 *
 * 守卫返回 `confirm`（工作台存在不同的未完成内容）时弹出：
 * - 说明"继续后工作区将切换到所选 Iteration；当前内容不会作为新 Iteration 保存"；
 * - 两个摘要槽：当前方向 `{当前提示摘要}` / 将切换为 `{所选提示摘要}`；
 * - 取消 → 关闭对话框，详情与工作台零变更；继续切换 → 由宿主应用载荷并导航。
 *
 * 摘要文本按纯文本渲染（架构 §8.3），完整展示两侧提示（不截断）。
 */

export interface ReplaceConfirmDialogProps {
  open: boolean;
  /** 当前工作台未完成内容的提示摘要（纯文本） */
  currentPrompt: string;
  /** 目标 Iteration 的提示摘要（纯文本） */
  targetPrompt: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReplaceConfirmDialog({
  open,
  currentPrompt,
  targetPrompt,
  onCancel,
  onConfirm,
}: ReplaceConfirmDialogProps) {
  // Escape 视为取消（键盘可达性；与关闭按钮同语义）
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md sm:p-6">
      <div
        data-testid="replace-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Replace workspace content"
        className="glass-panel flex w-full max-w-lg flex-col gap-5 rounded-2xl p-6 shadow-[var(--shadow-ambient)] sm:p-7"
      >
        <div>
          <p className="label-tech text-[var(--text-muted)]">
            Continue this direction
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
            Replace the workspace with this iteration?
          </h2>
        </div>

        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          Continuing switches the workspace to the selected iteration. Your
          current content will not be saved as a new iteration.
        </p>

        <div className="grid gap-2.5">
          <div
            data-summary-side="current"
            className="rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)] p-3.5 shadow-2xs"
          >
            <p className="label-tech text-[0.625rem] text-[var(--text-muted)]">
              Current direction
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-secondary)]">
              {currentPrompt.trim() || "(no prompt yet)"}
            </p>
          </div>
          <div
            data-summary-side="target"
            className="rounded-xl border border-[var(--accent-primary)]/35 bg-[var(--surface-floating)] p-3.5 shadow-xs"
          >
            <p className="label-tech text-[0.625rem] text-[var(--accent-primary)]">
              Switching to
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-primary)]">
              {targetPrompt.trim()}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary rounded-lg px-4 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold tracking-wide"
          >
            Switch and continue
          </button>
        </div>
      </div>
    </div>
  );
}
