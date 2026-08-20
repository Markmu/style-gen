"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Camera,
  Copy,
  Ellipsis,
  FileCode,
  ImageOff,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { TemplateListItem } from "@/hooks/use-template-search";
import { deriveStyleMemoryCardViewModel } from "@/lib/style-memory-view-model";

interface TemplateCardProps {
  template: TemplateListItem;
  onUse: (id: string) => void | Promise<void>;
  onEdit?: (id: string) => void | Promise<void>;
  onDuplicate?: (id: string) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  /** plan-05: `/workspace/templates?focus=<id>` 定位命中时的高亮态 */
  focused?: boolean;
}

export function TemplateCard({
  template,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  focused = false,
}: TemplateCardProps) {
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const memory = deriveStyleMemoryCardViewModel(template);
  const sourceLabel = memory.sourceImageUrl ? "Source-backed" : "Prompt-only";
  const visibleTags = memory.styleTags
    .filter((tag) => tag !== sourceLabel)
    .slice(0, 3);
  const remainingTagCount = Math.max(0, memory.styleTags.length - 1 - visibleTags.length);

  const handleUse = useCallback(() => {
    void onUse(memory.id);
  }, [memory.id, onUse]);

  const handleDuplicate = useCallback(async () => {
    if (!onDuplicate) return;
    setDuplicating(true);
    try {
      await onDuplicate(memory.id);
      setActionMenuId(null);
    } finally {
      setDuplicating(false);
    }
  }, [memory.id, onDuplicate]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(memory.id);
      setDeleteTarget(false);
      setActionMenuId(null);
    } finally {
      setDeleting(false);
    }
  }, [memory.id, onDelete]);

  // Keyboard shortcut listener to close action menu on Escape
  useEffect(() => {
    if (!actionMenuId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActionMenuId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionMenuId]);

  // Keyboard listener for delete dialog
  useEffect(() => {
    if (!deleteTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDeleteTarget(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget]);

  return (
    <>
      <article
        data-testid="style-memory-card"
        data-has-source-image={memory.sourceImageUrl ? "true" : "false"}
        data-focused={focused ? "true" : undefined}
        className={`style-memory-card group relative flex min-h-[25rem] flex-col rounded-2xl border transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none ${
          focused
            ? "ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--surface-page)] border-[var(--accent-primary)] shadow-md"
            : "hover:border-[var(--border-interactive)]"
        }`}
      >
        {/* Top-Right Action Menu */}
        <div className="absolute right-3 top-3 z-20">
          <button
            type="button"
            onClick={() =>
              setActionMenuId(actionMenuId === memory.id ? null : memory.id)
            }
            className="interactive-lift flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-floating)]/95 text-[var(--text-secondary)] shadow-sm backdrop-blur-md transition-all hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95"
            aria-label="More actions"
            aria-expanded={actionMenuId === memory.id}
            aria-haspopup="menu"
          >
            <AppIcon icon={Ellipsis} size={16} />
          </button>

          {actionMenuId === memory.id && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setActionMenuId(null)}
              />
              <div className="absolute right-0 top-full z-20 mt-1.5 w-44 rounded-xl border border-[var(--border-static)] bg-[var(--surface-floating)]/95 p-1.5 shadow-[var(--shadow-ambient)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(memory.id);
                      setActionMenuId(null);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <AppIcon icon={Pencil} size={14} className="text-[var(--text-secondary)]" />
                    Edit
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={duplicating}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AppIcon icon={Copy} size={14} className="text-[var(--text-secondary)]" />
                    {duplicating
                      ? "Duplicating..."
                      : memory.actions.duplicateLabel}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(true);
                      setActionMenuId(null);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-soft)]"
                  >
                    <AppIcon icon={Trash2} size={14} />
                    {memory.actions.deleteLabel}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Media Lens Container */}
        <div className="style-memory-source media-lens relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-[var(--surface-media)]">
          {memory.sourceImageUrl ? (
            <>
              <Image
                src={memory.sourceImageUrl}
                alt={memory.sourceAlt}
                fill
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                unoptimized
              />
              {/* Subtle gradient scrim at bottom for text contrast */}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 via-black/10 to-transparent pointer-events-none" />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center bg-gradient-to-b from-[var(--surface-control)]/40 to-[var(--surface-low)]/80">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-static)]/60 bg-[var(--surface-panel)]/80 shadow-sm backdrop-blur-sm">
                <AppIcon icon={ImageOff} size={22} className="text-[var(--text-muted)]" />
              </div>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                No source preview
              </span>
              <p className="max-w-[14rem] text-xs leading-relaxed text-[var(--text-secondary)]">
                Prompt structure remains reusable.
              </p>
            </div>
          )}

          {/* Floating Icon Badges */}
          <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 z-10">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-floating)]/90 text-[var(--text-primary)] shadow-sm backdrop-blur-md border border-[var(--border-static)]/60"
              title={sourceLabel}
              aria-hidden="true"
            >
              {memory.sourceImageUrl ? (
                <AppIcon icon={Camera} size={12} className="text-[var(--accent-primary)]" />
              ) : (
                <AppIcon icon={FileCode} size={12} className="text-[var(--text-muted)]" />
              )}
            </span>
            {memory.variableCount > 0 && (
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-floating)]/90 text-[var(--accent-primary)] shadow-sm backdrop-blur-md border border-[var(--border-static)]/60"
                title={memory.variableLabel}
                aria-hidden="true"
              >
                <AppIcon icon={Sparkles} size={12} />
              </span>
            )}
          </div>
        </div>

        {/* Card Content */}
        <div className="flex flex-1 flex-col justify-between gap-3.5 p-4.5">
          {/* Title and Metadata */}
          <div className="space-y-1">
            <h3 className="line-clamp-1 text-base font-semibold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-primary)]">
              {memory.name}
            </h3>
            <p className="text-xs text-[var(--text-muted)] font-mono flex items-center gap-1.5">
              <span>{sourceLabel}</span>
              <span aria-hidden="true" className="opacity-40">/</span>
              <span>{memory.variableLabel}</span>
            </p>
          </div>

          {/* Style Tags */}
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Style tags
            </p>
            <div className="mt-1.5 flex min-h-6 flex-wrap gap-1.5">
              {visibleTags.map((tag) => (
                <span
                  className="rounded-full border border-[var(--border-static)]/50 bg-[var(--style-memory-chip-bg)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[var(--style-memory-chip-text)] transition-all hover:border-[var(--accent-primary)]/40 hover:bg-[var(--surface-hover)]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
              {remainingTagCount > 0 && (
                <span
                  className="rounded-full border border-[var(--border-static)]/40 bg-[var(--surface-low)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--text-muted)]"
                  aria-label={`${remainingTagCount} more style tags`}
                >
                  +{remainingTagCount}
                </span>
              )}
            </div>
          </div>

          {/* Reuse Intent Panel */}
          <div className="rounded-xl border border-[var(--border-static)]/60 bg-[var(--surface-control)]/50 p-2.5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--style-memory-intent-text)]">
              Reuse intent
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              {memory.reuseIntent}
            </p>
          </div>

          {/* Action Dock */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleUse}
              className="btn-primary inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              <span>{memory.actions.useLabel}</span>
              <AppIcon icon={ArrowUpRight} size={14} />
            </button>
          </div>
        </div>
      </article>

      {/* Delete Confirmation Alert Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="surface-panel w-full max-w-sm rounded-2xl border border-[var(--border-static)] p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm Delete"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-error-soft)] text-[var(--color-error)]">
              <AppIcon icon={Trash2} size={20} />
            </div>
            <h2 className="mt-3 text-base font-semibold text-[var(--text-primary)]">
              Delete this Style Memory?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              &ldquo;{memory.name}&rdquo; will be removed permanently. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(false)}
                className="btn-secondary rounded-xl px-3.5 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-xl bg-[var(--color-error)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting..." : memory.actions.deleteLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

