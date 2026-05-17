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
  onTemplateChange: (value: string) => void;
  onVariableChange: (name: string, value: string) => void;
}

export function TemplateModeEditor({
  templateSource,
  variables,
  variableValues,
  templateStatus,
  templateReason,
  onTemplateChange,
  onVariableChange,
}: TemplateModeEditorProps) {
  return (
    <div className="flex min-h-full flex-col gap-4">
      <label className="flex min-h-[220px] flex-1 flex-col gap-2">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          Template Source
        </span>
        <textarea
          aria-label="Template Source"
          value={templateSource}
          onChange={(event) => onTemplateChange(event.target.value)}
          className="input-precision min-h-0 flex-1 resize-none rounded-t-lg px-3 py-3 text-sm leading-6"
          placeholder="Enter a template, e.g. Create {{subject}} with {{lighting}}."
        />
      </label>
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
