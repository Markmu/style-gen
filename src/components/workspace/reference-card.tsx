"use client";

import Image from "next/image";
import type {
  DegradationState,
  WorkspaceError,
  WorkspaceState,
} from "@/hooks/use-workspace-state";
import { UploadZone } from "@/components/workspace/upload-zone";
import { extractAnalysisSummary } from "@/lib/analysis-summary";
import type { VisualRecipe } from "@/types/models";

interface ReferenceCardProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  recipe?: VisualRecipe | null;
  error?: WorkspaceError | null;
  degradation?: DegradationState;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
  onRetry?: () => void;
}

export function ReferenceCard({
  state,
  referenceImageUrl,
  isUploading,
  uploadProgress,
  recipe = null,
  error = null,
  degradation,
  onFileSelected,
  onReplace,
  onRetry,
}: ReferenceCardProps) {
  const uploading = isUploading || state === "uploading";
  const hasReference = !!referenceImageUrl && !uploading;
  const isAnalyzing = state === "analyzing";
  const analysisError = error && error.stage !== "generation" ? error : null;
  const summary = extractAnalysisSummary(recipe);

  return (
    <article
      data-testid="reference-card"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Reference
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Source image
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Reference help"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          >
            <span className="icon text-[18px]" aria-hidden="true">
              help
            </span>
          </button>
          {hasReference && (
            <button
              type="button"
              onClick={onReplace}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            >
              Replace Reference
            </button>
          )}
          {hasReference && (
            <button
              type="button"
              aria-label="Reference options"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            >
              <span className="icon text-[18px]" aria-hidden="true">
                more_horiz
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {hasReference ? (
          <div className="space-y-4">
            <div className="media-lens relative aspect-[4/3] min-h-[260px] overflow-hidden rounded-lg ring-1 ring-[var(--border-static)]">
              <Image
                src={referenceImageUrl}
                alt="Reference"
                fill
                className="object-contain"
                unoptimized
              />
            </div>

            {isAnalyzing && (
              <div
                aria-label="Reference analysis loading"
                className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-info)] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-info)]" />
                  </span>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Analyzing visual structure
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-bright)]">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--accent-primary-soft)]" />
                </div>
                {degradation?.analysisQueueing && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Analysis is queued. The workspace remains ready while we wait.
                  </p>
                )}
              </div>
            )}

            {analysisError && (
              <div className="rounded-lg bg-[var(--color-error-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--color-error)]">
                  Analysis failed
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-error)]">
                  {analysisError.message}
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="btn-secondary mt-3 rounded-md px-3 py-1.5 text-xs"
                  >
                    Retry analysis
                  </button>
                )}
              </div>
            )}

            {summary.length > 0 && (
              <div className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="label-tech text-[var(--text-muted)]">
                    Analysis Match
                  </p>
                  <a
                    href="#visual-recipe"
                    className="text-xs font-medium text-[var(--accent-primary)] hover:text-[var(--accent-primary-dim)]"
                  >
                    View full analysis
                  </a>
                </div>
                <div className="space-y-3">
                  {summary.map((item) => (
                    <div key={item.dimension} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="icon text-[17px]"
                          style={{ color: item.iconColor }}
                          aria-hidden="true"
                        >
                          {item.iconName}
                        </span>
                        <p className="min-w-[5.5rem] text-xs font-semibold text-[var(--text-primary)]">
                          {item.label}
                        </p>
                        <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                          {item.value}
                        </p>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {item.percentage}%
                        </p>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-bright)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent-primary)]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div data-testid="reference-upload-panel" className="min-h-0 flex-1">
              <UploadZone
                referenceImageUrl={null}
                isUploading={uploading}
                uploadProgress={uploadProgress}
                onFileSelected={onFileSelected}
                onReplace={onReplace}
              />
            </div>
            {analysisError && (
              <div className="rounded-lg bg-[var(--color-error-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--color-error)]">
                  Upload failed
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-error)]">
                  {analysisError.message}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
