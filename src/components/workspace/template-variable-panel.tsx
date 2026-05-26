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
          Variables
        </h4>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Variable values render into the full prompt without changing the source template.
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
                  <span className="rounded-full bg-[var(--accent-primary-soft)] px-2 py-0.5 text-[10px] text-[var(--accent-primary)]">
                    {variable.sourceField}
                  </span>
                )}
              </span>
              <input
                aria-label={`Variable ${variable.name}`}
                value={values[variable.name] ?? ""}
                onChange={(event) => onChange(variable.name, event.target.value)}
                className="input-precision w-full rounded-t-md px-3 py-2 text-sm"
                placeholder={`Fill ${variable.name}`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
