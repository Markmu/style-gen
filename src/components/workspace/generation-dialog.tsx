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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,28,30,0.24)] p-6 backdrop-blur-sm"
      role="presentation"
    >
      <div
        data-testid="generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="生成任务"
        className="glass-panel max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-xl p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="label-tech text-[var(--text-muted)]">Generation</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              生成任务
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary rounded-md px-3 py-1.5 text-sm"
            aria-label="关闭弹窗"
          >
            关闭
          </button>
        </div>

        {isGenerating && (
          <div className="rounded-lg bg-[var(--surface-low)] p-5">
            <GenerationProgress isGenerating />
            {generationQueueing && (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                生成排队中，请耐心等待。
              </p>
            )}
          </div>
        )}

        {showResult && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              生成结果
            </h3>
            <div className="media-lens relative mx-auto aspect-square max-h-[58vh] w-full max-w-[560px] rounded-lg">
              <Image
                src={resultImageUrl}
                alt="生成结果"
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
                重新生成
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary rounded-lg px-4 py-2 text-sm"
              >
                关闭弹窗
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="rounded-lg bg-[var(--color-error-soft)] p-5">
            <h3 className="text-base font-semibold text-[var(--color-error)]">
              生成失败
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-error)]">
              {error.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary rounded-lg px-4 py-2 text-sm"
              >
                返回编辑
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="btn-primary rounded-lg px-4 py-2 text-sm"
              >
                重新生成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
