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
  onSaveTemplate?: () => void;
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
  onSaveTemplate,
}: AnalysisPaneProps) {
  return (
    <div data-testid="analysis-pane" className="flex h-full min-h-0 flex-col gap-4">
      <ReferencePreview
        referenceImageUrl={referenceImageUrl}
        isUploading={isUploading || state === "uploading"}
        uploadProgress={uploadProgress}
        onFileSelected={onFileSelected}
        onReplace={onReplace}
      />
      <StyleBreakdownPanel
        recipe={recipe}
        state={state}
        degradation={degradation}
        promptText={promptText}
        error={error}
        onRetry={onRetry}
        onReplace={onReplace}
        onSaveTemplate={onSaveTemplate}
      />
    </div>
  );
}
