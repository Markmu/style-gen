"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractVariables,
  reconcileLinkedTextVariableEdit,
  replaceVariables,
} from "@/lib/template-parser";
import { TemplateModeEditor } from "@/components/workspace/template-mode-editor";
import { TemplateVariablePanel } from "@/components/workspace/template-variable-panel";
import { TextModeEditor } from "@/components/workspace/text-mode-editor";
import { CopyJsonButton } from "@/components/ui/copy-json-button";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import type {
  AnalysisTemplateStatus,
  TemplateVariable,
} from "@/types/models";
import type { LinkedTextVariableState } from "@/lib/template-parser";

type PromptMode = "variables" | "text" | "json";
type RenderablePromptMode = Exclude<PromptMode, "json">;

interface ArchivedVariableState {
  value: string;
  metadata?: TemplateVariable;
}

interface UnifiedPromptEditorProps {
  initialPromptText: string;
  initialTemplateContent?: string | null;
  initialTemplateVariables?: TemplateVariable[];
  auxiliaryVariables?: TemplateVariable[];
  auxiliaryVariableValues?: Record<string, string>;
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedProvenanceSpan?: PromptProvenanceSpan | null;
  compact?: boolean;
  onResolvedPromptChange: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onAuxiliaryVariableChange?: (name: string, value: string) => void;
  onSaveContentChange?: (value: string) => void;
}

function variablesByName(variables: TemplateVariable[] = []) {
  return new Map(variables.map((variable) => [variable.name, variable]));
}

function buildInitialVariableValues(
  content: string,
  initialVariables: TemplateVariable[] = [],
  previousValues: Record<string, string> = {},
): Record<string, string> {
  const defaults = variablesByName(initialVariables);
  return extractVariables(content).reduce<Record<string, string>>((values, variable) => {
    values[variable.name] =
      previousValues[variable.name] ?? defaults.get(variable.name)?.defaultValue ?? "";
    return values;
  }, {});
}

function hasOwnValue(values: Record<string, string>, name: string) {
  return Object.prototype.hasOwnProperty.call(values, name);
}

function metadataForRenamedVariable(
  variable: TemplateVariable,
  archived?: ArchivedVariableState,
): TemplateVariable {
  return {
    name: variable.name,
    defaultValue: archived?.value ?? variable.defaultValue ?? "",
    ...(archived?.metadata?.sourceField
      ? { sourceField: archived.metadata.sourceField }
      : {}),
  };
}

function mergeTemplateVariableState(
  previousContent: string,
  nextContent: string,
  previousValues: Record<string, string>,
  previousMetadata: Map<string, TemplateVariable>,
  archivedVariables: Map<number, ArchivedVariableState>,
) {
  const previousVariables = extractVariables(previousContent);
  const nextVariables = extractVariables(nextContent);
  const nextNames = new Set(nextVariables.map((variable) => variable.name));
  const nextArchive = new Map(archivedVariables);

  previousVariables.forEach((variable, index) => {
    if (nextNames.has(variable.name)) return;

    nextArchive.set(index, {
      value: previousValues[variable.name] ?? "",
      metadata: previousMetadata.get(variable.name),
    });
  });

  const nextValues: Record<string, string> = {};
  const nextMetadata = new Map<string, TemplateVariable>();

  nextVariables.forEach((variable, index) => {
    const archived = nextArchive.get(index);

    if (hasOwnValue(previousValues, variable.name)) {
      nextValues[variable.name] = previousValues[variable.name] ?? "";
    } else if (archived) {
      nextValues[variable.name] = archived.value;
      nextArchive.delete(index);
    } else {
      nextValues[variable.name] = "";
    }

    const existingMetadata = previousMetadata.get(variable.name);
    if (existingMetadata) {
      nextMetadata.set(variable.name, existingMetadata);
    } else {
      nextMetadata.set(
        variable.name,
        metadataForRenamedVariable(variable, archived),
      );
    }
  });

  return {
    values: nextValues,
    metadata: nextMetadata,
    archivedVariables: nextArchive,
  };
}

