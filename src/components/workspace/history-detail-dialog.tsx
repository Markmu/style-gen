"use client";

import Image from "next/image";
import type { GenerationParams, TemplateVariable, VisualRecipe } from "@/types/models";

export interface HistoryDetail {
  id: string;
  resultFileUrl: string;
  recipe: VisualRecipe | null;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  analysisTaskId: string;
  sourceAssetId?: string | null;
  sourceImageUrl?: string | null;
  variables?: TemplateVariable[];
}

interface HistoryDetailDialogProps {
  open: boolean;
  detail: HistoryDetail | null;
  onRestore: (id: string) => void;
  onContinueEditing?: (detail: HistoryDetail) => void;
  onSaveStyleMemory?: (detail: HistoryDetail) => void;
  onClose: () => void;
  restoreError?: string | null;
}

export function HistoryDetailDialog({
  open,
  detail,
  onRestore,
  onContinueEditing,
  onSaveStyleMemory,
  onClose,
  restoreError,
}: HistoryDetailDialogProps) {
  if (!open || !detail) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,28,30,0.24)] p-6 backdrop-blur-sm">
      <div
        data-testid="history-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="History Detail"
        className="glass-panel grid max-h-[86vh] w-full max-w-5xl gap-5 overflow-y-auto rounded-xl p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.82fr)]"
      >
        <div className="min-w-0">
          <p className="label-tech text-[var(--text-muted)]">History Result</p>
          <div className="media-lens relative mt-4 aspect-square max-h-[62vh] rounded-lg">
            <Image
              src={detail.resultFileUrl}
              alt="History result"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-tech text-[var(--text-muted)]">Snapshot</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                Generation Detail
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary rounded-md px-3 py-1.5 text-sm"
              aria-label="Close history detail"
            >
              Close
            </button>
          </div>

          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto">
            <section className="rounded-lg bg-[var(--surface-low)] p-4">
              <p className="label-tech text-[var(--text-muted)]">Prompt</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">
                {detail.promptSnapshot}
              </p>
            </section>

            {detail.negativePromptSnapshot && (
              <section className="rounded-lg bg-[var(--surface-low)] p-4">
                <p className="label-tech text-[var(--text-muted)]">Negative</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                  {detail.negativePromptSnapshot}
                </p>
              </section>
            )}

            <section className="rounded-lg bg-[var(--surface-low)] p-4">
              <p className="label-tech text-[var(--text-muted)]">Parameters</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Aspect ratio</dt>
                  <dd className="mt-1 font-medium text-[var(--text-primary)]">
                    {detail.params.aspectRatio}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Quality</dt>
                  <dd className="mt-1 font-medium text-[var(--text-primary)]">
                    {detail.params.quality}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--text-muted)]">Analysis task</dt>
                  <dd className="mt-1 break-all font-medium text-[var(--text-primary)]">
                    {detail.analysisTaskId}
                  </dd>
                </div>
              </dl>
            </section>

            {restoreError && (
              <p className="rounded-lg bg-[var(--color-error-soft)] px-3 py-2 text-sm text-[var(--color-error)]">
                Restore failed. The current workspace context is still preserved. {restoreError}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary rounded-lg px-4 py-2 text-sm"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onSaveStyleMemory?.(detail)}
              className="btn-secondary rounded-lg px-4 py-2 text-sm"
            >
              Save as Style Memory
            </button>
            <button
              type="button"
              onClick={() => onContinueEditing?.(detail)}
              className="btn-secondary rounded-lg px-4 py-2 text-sm"
            >
              Generate variation
            </button>
            <button
              type="button"
              onClick={() => onRestore(detail.id)}
              className="btn-primary rounded-lg px-4 py-2 text-sm"
            >
              Restore to workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
