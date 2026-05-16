"use client";

import type { TemplateVariable } from "@/types/models";
import type { AnalysisTemplateStatus } from "@/types/models";

interface TemplateVariablePanelProps {
  variables: TemplateVariable[];
  values: Record<string, string>;
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  onChange: (name: string, value: string) => void;
}

export function TemplateVariablePanel({
  variables,
  values,
  templateStatus,
  templateReason,
  onChange,
}: TemplateVariablePanelProps) {
  return (
    <div data-testid="template-variable-panel" className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          变量
        </h4>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          变量值会渲染进完整提示，不改写模板原文。
        </p>
      </div>

      {variables.length === 0 ? (
        <div className="rounded-lg bg-[var(--surface-low)] p-3 text-sm text-[var(--text-secondary)]">
          {templateStatus === "fallback" ? (
            <>
              <p className="font-medium text-[var(--text-primary)]">
                本次没有识别到足够稳定的可替换变量
              </p>
              {templateReason && <p className="mt-1 text-xs">{templateReason}</p>}
            </>
          ) : (
            "当前模板没有变量。"
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {variables.map((variable) => (
            <label key={variable.name} className="block space-y-1.5">
              <span className="flex items-center gap-2">
                <span className="label-tech text-[var(--text-muted)]">
                  {variable.label || variable.name}
                </span>
                {variable.sourceField && (
                  <span className="rounded-full bg-[var(--surface-low)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                    {variable.sourceField}
                  </span>
                )}
              </span>
              <input
                aria-label={`变量 ${variable.name}`}
                value={values[variable.name] ?? ""}
                onChange={(event) => onChange(variable.name, event.target.value)}
                className="input-precision w-full rounded-t-md px-3 py-2 text-sm"
                placeholder={`填写 ${variable.name}`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
