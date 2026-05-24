"use client";

import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import type {
  AnalysisTemplateStatus,
  TemplateVariable,
} from "@/types/models";

interface EditingPaneProps {
  promptText: string;
  templateContent?: string | null;
  templateVariables?: TemplateVariable[];
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
  onResolvedPromptChange: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onSaveTemplate?: (templateContent: string) => void;
}

export function EditingPane({
  promptText,
  templateContent,
  templateVariables,
  templateStatus,
  templateReason,
  templateKey,
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onSaveTemplate,
}: EditingPaneProps) {
  return (
    <div
      data-testid="editing-pane"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <UnifiedPromptEditor
        initialPromptText={promptText}
        initialTemplateContent={templateContent}
        initialTemplateVariables={templateVariables}
        templateStatus={templateStatus}
        templateReason={templateReason}
        templateKey={templateKey}
        onResolvedPromptChange={onResolvedPromptChange}
        onTemplateContentChange={onTemplateContentChange}
        onTemplateVariablesChange={onTemplateVariablesChange}
        onSaveTemplate={onSaveTemplate}
      />
    </div>
  );
}
