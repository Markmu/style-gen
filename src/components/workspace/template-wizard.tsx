"use client";

import { useState } from "react";
import type { TemplateVariable } from "@/types/models";
import { replaceVariables } from "@/lib/template-parser";

interface TemplateWizardProps {
  variables: TemplateVariable[];
  originalContent: string;
  onApply: (renderedContent: string) => void;
  onSkip: () => void;
}

export function TemplateWizard({
  variables,
  originalContent,
  onApply,
  onSkip,
}: TemplateWizardProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v.name, v.defaultValue])),
  );

  /** 统计每个变量在原文中的出现次数 */
  function countOccurrences(name: string): number {
    const pattern = new RegExp(`\\{\\{${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}\\}`, "g");
    const matches = originalContent.match(pattern);
    return matches?.length ?? 0;
  }

  const handleApply = () => {
    const rendered = replaceVariables(originalContent, values);
    console.log("[wizard_applied]", { variableCount: variables.length });
    onApply(rendered);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">变量填值</h3>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
        >
          跳过
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-[var(--text-secondary)]">
        该模板包含 {variables.length} 个变量，填写后自动替换
      </p>

      {/* Variable cards */}
      <div className="space-y-3 overflow-y-auto">
        {variables.map((variable) => (
          <div
            key={variable.name}
            className="rounded-lg bg-[var(--surface-bright)] p-3 ring-1 ring-[var(--border)]"
          >
            <label
              htmlFor={`wizard-var-${variable.name}`}
              className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
            >
              {variable.name}
            </label>
            <input
              id={`wizard-var-${variable.name}`}
              type="text"
              value={values[variable.name] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [variable.name]: e.target.value,
                }))
              }
              placeholder="输入值..."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            />
            <p className="mt-1 text-xs text-[var(--text-secondary)]/70">
              出现 {countOccurrences(variable.name)} 次
            </p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          应用并生成
        </button>
      </div>
    </div>
  );
}
