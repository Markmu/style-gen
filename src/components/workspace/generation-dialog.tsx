"use client";

import Image from "next/image";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import { GenerationProgress } from "@/components/workspace/generation-progress";

interface GenerationDialogProps {
  open: boolean;
  state: WorkspaceState;
  resultImageUrl: string | null;
  error: WorkspaceError | null;
  generationQueueing: boolean;
  onClose: () => void;
  onRetry: () => void;
}

function getSafeGenerationMessage(error: WorkspaceError | null): string {
  const fallback =
    "Generation did not complete. Your workspace context is safe, and you can retry when ready.";
  const rawMessage = error?.message?.trim();

  if (!rawMessage) return fallback;

  const unsafePatterns = [
    /stack/i,
    /\bat\s+\S+\s*\(/,
    /node_modules/i,
    /\/Users\//i,
    /api[_-]?key/i,
    /bearer\s+[a-z0-9._-]+/i,
    /secret/i,
  ];

  if (unsafePatterns.some((pattern) => pattern.test(rawMessage))) {
    return fallback;
  }

  const firstLine = rawMessage.split(/\r?\n/)[0] ?? fallback;
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

export function GenerationDialog({
  open,
  state,
  resultImageUrl,
  error,
  generationQueueing,
  onClose,
  onRetry,
}: GenerationDialogProps) {
  if (!open) return null;

  const isGenerating = state === "generating";
  const isFailed = error?.stage === "generation";
  const showResult = state === "generation_ready" && resultImageUrl && !isFailed;
  const safeErrorMessage = getSafeGenerationMessage(error);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,28,30,0.24)] p-6 backdrop-blur-sm"
      role="presentation"
    >
      <div
        data-testid="generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Generation Task"
        className="glass-panel max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-xl p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="label-tech text-[var(--text-muted)]">Generation</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Generation Task
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary rounded-md px-3 py-1.5 text-sm"
            aria-label="Close Dialog"
          >
            Close
          </button>
        </div>

        {isGenerating && (
          <div className="rounded-lg bg-[var(--surface-low)] p-5">
            <GenerationProgress isGenerating />
            {generationQueueing && (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Generation is queued. Thanks for waiting。
              </p>
            )}
          </div>
        )}

        {showResult && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Generated Result
            </h3>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Context preserved: your reference, prompt, and params are still available
              for editing, another render, or saving as Style Memory.
            </p>
            <div className="media-lens relative mx-auto aspect-square max-h-[58vh] w-full max-w-[35rem] rounded-lg">
              <Image
                src={resultImageUrl}
                alt="Generated Result"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="btn-secondary rounded-lg px-4 py-2 text-sm"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary rounded-lg px-4 py-2 text-sm"
              >
                Close Dialog
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="rounded-lg bg-[var(--color-error-soft)] p-5">
            <h3 className="text-base font-semibold text-[var(--color-error)]">
              Generation Failed
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-error)]">
              {safeErrorMessage}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              Your reference, prompt, variables, and params are preserved. Retry render
              or go back to edit without losing the current direction.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary rounded-lg px-4 py-2 text-sm"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="btn-primary rounded-lg px-4 py-2 text-sm"
              >
                Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
