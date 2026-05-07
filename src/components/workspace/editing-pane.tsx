"use client";

import type { ReactNode } from "react";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";

interface EditingPaneProps {
  promptText: string;
  templateContent?: string | null;
  onResolvedPromptChange: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onSaveTemplate?: (templateContent: string) => void;
  generatePanel: ReactNode;
}

export function EditingPane({
  promptText,
  templateContent,
  onResolvedPromptChange,
  onTemplateContentChange,
  onSaveTemplate,
  generatePanel,
}: EditingPaneProps) {
  return (
    <div
      data-testid="editing-pane"
      className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden"
    >
      <UnifiedPromptEditor
        initialPromptText={promptText}
        initialTemplateContent={templateContent}
        onResolvedPromptChange={onResolvedPromptChange}
        onTemplateContentChange={onTemplateContentChange}
        onSaveTemplate={onSaveTemplate}
      />
      {generatePanel}
    </div>
  );
}
