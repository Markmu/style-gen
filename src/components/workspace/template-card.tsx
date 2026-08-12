"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Copy,
  Ellipsis,
  ImageOff,
  Pencil,
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
}

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

  return (
    <>
      <article
        data-testid="style-memory-card"
        data-has-source-image={memory.sourceImageUrl ? "true" : "false"}
        className="style-memory-card group relative flex min-h-[24rem] flex-col transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none"
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={() =>
              setActionMenuId(actionMenuId === memory.id ? null : memory.id)
            }
            className="interactive-lift flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface-bright)]/90 text-[var(--text-secondary)] shadow-[var(--shadow-ambient)] backdrop-blur-sm hover:text-[var(--text-primary)]"
            aria-label="More actions"
            aria-expanded={actionMenuId === memory.id}
            aria-haspopup="menu"
          >
            <AppIcon icon={Ellipsis} size={16} />
          </button>

          {actionMenuId === memory.id && (
            <>
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setActionMenuId(null)}
              />
              <div className="absolute right-0 top-full z-20 mt-1.5 w-40 rounded-lg bg-[var(--surface-bright)] py-1.5 shadow-[var(--shadow-ambient)] ring-1 ring-[var(--border-static)]">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(memory.id);
                      setActionMenuId(null);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-mid)]"
                  >
                    <AppIcon icon={Pencil} size={14} />
                    Edit
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={duplicating}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-mid)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AppIcon icon={Copy} size={14} />
                    {duplicating
                      ? "Duplicating..."
                      : memory.actions.duplicateLabel}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(true)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-soft)]"
                  >
                    <AppIcon icon={Trash2} size={14} />
                    {memory.actions.deleteLabel}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="style-memory-source media-lens relative aspect-[16/10] w-full overflow-hidden">
          {memory.sourceImageUrl ? (
            <Image
              src={memory.sourceImageUrl}
              alt={memory.sourceAlt}
              fill
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <AppIcon icon={ImageOff} size={32} className="text-[var(--text-secondary)]/35" />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                No source preview
              </span>
              <p className="max-w-40 text-xs leading-5 text-[var(--text-muted)]">
                Prompt structure remains reusable.
              </p>
            </div>
          )}

        </div>

        <div className="flex flex-1 flex-col gap-3.5 p-4">
          <div className="pr-1">
            <h3 className="line-clamp-2 text-base font-semibold leading-6 text-[var(--text-primary)]">
              {memory.name}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              <span>{sourceLabel}</span>
              <span aria-hidden="true"> / </span>
              <span>{memory.variableLabel}</span>
            </p>
          </div>

          <div>
            <p className="text-[0.6875rem] font-semibold text-[var(--text-muted)]">
              Style tags
            </p>
            <div className="mt-2 flex min-h-6 flex-wrap gap-1.5">
              {visibleTags.map((tag) => (
                <span
                  className="rounded-full bg-[var(--style-memory-chip-bg)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--style-memory-chip-text)]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
              {remainingTagCount > 0 && (
                <span
                  className="rounded-full bg-[var(--surface-low)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--text-muted)]"
                  aria-label={`${remainingTagCount} more style tags`}
                >
                  +{remainingTagCount}
                </span>
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="min-w-0 max-w-[16rem]">
              <p className="text-[0.6875rem] font-semibold text-[var(--style-memory-intent-text)]">
                Reuse intent
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                {memory.reuseIntent}
              </p>
            </div>
            <button
              type="button"
              onClick={handleUse}
              className="btn-primary inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-stretch whitespace-nowrap rounded-md px-3 text-xs font-semibold sm:self-auto"
            >
              {memory.actions.useLabel}
              <AppIcon icon={ArrowUpRight} size={14} />
            </button>
          </div>
        </div>
      </article>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(20%_0.025_263/0.46)] px-4 backdrop-blur-sm">
          <div
            className="surface-panel w-full max-w-sm rounded-xl p-5 shadow-[var(--shadow-ambient)]"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm Delete"
          >
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Delete this Style Memory?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              &ldquo;{memory.name}&rdquo; will be removed permanently. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(false)}
                className="btn-secondary rounded-md px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-soft)] disabled:cursor-not-allowed disabled:opacity-50"
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
