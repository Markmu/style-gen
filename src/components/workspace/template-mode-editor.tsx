"use client";

import type { TemplateVariable } from "@/types/models";
import type { AnalysisTemplateStatus } from "@/types/models";
import { TemplateVariablePanel } from "@/components/workspace/template-variable-panel";

interface TemplateModeEditorProps {
  templateSource: string;
  variables: TemplateVariable[];
  variableValues: Record<string, string>;
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
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
  compact = false,
  onTemplateChange,
  onVariableChange,
}: TemplateModeEditorProps) {
  return (
    <div className={`flex min-h-0 flex-col ${compact ? "gap-2" : "min-h-full gap-4"}`}>
      <div className={`flex flex-1 flex-col ${compact ? "min-h-0" : "min-h-[13.75rem]"}`}>
        <textarea
          aria-label="Template Source"
          value={templateSource}
          onChange={(event) => onTemplateChange(event.target.value)}
          className={`input-precision min-h-0 flex-1 resize-none rounded-t-lg px-3 text-sm leading-6 ${
            compact ? "py-1.5" : "py-3"
          }`}
          placeholder="Enter a template, e.g. Create {{subject}} with {{lighting}}."
        />
      </div>
      <TemplateVariablePanel
        variables={variables}
        values={variableValues}
        templateStatus={templateStatus}
        templateReason={templateReason}
        onChange={onVariableChange}
      />
    </div>
  );
}
