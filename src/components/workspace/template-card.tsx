"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
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
        className="style-memory-card group relative flex min-h-[28rem] flex-col transition-transform duration-150 hover:-translate-y-0.5"
      >
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={() =>
              setActionMenuId(actionMenuId === memory.id ? null : memory.id)
            }
            className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface-bright)]/85 text-[var(--text-secondary)] opacity-0 shadow-[var(--shadow-ambient)] backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)] focus:opacity-100"
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
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>

          {actionMenuId === memory.id && (
            <>
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setActionMenuId(null)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg bg-[var(--surface-bright)] py-1 shadow-[var(--shadow-ambient)] ring-1 ring-[var(--border-static)]">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(memory.id);
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
                    {duplicating
                      ? "Duplicating..."
                      : memory.actions.duplicateLabel}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(true)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-red-500/10"
                  >
                    {memory.actions.deleteLabel}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="style-memory-source media-lens relative aspect-[4/3] w-full overflow-hidden">
          {memory.sourceImageUrl ? (
            <Image
              src={memory.sourceImageUrl}
              alt={memory.sourceAlt}
              fill
              className="object-cover transition-transform duration-150 group-hover:scale-[1.02]"
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="material-symbols-outlined text-4xl text-[var(--text-secondary)]/35">
                image_not_supported
              </span>
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                No source preview
              </span>
              <p className="max-w-40 text-xs leading-5 text-[var(--text-muted)]">
                Prompt structure remains reusable.
              </p>
            </div>
          )}

          <div className="absolute inset-0 flex items-end justify-center bg-[rgba(25,28,30,0)] p-4 pb-6 transition-colors group-hover:bg-[rgba(25,28,30,0.32)]">
            <button
              type="button"
              onClick={handleUse}
              className="btn-primary translate-y-2 rounded-md px-5 py-2 text-sm font-medium opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100"
            >
              {memory.actions.useLabel}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              Style Memory
            </p>
            <h3 className="mt-1 line-clamp-2 text-base font-semibold text-[var(--text-primary)]">
              {memory.name}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--style-memory-chip-bg)] px-2.5 py-1 text-xs font-medium text-[var(--style-memory-chip-text)]">
              {memory.variableLabel}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--text-muted)]">
              Style tags
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {memory.styleTags.map((tag) => (
                <span
                  className="rounded-full bg-[var(--style-memory-chip-bg)] px-2.5 py-1 text-xs font-medium text-[var(--style-memory-chip-text)]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-auto rounded-lg bg-[var(--style-memory-intent-bg)] px-3 py-2">
            <p className="text-xs font-semibold text-[var(--style-memory-intent-text)]">
              Reuse intent
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {memory.reuseIntent}
            </p>
          </div>
        </div>
      </article>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="surface-panel w-full max-w-sm rounded-xl p-5 shadow-xl"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm Delete"
          >
            <p className="mb-4 text-sm text-[var(--text-primary)]">
              Delete style memory &ldquo;{memory.name}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
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
                className="rounded-md px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
