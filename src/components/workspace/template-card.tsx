"use client";

import { useState, useCallback } from "react";
import type { TemplateListItem } from "@/hooks/use-template-search";

interface TemplateCardProps {
  template: TemplateListItem;
  onUse: (id: string) => void;
  onEdit?: (id: string) => void | Promise<void>;
  onDuplicate?: (id: string) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}

/**
 * 模板卡片组件
 * - 固定Aspect Ratio（约 3:4），CSS Grid 自适应
 * - Reveals the "Use Template" button on hover
 * - 右上角 overflow menu（Edit / Duplicate / Delete）
 */
export function TemplateCard({
  template,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
}: TemplateCardProps) {
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleUse = useCallback(() => {
    onUse(template.id);
  }, [onUse, template.id]);

  const handleDuplicate = useCallback(async () => {
    if (!onDuplicate) return;
    setDuplicating(true);
    try {
      await onDuplicate(template.id);
      setActionMenuId(null);
    } finally {
      setDuplicating(false);
    }
  }, [onDuplicate, template.id]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(template.id);
      setDeleteTarget(false);
      setActionMenuId(null);
    } finally {
      setDeleting(false);
    }
  }, [onDelete, template.id]);

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-xl bg-[var(--surface-mid)] ring-1 ring-[var(--border)] transition-shadow hover:shadow-lg">
        {/* Overflow menu — 右上角 */}
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={() =>
              setActionMenuId(actionMenuId === template.id ? null : template.id)
            }
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-base)]/80 text-[var(--text-secondary)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            aria-label="More actions"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>

          {/* Action dropdown */}
          {actionMenuId === template.id && (
            <>
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setActionMenuId(null)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-lg bg-[var(--surface-bright)] py-1 ring-1 ring-[var(--border)] shadow-lg">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(template.id);
                      setActionMenuId(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-mid)]"
                  >
                    Edit
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={duplicating}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-mid)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {duplicating ? "Duplicating..." : "Duplicate"}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* 预览区域（占位图） */}
        <div className="relative aspect-[3/4] w-full bg-[var(--surface-base)]">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-4xl text-[var(--text-secondary)]/30">
              description
            </span>
            <span className="text-xs text-[var(--text-secondary)]/40">
              No preview
            </span>
          </div>

          {/* Hover overlay + Use Template button */}
          <div className="absolute inset-0 flex items-end justify-center bg-black/0 p-4 pb-6 transition-colors group-hover:bg-black/50">
            <button
              type="button"
              onClick={handleUse}
              className="translate-y-2 rounded-lg bg-white px-5 py-2 text-sm font-medium text-gray-900 opacity-0 shadow transition-all hover:bg-gray-100 group-hover:translate-y-0 group-hover:opacity-100"
            >
              Use Template
            </button>
          </div>
        </div>

        {/* 卡片信息区 */}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          {/* 名称（最多 2 行截断） */}
          <h3 className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
            {template.name}
          </h3>

          {/* 标签 chips：从 variableCount 推导 */}
          <div className="mt-auto flex flex-wrap gap-1">
            {template.variableCount > 0 && (
              <span className="inline-block rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                {template.variableCount} variables
              </span>
            )}
          </div>
        </div>
      </div>

      {/* DeleteConfirm dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-sm rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)] shadow-xl"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm Delete"
          >
            <p className="mb-4 text-sm text-[var(--text-primary)]">
              Delete template &ldquo;{template.name}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
