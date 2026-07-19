"use client";

import type { TemplateVariable } from "@/types/models";
import type { AnalysisTemplateStatus } from "@/types/models";

const MULTILINE_VARIABLE_NAMES = new Set(["negative_prompt"]);

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
          Variables
        </h4>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Variable values update the prompt or related generation fields without changing the source template.
        </p>
      </div>

      {variables.length === 0 ? (
        <div className="rounded-lg bg-[var(--surface-low)] p-3 text-sm text-[var(--text-secondary)]">
          {templateStatus === "fallback" ? (
            <>
              <p className="font-medium text-[var(--text-primary)]">
                No stable replaceable variables were detected this time.
              </p>
              {templateReason && <p className="mt-1 text-xs">{templateReason}</p>}
            </>
          ) : (
            "This template has no variables."
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
                  <span className="rounded-full bg-[var(--accent-primary-soft)] px-2 py-0.5 text-[0.625rem] text-[var(--accent-primary)]">
                    {variable.sourceField}
                  </span>
                )}
              </span>
              {MULTILINE_VARIABLE_NAMES.has(variable.name) ? (
                <textarea
                  aria-label={`Variable ${variable.name}`}
                  rows={2}
                  value={values[variable.name] ?? ""}
                  onChange={(event) => onChange(variable.name, event.target.value)}
                  className="input-precision min-h-16 w-full resize-y rounded-t-md px-3 py-2 text-sm leading-6"
                  placeholder={`Fill ${variable.name}`}
                />
              ) : (
                <input
                  aria-label={`Variable ${variable.name}`}
                  value={values[variable.name] ?? ""}
                  onChange={(event) => onChange(variable.name, event.target.value)}
                  className="input-precision w-full rounded-t-md px-3 py-2 text-sm"
                  placeholder={`Fill ${variable.name}`}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
