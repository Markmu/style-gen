"use client";

import type { VisualRecipe } from "@/types/models";
import type {
  DegradationState,
  WorkspaceError,
  WorkspaceState,
} from "@/hooks/use-workspace-state";
import { ReferencePreview } from "@/components/workspace/reference-preview";
import { StyleBreakdownPanel } from "@/components/workspace/style-breakdown-panel";

interface AnalysisPaneProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  recipe: VisualRecipe | null;
  isUploading: boolean;
  uploadProgress: number;
  degradation: DegradationState;
  promptText: string;
  error: WorkspaceError | null;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
  onRetry: () => void;
}

export function AnalysisPane({
  state,
  referenceImageUrl,
  recipe,
  isUploading,
  uploadProgress,
  degradation,
  promptText,
  error,
  onFileSelected,
  onReplace,
  onRetry,
}: AnalysisPaneProps) {
  return (
    <div
      data-testid="analysis-pane"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4"
    >
      <ReferencePreview
        referenceImageUrl={referenceImageUrl}
        isUploading={isUploading || state === "uploading"}
        uploadProgress={uploadProgress}
        onFileSelected={onFileSelected}
        onReplace={onReplace}
      />
      <div className="h-4 shrink-0" aria-hidden="true" />
      <StyleBreakdownPanel
        recipe={recipe}
        state={state}
        degradation={degradation}
        promptText={promptText}
        error={error}
        onRetry={onRetry}
        onReplace={onReplace}
      />
    </div>
  );
}
