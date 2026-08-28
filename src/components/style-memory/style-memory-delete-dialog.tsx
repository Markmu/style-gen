"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type { StyleMemoryDetail } from "@/types/models";

/**
 * plan-05（架构 §6.4 / ADR-2 引用不复制）：删除确认层（destructive ModalDialog）。
 *
 * - 文案说明删除对象（Memory 名称）与保留（What stays）的关联内容：来源参考图、来源
 *   Iteration、代表结果和历史生成记录（PRD 删除线框）。
 * - destructive：背景点击不关闭；取消关闭并还原焦点。
 * - 确认 → DELETE /api/templates/[id] → 204 后失效列表缓存并导航回列表
 *   （恢复原查询条件），列表页挂载后初始焦点落在页面首要内容（plan-03 确认
 *   导航约定）。
 * - 失败（503 等）保留弹层可重试，不重复导航。
 */

/** 治理写点成功后失效 Style Memory 列表缓存（全局 staleTime 60s，见 providers） */
export const STYLE_MEMORY_LIST_QUERY_KEY = ["templates"] as const;

export function invalidateStyleMemoryLists(queryClient: {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => Promise<void>;
}): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: STYLE_MEMORY_LIST_QUERY_KEY });
}

export interface StyleMemoryDeleteDialogProps {
  detail: StyleMemoryDetail;
  open: boolean;
  onClose: () => void;
  /** 删除确认后的列表导航地址（含恢复的原查询条件） */
  listHref: string;
}

export function StyleMemoryDeleteDialog({
  detail,
  open,
  onClose,
  listHref,
}: StyleMemoryDeleteDialogProps) {
  const titleId = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDeleting(false);
    setError(null);
  }, [open, detail.id]);

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${detail.id}`, { method: "DELETE" });
      if (!res.ok) {
        let body: { error?: string } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          // 保留默认错误信息
        }
        setError(body.error ?? "Delete failed. Please try again later.");
        setDeleting(false);
        return;
      }
      // 先失效列表缓存（60s staleTime 下回列表不能展示已删除项），再回列表恢复原查询
      await invalidateStyleMemoryLists(queryClient);
      router.push(listHref);
    } catch {
      setError("Network error — delete failed. You can retry.");
      setDeleting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={deleting ? () => undefined : onClose}
      label="Delete Style Memory"
      labelledBy={titleId}
      destructive
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border-static)] px-5 py-4 pr-16">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]"
          >
            <AppIcon
              icon={AlertTriangle}
              size={16}
              className="text-[var(--color-error)]"
            />
            Delete Style Memory
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm leading-6 text-[var(--text-primary)]">
            This will delete &quot;<span className="font-semibold">{detail.name}</span>
            &quot;. It will no longer appear in the list and can no longer be
            reused.
          </p>
          <p className="mt-3 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/60 px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
            What stays: the source reference, source iteration, representative
            result, and generation history. They belong to your own assets and
            generation history and are not affected by deleting this memory.
          </p>
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--color-error)]"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-static)] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="btn-secondary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={deleting}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-error)]/50 bg-[var(--color-error)] px-4 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