export function UnifiedPromptEditor({
  initialPromptText,
  initialTemplateContent,
  initialTemplateVariables = [],
  auxiliaryVariables = [],
  auxiliaryVariableValues = {},
  templateStatus = null,
  templateReason = null,
  templateKey = null,
  provenanceSpans = [],
  selectedProvenanceSpan = null,
  compact = false,
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onAuxiliaryVariableChange,
  onSaveContentChange,
}: UnifiedPromptEditorProps) {
  const normalizedTemplateContent = initialTemplateContent ?? null;
  const hasUsableTemplate =
    !!normalizedTemplateContent &&
    (templateStatus === "ready" || templateStatus === "partial" || templateStatus === null);
  const initialEditorSource = normalizedTemplateContent || initialPromptText;
  const initialMode: RenderablePromptMode = hasUsableTemplate
    ? "variables"
    : "text";
  const [mode, setMode] = useState<PromptMode>(initialMode);
  const [lastRenderableMode, setLastRenderableMode] =
    useState<RenderablePromptMode>(initialMode);
  const [templateSource, setTemplateSource] = useState(
    initialEditorSource,
  );
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    () => buildInitialVariableValues(initialEditorSource, initialTemplateVariables),
  );
  const [textPrompt, setTextPrompt] = useState(() => {
    if (initialPromptText) return initialPromptText;
    if (!hasUsableTemplate || !normalizedTemplateContent) return "";

    return replaceVariables(
      normalizedTemplateContent,
      buildInitialVariableValues(normalizedTemplateContent, initialTemplateVariables),
    );
  });
  const textTouchedRef = useRef(false);
  const lastPromptRef = useRef(initialPromptText);
  const lastTemplateRef = useRef(normalizedTemplateContent);
  const lastTemplateKeyRef = useRef(templateKey ?? normalizedTemplateContent);
  const lastEmittedPromptRef = useRef(initialPromptText);
  const archivedVariableStateRef = useRef(new Map<number, ArchivedVariableState>());
  const linkedTextVariableRef = useRef<LinkedTextVariableState | null>(null);
  const [variableMetadata, setVariableMetadata] = useState(
    () => variablesByName(initialTemplateVariables),
  );

  useEffect(() => {
    const nextTemplateKey = templateKey ?? normalizedTemplateContent;
    const templateChanged =
      nextTemplateKey !== lastTemplateKeyRef.current ||
      normalizedTemplateContent !== lastTemplateRef.current;

    if (hasUsableTemplate && normalizedTemplateContent && templateChanged) {
      lastTemplateKeyRef.current = nextTemplateKey;
      lastTemplateRef.current = normalizedTemplateContent;
      lastPromptRef.current = initialPromptText;
      textTouchedRef.current = false;
      setMode("variables");
      setLastRenderableMode("variables");
      setTemplateSource(normalizedTemplateContent);
      setVariableMetadata(variablesByName(initialTemplateVariables));
      archivedVariableStateRef.current = new Map();
      linkedTextVariableRef.current = null;
      const nextValues = buildInitialVariableValues(
        normalizedTemplateContent,
        initialTemplateVariables,
      );
      setVariableValues(nextValues);
      setTextPrompt(
        initialPromptText || replaceVariables(normalizedTemplateContent, nextValues),
      );
      return;
    }

    if (templateStatus === "fallback" && templateChanged) {
      lastTemplateKeyRef.current = nextTemplateKey;
      lastTemplateRef.current = normalizedTemplateContent;
      lastPromptRef.current = initialPromptText;
      textTouchedRef.current = false;
      setMode("text");
      setLastRenderableMode("text");
      setTextPrompt(initialPromptText);
      setTemplateSource(initialPromptText);
      setVariableValues({});
      setVariableMetadata(new Map());
      archivedVariableStateRef.current = new Map();
      linkedTextVariableRef.current = null;
      return;
    }

    if (
      initialPromptText &&
      initialPromptText !== lastPromptRef.current &&
      initialPromptText !== lastEmittedPromptRef.current &&
      !normalizedTemplateContent
    ) {
      lastPromptRef.current = initialPromptText;
      textTouchedRef.current = false;
      setTextPrompt(initialPromptText);
      setTemplateSource(initialPromptText);
      setMode("text");
      setLastRenderableMode("text");
      archivedVariableStateRef.current = new Map();
      linkedTextVariableRef.current = null;
    }
  }, [
    hasUsableTemplate,
    initialPromptText,
    normalizedTemplateContent,
    initialTemplateVariables,
    templateKey,
    templateStatus,
  ]);

  const templateVariables = useMemo(() => {
    const metadata = variableMetadata;
    return extractVariables(templateSource).map((variable) => {
      const meta = metadata.get(variable.name);
      return {
        ...variable,
        defaultValue: variableValues[variable.name] ?? meta?.defaultValue ?? "",
        ...(meta?.label ? { label: meta.label } : {}),
        ...(meta?.sourceField ? { sourceField: meta.sourceField } : {}),
      };
    });
  }, [templateSource, variableMetadata, variableValues]);

  const variables = useMemo(() => {
    const templateNames = new Set(templateVariables.map((variable) => variable.name));
    const extras = auxiliaryVariables
      .filter((variable) => !templateNames.has(variable.name))
      .map((variable) => ({
        ...variable,
        defaultValue: auxiliaryVariableValues[variable.name] ?? variable.defaultValue ?? "",
      }));

    return [...templateVariables, ...extras];
  }, [auxiliaryVariableValues, auxiliaryVariables, templateVariables]);

  const combinedVariableValues = useMemo(
    () => ({ ...variableValues, ...auxiliaryVariableValues }),
    [auxiliaryVariableValues, variableValues],
  );

  const resolvedTemplatePrompt = useMemo(
    () => replaceVariables(templateSource, combinedVariableValues),
    [combinedVariableValues, templateSource],
  );
  const renderableMode = mode === "json" ? lastRenderableMode : mode;
  const resolvedPrompt =
    renderableMode === "variables" ? resolvedTemplatePrompt : textPrompt;
  const shouldSaveTemplateSource =
    renderableMode === "variables" ||
    (!textTouchedRef.current && hasUsableTemplate && Boolean(normalizedTemplateContent));
  const saveContent = shouldSaveTemplateSource ? templateSource : textPrompt;
  const jsonValue = useMemo(
    () =>
      JSON.stringify(
        {
          template: templateSource,
          variables: combinedVariableValues,
          resolvedPrompt,
          templateStatus,
        },
        null,
        2,
      ),
    [combinedVariableValues, resolvedPrompt, templateSource, templateStatus],
  );

  useEffect(() => {
    lastEmittedPromptRef.current = resolvedPrompt;
    onResolvedPromptChange(resolvedPrompt);
  }, [onResolvedPromptChange, resolvedPrompt]);

  useEffect(() => {
    onTemplateContentChange?.(templateSource);
  }, [onTemplateContentChange, templateSource]);

  useEffect(() => {
    onTemplateVariablesChange?.(variables);
  }, [onTemplateVariablesChange, variables]);

  useEffect(() => {
    onSaveContentChange?.(saveContent);
  }, [onSaveContentChange, saveContent]);

  const handleTemplateChange = useCallback((value: string) => {
    const nextVariableState = mergeTemplateVariableState(
      templateSource,
      value,
      variableValues,
      variableMetadata,
      archivedVariableStateRef.current,
    );

    setTemplateSource(value);
    setVariableValues(nextVariableState.values);
    setVariableMetadata(nextVariableState.metadata);
    archivedVariableStateRef.current = nextVariableState.archivedVariables;
  }, [templateSource, variableMetadata, variableValues]);

  const auxiliaryVariableNames = useMemo(
    () => new Set(auxiliaryVariables.map((variable) => variable.name)),
    [auxiliaryVariables],
  );

  const handleVariableChange = useCallback((name: string, value: string) => {
    if (auxiliaryVariableNames.has(name)) {
      onAuxiliaryVariableChange?.(name, value);
      return;
    }

    setVariableValues((previous) => ({ ...previous, [name]: value }));
  }, [auxiliaryVariableNames, onAuxiliaryVariableChange]);

  const handleTextChange = useCallback((value: string) => {
    const linkedEdit = reconcileLinkedTextVariableEdit(
      textPrompt,
      value,
      templateVariables,
      variableValues,
      linkedTextVariableRef.current,
    );

    if (linkedEdit) {
      linkedTextVariableRef.current = linkedEdit.linkState;
      setVariableValues((previous) => ({
        ...previous,
        [linkedEdit.name]: linkedEdit.value,
      }));
      setTextPrompt(linkedEdit.promptText);
      return;
    }

    linkedTextVariableRef.current = null;
    textTouchedRef.current = true;
    setTextPrompt(value);
  }, [templateVariables, textPrompt, variableValues]);

  const switchToText = useCallback(() => {
    setMode("text");
    setLastRenderableMode("text");
    if (!textTouchedRef.current) {
      setTextPrompt(resolvedTemplatePrompt);
    }
  }, [resolvedTemplatePrompt]);

  const switchToVariables = useCallback(() => {
    setMode("variables");
    setLastRenderableMode("variables");
  }, []);

  return (
    <div
      data-testid="unified-prompt-editor"
      data-compact={compact ? "true" : "false"}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-[var(--surface-low)]/56 ring-1 ring-[var(--border-static)]"
    >
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${
          compact ? "p-2" : "p-3"
        }`}
      >
        {mode === "variables" ? (
          <div className="min-h-full space-y-2">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Variable-linked prompt
              </p>
              <PromptModeSwitcher
                mode={mode}
                variableCount={variables.length}
                onVariablesMode={switchToVariables}
                onTextMode={switchToText}
                onJsonMode={() => setMode("json")}
              />
            </div>
            <div>
              <TemplateModeEditor
                templateSource={templateSource}
                variables={variables}
                variableValues={combinedVariableValues}
                templateStatus={templateStatus}
                templateReason={templateReason}
                provenanceSpans={provenanceSpans}
                selectedProvenanceSpan={selectedProvenanceSpan}
                compact={compact}
                onTemplateChange={handleTemplateChange}
                onVariableChange={handleVariableChange}
              />
            </div>
          </div>
        ) : mode === "text" ? (
          <div className="flex h-full min-h-full flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Full generation prompt
              </p>
              <PromptModeSwitcher
                mode={mode}
                variableCount={variables.length}
                onVariablesMode={switchToVariables}
                onTextMode={switchToText}
                onJsonMode={() => setMode("json")}
              />
            </div>
            {templateStatus === "fallback" && (
              <div className="rounded-lg bg-[var(--surface-low)] p-3 text-sm text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">
                  No stable replaceable variables were detected this time.
                </p>
                {templateReason && <p className="mt-1 text-xs">{templateReason}</p>}
              </div>
            )}
            <TextModeEditor
              promptText={textPrompt}
              compact={compact}
              variables={variables}
              variableValues={combinedVariableValues}
              provenanceSpans={provenanceSpans}
              selectedProvenanceSpan={selectedProvenanceSpan}
              onChange={handleTextChange}
            />
            {auxiliaryVariables.length > 0 && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TemplateVariablePanel
                  variables={auxiliaryVariables}
                  values={auxiliaryVariableValues}
                  onChange={handleVariableChange}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Prompt JSON
                </p>
                <p className="mt-0.5 text-[0.68rem] text-[var(--text-muted)]">
                  Template, values, and resolved generation text
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <CopyJsonButton
                  value={jsonValue}
                  className="btn-secondary rounded-lg px-2 py-1 text-[0.68rem] font-semibold"
                />
                <PromptModeSwitcher
                  mode={mode}
                  variableCount={variables.length}
                  onVariablesMode={switchToVariables}
                  onTextMode={switchToText}
                  onJsonMode={() => setMode("json")}
                />
              </span>
            </div>
            <pre
              data-testid="prompt-json-output"
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-bright)]/72 p-3 font-mono text-[0.7rem] leading-5 text-[var(--text-secondary)]"
            >
              {jsonValue}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

interface PromptModeSwitcherProps {
  mode: PromptMode;
  variableCount: number;
  onVariablesMode: () => void;
  onTextMode: () => void;
  onJsonMode: () => void;
}

function PromptModeSwitcher({
  mode,
  variableCount,
  onVariablesMode,
  onTextMode,
  onJsonMode,
}: PromptModeSwitcherProps) {
  const handleChange = (nextMode: PromptMode) => {
    if (nextMode === "variables") onVariablesMode();
    if (nextMode === "text") onTextMode();
    if (nextMode === "json") onJsonMode();
  };

  return (
    <label className="relative shrink-0">
      <span className="sr-only">Prompt mode</span>
      <select
        aria-label="Prompt mode"
        value={mode}
        onChange={(event) => handleChange(event.target.value as PromptMode)}
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
