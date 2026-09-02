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
 *
 * plan-06（架构 §6.6 / 用例 TC-6.9、TC-6.10）复用同一确认骨架提供
 * `variant="new-reference"`（工作台「结果作为新参考」方向切换守卫）：
 * 不新增第二套弹层，仅替换标题/说明/摘要槽与按钮 testid——
 * - `new-reference-unfinished-summary` 说明将切换的未完成内容
 *   （Prompt / negative constraints / 生成参数 / 当前来源比较结果）；
 * - 取消零写入并还原焦点（宿主负责聚焦回触发器）；确认后由宿主仅提交
 *   `{sourceAssetId}` 创建新方向分析（ADR-6 复用 Asset）；
 * - 接受失败时经 `errorText` 展示稳定错误，原方向与草稿保持。
 */

export interface ReplaceConfirmDialogProps {
  open: boolean;
  /**
   * 确认场景：`iteration`（缺省，Iteration 列表替换确认）或
   * `new-reference`（plan-06 工作区结果作为新参考的方向切换守卫）。
   */
  variant?: "iteration" | "new-reference";
  /** 当前工作台未完成内容的提示摘要（纯文本） */
  currentPrompt: string;
  /** 目标 Iteration 的提示摘要（纯文本） */
  targetPrompt: string;
  /** new-reference：将切换的未完成内容说明清单（每条一行纯文本） */
  unfinishedSummary?: string[];
  /** new-reference：接受失败的稳定错误（原方向保留、可重试接受） */
  errorText?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReplaceConfirmDialog({
  open,
  variant = "iteration",
  currentPrompt,
  targetPrompt,
  unfinishedSummary,
  errorText,
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

  const isNewReference = variant === "new-reference";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md sm:p-6">
      <div
        data-testid={
          isNewReference ? "new-reference-confirm-dialog" : "replace-confirm-dialog"
        }
        role="dialog"
        aria-modal="true"
        aria-label={
          isNewReference ? "Use result as new reference" : "Replace workspace content"
        }
        className="glass-panel flex w-full max-w-lg flex-col gap-5 rounded-2xl p-6 shadow-[var(--shadow-ambient)] sm:p-7"
      >
        {isNewReference ? (
          <div>
            <p className="label-tech text-[var(--text-muted)]">New direction</p>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
              使用该结果作为新参考？
            </h2>
          </div>
        ) : (
          <div>
            <p className="label-tech text-[var(--text-muted)]">
              Continue this direction
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
              Replace the workspace with this iteration?
            </h2>
          </div>
        )}

        {isNewReference ? (
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            确认后工作区将以该结果的图片开启新方向分析（复用同一 Asset，不重复
            上传）；以下未完成内容将不带入新方向，原方向与全部 Iteration 仍可从
            Iteration Memory 回溯。
          </p>
        ) : (
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            Continuing switches the workspace to the selected iteration. Your
            current content will not be saved as a new iteration.
          </p>
        )}

        {isNewReference ? (
          <div
            data-testid="new-reference-unfinished-summary"
            className="rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)] p-3.5 shadow-2xs"
          >
            <p className="label-tech text-[0.625rem] text-[var(--text-muted)]">
              Will not carry over
            </p>
            <ul className="mt-1.5 space-y-1">
              {(unfinishedSummary ?? []).map((item) => (
                <li
                  key={item}
                  className="break-words text-xs leading-5 text-[var(--text-secondary)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : (
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
        )}

        {isNewReference && errorText ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--color-error)]"
          >
            {errorText}
          </p>
        ) : null}

        <div className="flex justify-end gap-2.5 pt-1">
          <button
            type="button"
            data-testid={
              isNewReference ? "new-reference-confirm-cancel" : undefined
            }
            onClick={onCancel}
            className="btn-secondary rounded-lg px-4 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid={
              isNewReference ? "new-reference-confirm-accept" : undefined
            }
            onClick={onConfirm}
            className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold tracking-wide"
          >
            {isNewReference ? "Use as new reference" : "Switch and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
