"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, FileText, SlidersHorizontal } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { CopyJsonButton } from "@/components/ui/copy-json-button";
import { PromptHighlightedEditor } from "@/components/workspace/prompt-highlighted-editor";
import type {
  TemplateVariable,
  V2PromptWorkspaceState,
  VisualRecipeV2Success,
} from "@/types/models";
import {
  composePromptOutputs,
  getPromptTemplateVariables,
} from "@/lib/prompt-composer";
import {
  renderPromptTemplate,
  toDescriptionRecipeJson,
} from "@/lib/visual-recipe";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import {
  reconcileLinkedTextVariableEdit,
  restoreVariableMarkers,
} from "@/lib/template-parser";
import type { LinkedTextVariableState } from "@/lib/template-parser";

type PromptEditorMode = "variables" | "text" | "json";

interface StructuredPromptEditorProps {
  recipe: VisualRecipeV2Success;
  state: V2PromptWorkspaceState;
  compact?: boolean;
  negativePromptText: string;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedProvenanceSpan?: PromptProvenanceSpan | null;
  onStateChange: (
    update: (current: V2PromptWorkspaceState) => V2PromptWorkspaceState,
  ) => void;
  onResolvedPromptChange: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onNegativePromptChange?: (value: string) => void;
  onSaveContentChange?: (value: string) => void;
}

function modeFromState(state: V2PromptWorkspaceState): PromptEditorMode {
  if (state.outputMode === "custom") return "text";
  if (state.outputMode === "structured") return "json";
  return "variables";
}

function splitConstraints(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface PromptModeSelectProps {
  mode: PromptEditorMode;
  variableCount: number;
  onChange: (mode: PromptEditorMode) => void;
}

function PromptModeSelect({
  mode,
  variableCount,
  onChange,
}: PromptModeSelectProps) {
  return (
    <label className="relative shrink-0">
      <span className="sr-only">Prompt mode</span>
      <select
        aria-label="Prompt mode"
        value={mode}
        onChange={(event) => onChange(event.target.value as PromptEditorMode)}
        className="render-select h-8 min-w-[8.75rem] appearance-none rounded-lg bg-[var(--surface-bright)] px-3 pr-8 text-xs font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border-static)] transition hover:bg-[var(--surface-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      >
        <option value="variables">Variables ({variableCount})</option>
        <option value="text">Full text</option>
        <option value="json">JSON</option>
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.65rem] text-[var(--text-muted)]"
      >
        ▾
      </span>
    </label>
  );
}

