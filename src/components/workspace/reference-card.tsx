"use client";

import Image from "next/image";
import { Ellipsis, Info } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type {
  WorkspaceError,
  WorkspaceState,
} from "@/hooks/use-workspace-state";
import { UploadZone } from "@/components/workspace/upload-zone";

interface ReferenceCardProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  error?: WorkspaceError | null;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
  onRetry?: () => void;
  onAspectRatioChange?: (aspectRatio: number) => void;
}

export function ReferenceCard({
  state,
  referenceImageUrl,
  isUploading,
  uploadProgress,
  error = null,
  onFileSelected,
  onReplace,
  onRetry,
  onAspectRatioChange,
}: ReferenceCardProps) {
  const uploading = isUploading || state === "uploading";
  const hasReference = !!referenceImageUrl && !uploading;
  const analysisError = error && error.stage !== "generation" ? error : null;

  return (
    <article
      data-testid="reference-card"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Reference Canvas
            <AppIcon icon={Info} size={16} className="text-[var(--text-muted)]" />
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Source image
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasReference && (
            <button
              type="button"
              onClick={onReplace}
              className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Replace
            </button>
          )}
          {hasReference && (
            <button
              type="button"
              aria-label="Reference options"
              className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg"
            >
              <AppIcon icon={Ellipsis} />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {hasReference ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              data-testid="reference-image-stage"
              className="media-lens relative min-h-0 flex-1 overflow-hidden rounded-xl bg-[var(--surface-low)] ring-1 ring-inset ring-[var(--border-static)]"
            >
              <Image
                src={referenceImageUrl}
                alt="Reference"
                fill
                sizes="(min-width: 1280px) 33vw, (min-width: 768px) 42vw, 100vw"
                className="object-cover object-center"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    onAspectRatioChange?.(naturalWidth / naturalHeight);
                  }
                }}
                unoptimized
              />
            </div>

            {analysisError && (
              <div className="mt-4 shrink-0 rounded-lg bg-[var(--color-error-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--color-error)]">
                  Analysis failed
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-error)]">
                  {analysisError.message}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  Reference context preserved: asset, image, and prompt workspace stay available
                  for retry or replacement.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                    >
                      Retry analysis
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="reference-empty-state"
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
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
