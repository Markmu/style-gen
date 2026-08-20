"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { TemplateVariable } from "@/types/models";

/**
 * plan-05: 从成功迭代保存为 Style Memory 的对话框（架构 §6.4 步骤 2、§7.3）。
 *
 * - 预填：`content = promptSnapshot`（可编辑）、变量 = 该次迭代固化的变量
 *   （预填展示，随提交体原样携带）；提交携带 `sourceAssetId` /
 *   `sourceGenerationTaskId`（frontend_computed），不复制结果图资产。
 * - 名称必填且 ≤ 50 字符（与 POST /api/templates 既有契约一致）：空名禁止提交。
 * - 失败呈现沿用既有口径：409 同名冲突展示服务端文案，名称与已填内容保留，
 *   可修改后重试；详情已展示内容不受影响。
 */

const MAX_NAME_LENGTH = 50;
const MAX_CONTENT_LENGTH = 10_000;

/** 保存成功回调载荷（详情局部切换已保存态所需的最小字段） */
export interface SavedStyleMemory {
  id: string;
  name: string;
}

interface SaveStyleMemoryDialogProps {
  open: boolean;
  /** 预填内容：来源迭代的 promptSnapshot */
  initialContent: string;
  /** 预填变量：来源迭代固化的变量（含默认值），随提交体原样携带 */
  initialVariables: TemplateVariable[];
  /** 来源资产 id（详情 sourceAssetId，入口条件已保证非空） */
  sourceAssetId: string;
  /** 来源迭代 id（frontend_computed，ADR-5 反向关联） */
  sourceGenerationTaskId: string;
  /** 保存成功：携带 201 响应的 { id, name }，由宿主局部切换已保存态 */
  onSaved: (template: SavedStyleMemory) => void;
  onClose: () => void;
}

export function SaveStyleMemoryDialog({
  open,
  initialContent,
  initialVariables,
  sourceAssetId,
  sourceGenerationTaskId,
  onSaved,
  onClose,
}: SaveStyleMemoryDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时重置为预填状态（每次进入保存流程都以该次迭代快照为起点）
  useEffect(() => {
    if (open) {
      setName("");
      setContent(initialContent);
      setError(null);
      setIsSaving(false);
    }
  }, [open, initialContent]);

  const isNameEmpty = name.trim().length === 0;

  // Escape 视为取消（键盘可达性；与 Cancel/Close 同语义）
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = async () => {
    if (isNameEmpty || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          content,
          variables: initialVariables,
          sourceAssetId,
          sourceGenerationTaskId,
        }),
      });

      if (res.status === 201) {
        const template = (await res.json()) as SavedStyleMemory;
        onSaved({ id: template.id, name: template.name || name.trim() });
        return;
      }

      // 409 同名冲突沿用既有文案；其余失败同样保留已填内容供重试
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        data.error ??
          "Save failed. Your entries are preserved, adjust the name and try again.",
      );
    } catch {
      setError(
        "Network error. Your entries are preserved, check the connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md sm:p-6"
      onClick={onClose}
    >
      <div
        data-testid="save-style-memory-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Save as Style Memory"
        className="glass-panel flex max-h-[calc(100dvh-2.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-ambient)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border-static)] bg-[var(--surface-panel)] px-6 py-5">
          <div>
            <p className="label-tech text-[var(--text-muted)]">Save direction</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
              Save as Style Memory
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <AppIcon icon={X} size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            This memory starts from this iteration: its prompt, variables, and
            source reference are prefilled. The generated result itself is not
            copied.
          </p>

          <div className="space-y-1.5">
            <label
              htmlFor="style-memory-name"
              className="label-tech text-[0.6875rem] text-[var(--text-secondary)]"
            >
              Name
            </label>
            <input
              id="style-memory-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="Example: Neon dusk direction"
              maxLength={MAX_NAME_LENGTH}
              required
              className="input-precision w-full rounded-lg px-3.5 py-2.5 text-sm"
            />
            <div className="flex items-center justify-between text-xs">
              {isNameEmpty ? (
                <p className="text-xs text-[var(--color-error)]">
                  A name is required before saving.
                </p>
              ) : (
                <span />
              )}
              <p className="text-right text-[0.6875rem] font-mono text-[var(--text-muted)]">
                {name.length}/{MAX_NAME_LENGTH}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="style-memory-content"
              className="label-tech text-[0.6875rem] text-[var(--text-secondary)]"
            >
              Prompt content
            </label>
            <textarea
              id="style-memory-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={6}
              maxLength={MAX_CONTENT_LENGTH}
              className="input-precision min-h-[10rem] w-full resize-y rounded-lg px-3.5 py-3 text-sm leading-6"
            />
            <p className="text-right font-mono text-[0.6875rem] text-[var(--text-muted)]">
              {content.length} / {MAX_CONTENT_LENGTH.toLocaleString()}
            </p>
          </div>

          {initialVariables.length > 0 && (
            <div className="space-y-2.5 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/50 p-4">
              <div>
                <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                  Variables from this iteration ({initialVariables.length})
                </h3>
                <p className="mt-0.5 text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
                  Prefilled defaults are submitted with this memory as frozen
                  from the iteration.
                </p>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {initialVariables.map((variable) => (
                  <div
                    key={variable.name}
                    className="rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] p-2.5 shadow-2xs"
                  >
                    <dt className="label-tech text-[0.625rem] text-[var(--text-muted)]">
                      {variable.label || variable.name}
                    </dt>
                    <dd className="mt-1 break-words font-mono text-[0.6875rem] font-medium leading-5 text-[var(--text-primary)]">
                      {variable.defaultValue}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs text-[var(--color-error)]"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[var(--border-static)] bg-[var(--surface-panel)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="btn-secondary rounded-lg px-4 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving || isNameEmpty}
            className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold tracking-wide"
          >
            {isSaving ? "Saving…" : "Save Style Memory"}
          </button>
        </div>
      </div>
    </div>
  );
}