export function StructuredPromptEditor({
  recipe,
  state,
  compact = false,
  negativePromptText,
  provenanceSpans = [],
  selectedProvenanceSpan = null,
  onStateChange,
  onResolvedPromptChange,
  onTemplateVariablesChange,
  onNegativePromptChange,
  onSaveContentChange,
}: StructuredPromptEditorProps) {
  const [mode, setMode] = useState<PromptEditorMode>(() => modeFromState(state));
  const linkedVariableRef = useRef<LinkedTextVariableState | null>(null);
  const outputs = useMemo(
    () =>
      composePromptOutputs(recipe, {
        enabledInvariantIds: state.enabledInvariantIds,
        enabledModifierNames: state.enabledModifierNames,
        modifierValues: state.modifierValues,
      }),
    [
      recipe,
      state.enabledInvariantIds,
      state.enabledModifierNames,
      state.modifierValues,
    ],
  );
  const template = state.customTemplate ?? outputs.standardTemplate;
  const templateVariables = useMemo(
    () => getPromptTemplateVariables(recipe, template),
    [recipe, template],
  );
  const variableValues = useMemo(
    () => ({ ...state.variableValues, ...state.modifierValues }),
    [state.modifierValues, state.variableValues],
  );
  const resolvedTemplate = renderPromptTemplate(template, recipe, variableValues);
  const renderablePrompt =
    state.outputMode === "custom" ? state.customPrompt : resolvedTemplate;
  const jsonValue = useMemo(
    () => JSON.stringify(toDescriptionRecipeJson(recipe), null, 2),
    [recipe],
  );

  useEffect(() => {
    onResolvedPromptChange(renderablePrompt);
    onSaveContentChange?.(
      state.outputMode === "custom" ? state.customPrompt : template,
    );
    onTemplateVariablesChange?.(
      templateVariables.map((variable) => ({
        ...variable,
        defaultValue:
          state.variableValues[variable.name] ??
          state.modifierValues[
            variable.name as "mood" | "primary_color"
          ] ??
          variable.defaultValue,
      })),
    );
  }, [
    onResolvedPromptChange,
    onSaveContentChange,
    onTemplateVariablesChange,
    renderablePrompt,
    state.customPrompt,
    state.modifierValues,
    state.outputMode,
    state.variableValues,
    template,
    templateVariables,
  ]);

  const switchMode = (nextMode: PromptEditorMode) => {
    setMode(nextMode);
    if (nextMode === "json") return;

    if (nextMode === "variables") {
      onStateChange((current) => ({ ...current, outputMode: "standard" }));
      return;
    }

    onStateChange((current) => ({
      ...current,
      outputMode: "custom",
      customPrompt:
        current.outputMode === "custom" && current.customPrompt
          ? current.customPrompt
          : resolvedTemplate,
    }));
  };

  const handleLinkedPromptChange = (value: string) => {
    const linkedEdit = reconcileLinkedTextVariableEdit(
      resolvedTemplate,
      value,
      templateVariables,
      variableValues,
      linkedVariableRef.current,
    );

    if (linkedEdit) {
      linkedVariableRef.current = linkedEdit.linkState;
      const isModifier = recipe.optionalModifiers.some(
        (modifier) => modifier.name === linkedEdit.name,
      );
      onStateChange((current) =>
        isModifier
          ? {
              ...current,
              outputMode: "standard",
              modifierValues: {
                ...current.modifierValues,
                [linkedEdit.name]: linkedEdit.value,
              },
            }
          : {
              ...current,
              outputMode: "standard",
              variableValues: {
                ...current.variableValues,
                [linkedEdit.name]: linkedEdit.value,
              },
            },
      );
      return;
    }

    linkedVariableRef.current = null;
    const nextTemplate = restoreVariableMarkers(
      value,
      templateVariables,
      variableValues,
    );
    onStateChange((current) => ({
      ...current,
      outputMode: "standard",
      customTemplate: nextTemplate,
    }));
  };

  return (
    <div
      data-testid="structured-prompt-editor"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-[var(--surface-low)]/56 ring-1 ring-[var(--border-static)]"
    >
      <section className="min-h-0 flex-1 overflow-hidden">
        {mode === "variables" && (
          <div
            data-testid="structured-variable-scroll"
            className="h-full min-h-0 overflow-y-auto"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3">
              <span className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <AppIcon icon={SlidersHorizontal} size={14} />
                Variable-linked prompt
              </span>
              <PromptModeSelect
                mode={mode}
                variableCount={templateVariables.length}
                onChange={switchMode}
              />
            </div>
            <div className="h-[50dvh] min-h-[15rem] shrink-0 px-3 pt-2">
              <PromptHighlightedEditor
                ariaLabel="Variable-linked prompt preview"
                value={resolvedTemplate}
                onChange={handleLinkedPromptChange}
                placeholder="Prompt appears after analysis."
                mode="text"
                minHeightClass="h-full"
                compact={compact}
                variables={templateVariables}
                variableValues={variableValues}
                provenanceSpans={provenanceSpans}
                selectedProvenanceSpan={selectedProvenanceSpan}
                testId="structured-variable-prompt"
              />
            </div>
            <div className="p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {recipe.contentVariables.map((variable) => (
                  <label
                    key={variable.name}
                    className="block rounded-lg bg-[var(--surface-bright)]/78 p-2.5 ring-1 ring-[var(--border-static)]"
                  >
                    <span className="label-tech block truncate text-[var(--text-muted)]">
                      {variable.label}
                    </span>
                    <input
                      aria-label={variable.label}
                      value={
                        state.variableValues[variable.name] ?? variable.defaultValue
                      }
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          variableValues: {
                            ...current.variableValues,
                            [variable.name]: event.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    />
                  </label>
                ))}
                <label className="block rounded-lg bg-[var(--surface-bright)]/78 p-2.5 ring-1 ring-[var(--border-static)]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="label-tech truncate text-[var(--text-muted)]">
                      Negative constraints
                    </span>
                    <span className="shrink-0 text-[0.65rem] text-[var(--text-muted)]">
                      {splitConstraints(negativePromptText).length} active
                    </span>
                  </span>
                  <textarea
                    aria-label="Negative constraints"
                    rows={2}
                    value={negativePromptText}
                    onChange={(event) =>
                      onNegativePromptChange?.(event.target.value)
                    }
                    className="mt-1 min-h-14 w-full resize-y bg-transparent text-xs leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    placeholder="Add constraints separated by commas"
                  />
                </label>
              </div>

              {recipe.optionalModifiers.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="label-tech text-[var(--text-muted)]">
                    Optional style variables
                  </p>
                  {recipe.optionalModifiers.map((modifier) => {
                    const enabled = state.enabledModifierNames.includes(
                      modifier.name,
                    );
                    return (
                      <div
                        key={modifier.name}
                        className="rounded-lg bg-[var(--surface-bright)]/72 p-2.5"
                      >
                        <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() =>
                              onStateChange((current) => ({
                                ...current,
                                enabledModifierNames: enabled
                                  ? current.enabledModifierNames.filter(
                                      (name) => name !== modifier.name,
                                    )
                                  : [
                                      ...current.enabledModifierNames,
                                      modifier.name,
                                    ],
                              }))
                            }
                            className="accent-[var(--accent-primary)]"
                          />
                          Override {modifier.label}
                        </label>
                        {enabled && (
                          <input
                            aria-label={modifier.label}
                            value={
                              state.modifierValues[modifier.name] ??
                              modifier.defaultValue
                            }
                            onChange={(event) =>
                              onStateChange((current) => ({
                                ...current,
                                modifierValues: {
                                  ...current.modifierValues,
                                  [modifier.name]: event.target.value,
                                },
                              }))
                            }
                            className="input-precision mt-2 w-full rounded-t-md px-2.5 py-2 text-xs"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "text" && (
          <div className="flex h-full min-h-0 flex-col p-3">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <AppIcon icon={FileText} size={14} />
                Full generation prompt
              </span>
              <PromptModeSelect
                mode={mode}
                variableCount={templateVariables.length}
                onChange={switchMode}
              />
            </div>
            <PromptHighlightedEditor
              ariaLabel="Full Generation Prompt"
              value={state.customPrompt}
              onChange={(value) =>
                onStateChange((current) => ({
                  ...current,
                  outputMode: "custom",
                  customPrompt: value,
                }))
              }
              placeholder="Edit the full prompt here."
              mode="text"
              minHeightClass="min-h-0 flex-1"
              compact={compact}
              variables={templateVariables}
              variableValues={variableValues}
              provenanceSpans={provenanceSpans}
              selectedProvenanceSpan={selectedProvenanceSpan}
              testId="structured-text-prompt"
            />
          </div>
        )}

        {mode === "json" && (
          <div className="flex h-full min-h-0 flex-col p-3">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <AppIcon icon={Braces} size={14} />
                Recipe JSON
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <CopyJsonButton
                  value={jsonValue}
                  label="Copy"
                  showIcon
                  className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.68rem] font-semibold"
                />
                <PromptModeSelect
                  mode={mode}
                  variableCount={templateVariables.length}
                  onChange={switchMode}
                />
              </span>
            </div>
            <pre
              data-testid="structured-json-output"
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-bright)]/72 p-3 font-mono text-[0.7rem] leading-5 text-[var(--text-secondary)]"
            >
              {jsonValue}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
