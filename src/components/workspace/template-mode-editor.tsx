"use client";

import type { TemplateVariable } from "@/types/models";
import { TemplateVariablePanel } from "@/components/workspace/template-variable-panel";

interface TemplateModeEditorProps {
  templateSource: string;
  variables: TemplateVariable[];
  variableValues: Record<string, string>;
  onTemplateChange: (value: string) => void;
  onVariableChange: (name: string, value: string) => void;
}

export function TemplateModeEditor({
  templateSource,
  variables,
  variableValues,
  onTemplateChange,
  onVariableChange,
}: TemplateModeEditorProps) {
  return (
    <div className="flex min-h-full flex-col gap-4">
      <label className="flex min-h-[220px] flex-1 flex-col gap-2">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          模板原文
        </span>
        <textarea
          aria-label="模板原文"
          value={templateSource}
          onChange={(event) => onTemplateChange(event.target.value)}
          className="input-precision min-h-0 flex-1 resize-none rounded-t-lg px-3 py-3 text-sm leading-6"
          placeholder="输入模板，例如：Create {{subject}} with {{lighting}}."
        />
      </label>
      <TemplateVariablePanel
        variables={variables}
        values={variableValues}
        onChange={onVariableChange}
      />
    </div>
  );
}
