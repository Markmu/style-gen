"use client";

import type { TemplateVariable } from "@/types/models";
import type { AnalysisTemplateStatus } from "@/types/models";
import { TemplateVariablePanel } from "@/components/workspace/template-variable-panel";
import { PromptHighlightedEditor } from "@/components/workspace/prompt-highlighted-editor";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";

interface TemplateModeEditorProps {
  templateSource: string;
  variables: TemplateVariable[];
  variableValues: Record<string, string>;
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedProvenanceSpan?: PromptProvenanceSpan | null;
  compact?: boolean;
  onTemplateChange: (value: string) => void;
  onVariableChange: (name: string, value: string) => void;
}

export function TemplateModeEditor({
  templateSource,
  variables,
  variableValues,
  templateStatus,
  templateReason,
  provenanceSpans = [],
  selectedProvenanceSpan = null,
  compact = false,
  onTemplateChange,
  onVariableChange,
}: TemplateModeEditorProps) {
  return (
    <div
      className={`flex min-h-full flex-col ${compact ? "gap-2" : "gap-4"}`}
    >
      <PromptHighlightedEditor
        ariaLabel="Template Source"
        value={templateSource}
        onChange={onTemplateChange}
        placeholder="Enter a template, e.g. Create {{subject}} with {{lighting}}."
        mode="template"
        minHeightClass="h-[50dvh] min-h-[15rem] shrink-0"
        compact={compact}
        variables={variables}
        variableValues={variableValues}
        provenanceSpans={provenanceSpans}
        selectedProvenanceSpan={selectedProvenanceSpan}
        testId="template-mode-highlight-editor"
      />
      <div>
        <TemplateVariablePanel
          variables={variables}
          values={variableValues}
          templateStatus={templateStatus}
          templateReason={templateReason}
          onChange={onVariableChange}
        />
      </div>
    </div>
  );
}
