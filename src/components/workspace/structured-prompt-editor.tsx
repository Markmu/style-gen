"use client";

import { useEffect, useMemo } from "react";
import type {
  PromptOutputMode,
  TemplateVariable,
  V2PromptWorkspaceState,
  VisualRecipeV2Success,
} from "@/types/models";
import { composePromptOutputs, getPromptTemplateVariables } from "@/lib/prompt-composer";
import { renderPromptTemplate } from "@/lib/visual-recipe";

const OUTPUT_MODES: Array<{ value: PromptOutputMode; label: string }> = [
  { value: "reconstruction", label: "Reconstruction" },
  { value: "concise", label: "Concise" },
  { value: "standard", label: "Standard" },
  { value: "professional", label: "Professional" },
  { value: "structured", label: "Structured" },
  { value: "custom", label: "Custom" },
];

interface StructuredPromptEditorProps {
  recipe: VisualRecipeV2Success;
  state: V2PromptWorkspaceState;
  compact?: boolean;
  negativePromptText: string;
  onStateChange: (
    update: (current: V2PromptWorkspaceState) => V2PromptWorkspaceState,
  ) => void;
  onResolvedPromptChange: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onNegativePromptChange?: (value: string) => void;
  onSaveContentChange?: (value: string) => void;
}

export function StructuredPromptEditor({
  recipe,
  state,
  compact = false,
  negativePromptText,
  onStateChange,
  onResolvedPromptChange,
  onTemplateVariablesChange,
  onNegativePromptChange,
  onSaveContentChange,
}: StructuredPromptEditorProps) {
  const outputs = useMemo(
    () => composePromptOutputs(recipe, {
      enabledInvariantIds: state.enabledInvariantIds,
      enabledModifierNames: state.enabledModifierNames,
      modifierValues: state.modifierValues,
    }),
    [recipe, state.enabledInvariantIds, state.enabledModifierNames, state.modifierValues],
  );
  const template =
    state.outputMode === "concise" ? outputs.conciseTemplate
      : state.outputMode === "standard" ? outputs.standardTemplate
        : state.outputMode === "professional" ? outputs.professionalTemplate
          : null;
  const templateVariables = useMemo(
    () => template ? getPromptTemplateVariables(recipe, template) : [],
    [recipe, template],
  );
  const resolvedTemplate = template
    ? renderPromptTemplate(template, recipe, {
        ...state.variableValues,
        ...state.modifierValues,
      })
    : "";
  const currentPrompt =
    state.outputMode === "reconstruction" ? outputs.reconstructionPrompt
      : state.outputMode === "structured" ? JSON.stringify(recipe, null, 2)
        : state.outputMode === "custom" ? state.customPrompt
          : resolvedTemplate;
  const isGenerateDisabled = state.outputMode === "structured";

  useEffect(() => {
    onResolvedPromptChange(isGenerateDisabled ? "" : currentPrompt);
    onSaveContentChange?.(
      state.outputMode === "custom" ? state.customPrompt : template ?? "",
    );
    onTemplateVariablesChange?.(
      templateVariables.map((variable) => ({
        ...variable,
        defaultValue:
          state.variableValues[variable.name] ??
          state.modifierValues[variable.name as "mood" | "primary_color"] ??
          variable.defaultValue,
      })),
    );
  }, [
    currentPrompt,
    isGenerateDisabled,
    onResolvedPromptChange,
    onSaveContentChange,
    onTemplateVariablesChange,
    state.customPrompt,
    state.modifierValues,
    state.outputMode,
    state.variableValues,
    template,
    templateVariables,
  ]);

  const cloneToCustom = () => {
    const source = state.outputMode === "structured"
      ? outputs.standardTemplate
      : currentPrompt;
    const resolved = state.outputMode === "structured"
      ? renderPromptTemplate(source, recipe, state.variableValues)
      : source;
    onStateChange((current) => ({
      ...current,
      outputMode: "custom",
      customPrompt: resolved,
    }));
  };

  return (
    <div data-testid="structured-prompt-editor" className="flex h-full min-h-0 flex-col gap-3">
      <section data-testid="prompt-outputs" className="shrink-0">
        <p className="label-tech mb-2 text-[var(--text-muted)]">Prompt outputs</p>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Prompt output">
          {OUTPUT_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="tab"
              aria-selected={state.outputMode === mode.value}
              onClick={() => onStateChange((current) => ({ ...current, outputMode: mode.value }))}
              className={`rounded-lg px-2 py-1.5 text-[0.7rem] font-semibold transition ${
                state.outputMode === mode.value
                  ? "bg-[var(--text-primary)] text-[var(--surface-bright)]"
                  : "bg-[var(--surface-low)] text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      {(templateVariables.length > 0 || recipe.optionalModifiers.length > 0) &&
        state.outputMode !== "reconstruction" &&
        state.outputMode !== "structured" &&
        state.outputMode !== "custom" && (
          <section className="shrink-0 space-y-2 rounded-xl bg-[var(--surface-low)]/70 p-3">
            <p className="label-tech text-[var(--text-muted)]">Variables & modifiers</p>
            {recipe.contentVariables.map((variable) => (
              <label key={variable.name} className="block text-xs text-[var(--text-secondary)]">
                <span className="mb-1 block">{variable.label}</span>
                <input
                  value={state.variableValues[variable.name] ?? variable.defaultValue}
                  onChange={(event) => onStateChange((current) => ({
                    ...current,
                    variableValues: { ...current.variableValues, [variable.name]: event.target.value },
                  }))}
                  className="input w-full rounded-lg px-2.5 py-2 text-xs"
                />
              </label>
            ))}
            {recipe.optionalModifiers.map((modifier) => {
              const enabled = state.enabledModifierNames.includes(modifier.name);
              return (
                <div key={modifier.name} className="rounded-lg bg-[var(--surface-bright)] p-2.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => onStateChange((current) => ({
                        ...current,
                        enabledModifierNames: enabled
                          ? current.enabledModifierNames.filter((name) => name !== modifier.name)
                          : [...current.enabledModifierNames, modifier.name],
                      }))}
                    />
                    Override {modifier.label}
                  </label>
                  {enabled && (
                    <input
                      aria-label={modifier.label}
                      value={state.modifierValues[modifier.name] ?? modifier.defaultValue}
                      onChange={(event) => onStateChange((current) => ({
                        ...current,
                        modifierValues: { ...current.modifierValues, [modifier.name]: event.target.value },
                      }))}
                      className="input mt-2 w-full rounded-lg px-2.5 py-2 text-xs"
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}

      <section className="min-h-0 flex-1">
        {state.outputMode === "custom" ? (
          <textarea
            aria-label="Custom prompt"
            value={state.customPrompt}
            onChange={(event) => onStateChange((current) => ({
              ...current,
              customPrompt: event.target.value,
            }))}
            className="input h-full min-h-40 w-full resize-none rounded-xl p-3 text-xs leading-5"
          />
        ) : (
          <div className="flex h-full min-h-40 flex-col rounded-xl bg-[var(--surface-low)]/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {state.outputMode === "structured" ? "Read-only analysis JSON" : "System-derived · read only"}
              </span>
              <button
                type="button"
                onClick={cloneToCustom}
                className="btn-secondary rounded-lg px-2 py-1 text-[0.68rem] font-semibold"
              >
                Edit as custom text
              </button>
              {state.outputMode === "structured" && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(currentPrompt)}
                  className="btn-secondary rounded-lg px-2 py-1 text-[0.68rem] font-semibold"
                >
                  Copy JSON
                </button>
              )}
            </div>
            <pre className={`mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-[var(--text-secondary)] ${compact ? "max-h-40" : ""}`}>
              {currentPrompt}
            </pre>
            {isGenerateDisabled && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Structured JSON is inspectable and copyable, but cannot be sent to generation.
              </p>
            )}
          </div>
        )}
      </section>

      <label className="shrink-0 text-xs text-[var(--text-secondary)]">
        <span className="mb-1 block">Negative constraints</span>
        <textarea
          value={negativePromptText}
          onChange={(event) => onNegativePromptChange?.(event.target.value)}
          className="input min-h-16 w-full resize-y rounded-lg px-2.5 py-2 text-xs"
        />
      </label>
    </div>
  );
}
