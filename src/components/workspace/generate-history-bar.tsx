"use client";

import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import { FloatingGenerateWindow } from "@/components/workspace/floating-generate-window";
import { HistoryPanel } from "@/components/workspace/history-panel";

export interface GenerateHistoryBarProps {
  state: WorkspaceState;
  promptText: string;
  params: { aspectRatio: AspectRatio; quality: Quality };
  generationUnavailable: boolean;
  error: WorkspaceError | null;
  currentGenerationTaskId?: string;
  onParamsChange: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onRetry: () => void;
  onRestore?: (id: string) => void;
}

export function GenerateHistoryBar({
  state,
  promptText,
  params,
  generationUnavailable,
  error,
  currentGenerationTaskId,
  onParamsChange,
  onGenerate,
  onRetry,
  onRestore,
}: GenerateHistoryBarProps) {
  return (
    <section
      data-testid="generate-history-bar"
      className="workspace-generate-history-bar glass-panel mx-4 mb-3 shrink-0 rounded-xl px-4 py-3"
      aria-label="Generate and history"
    >
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end">
        <HistoryPanel
          currentGenerationTaskId={currentGenerationTaskId}
          onRestore={onRestore}
        />

        <div className="min-w-0 shrink-0 xl:w-[34rem]">
          <div className="mb-2 flex h-5 items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
              Generate
            </h2>
          </div>
          <FloatingGenerateWindow
            state={state}
            promptText={promptText}
            params={params}
            generationUnavailable={generationUnavailable}
            error={error}
            onParamsChange={onParamsChange}
            onGenerate={onGenerate}
            onRetry={onRetry}
            variant="bar"
          />
        </div>
      </div>
    </section>
  );
}
