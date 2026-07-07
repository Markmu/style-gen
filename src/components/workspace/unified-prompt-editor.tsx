"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractVariables,
  mergeVariableValues,
  replaceVariables,
} from "@/lib/template-parser";
import { TemplateModeEditor } from "@/components/workspace/template-mode-editor";
import { TemplateVariablePanel } from "@/components/workspace/template-variable-panel";
import { TextModeEditor } from "@/components/workspace/text-mode-editor";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import type {
  AnalysisTemplateStatus,
  TemplateVariable,
} from "@/types/models";

type PromptMode = "template" | "text";

interface UnifiedPromptEditorProps {
  initialPromptText: string;
  initialTemplateContent?: string | null;
  initialTemplateVariables?: TemplateVariable[];
  auxiliaryVariables?: TemplateVariable[];
  auxiliaryVariableValues?: Record<string, string>;
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
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

export function UnifiedPromptEditor({
  initialPromptText,
  initialTemplateContent,
  initialTemplateVariables = [],
  auxiliaryVariables = [],
  auxiliaryVariableValues = {},
  templateStatus = null,
  templateReason = null,
  templateKey = null,
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
  const [mode, setMode] = useState<PromptMode>(
    hasUsableTemplate ? "template" : "text",
  );
  const [templateSource, setTemplateSource] = useState(
    normalizedTemplateContent || initialPromptText,
  );
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    () => buildInitialVariableValues(normalizedTemplateContent || initialPromptText, initialTemplateVariables),
  );
  const [textPrompt, setTextPrompt] = useState(initialPromptText);
  const textTouchedRef = useRef(false);
  const lastPromptRef = useRef(initialPromptText);
  const lastTemplateRef = useRef(normalizedTemplateContent);
  const lastTemplateKeyRef = useRef(templateKey ?? normalizedTemplateContent);
  const lastEmittedPromptRef = useRef(initialPromptText);
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
      setMode("template");
      setTemplateSource(normalizedTemplateContent);
      setVariableMetadata(variablesByName(initialTemplateVariables));
      const nextValues = buildInitialVariableValues(normalizedTemplateContent, initialTemplateVariables);
      setVariableValues(nextValues);
      setTextPrompt(replaceVariables(normalizedTemplateContent, nextValues));
      return;
    }

    if (templateStatus === "fallback" && templateChanged) {
      lastTemplateKeyRef.current = nextTemplateKey;
      lastTemplateRef.current = normalizedTemplateContent;
      lastPromptRef.current = initialPromptText;
      textTouchedRef.current = false;
      setMode("text");
      setTextPrompt(initialPromptText);
      setTemplateSource(initialPromptText);
      setVariableValues({});
      setVariableMetadata(new Map());
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
  const resolvedPrompt = mode === "template" ? resolvedTemplatePrompt : textPrompt;
  const saveContent = mode === "template" ? templateSource : textPrompt;

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
    setTemplateSource(value);
    setVariableValues((previous) => mergeVariableValues(value, previous));
    setVariableMetadata((previous) => {
      const next = new Map<string, TemplateVariable>();
      for (const variable of extractVariables(value)) {
        const meta = previous.get(variable.name);
        if (meta) {
          next.set(variable.name, meta);
        }
      }
      return next;
    });
  }, []);

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
    textTouchedRef.current = true;
    setTextPrompt(value);
  }, []);

  const switchToText = useCallback(() => {
    setMode("text");
    if (!textTouchedRef.current) {
      setTextPrompt(resolvedTemplatePrompt);
    }
  }, [resolvedTemplatePrompt]);

  return (
    <div
      data-testid="unified-prompt-editor"
      data-compact={compact ? "true" : "false"}
      className={`surface-panel flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl ${
        compact ? "p-2" : "p-5"
      }`}
    >
      <div className={`${compact ? "mb-1" : "mb-4"} flex shrink-0 items-center justify-between gap-3`}>
        <p className="label-tech text-[var(--accent-primary)]">Edit</p>
        <div className="flex items-center gap-2">
          <div className="flex h-7 rounded-md bg-[var(--surface-low)] p-0.5">
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`h-6 rounded-[5px] px-2.5 text-xs transition-colors ${
                mode === "template"
                  ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Template Mode
            </button>
            <button
              type="button"
              onClick={switchToText}
              className={`h-6 rounded-[5px] px-2.5 text-xs transition-colors ${
                mode === "text"
                  ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Text Mode
            </button>
          </div>
        </div>
      </div>

      {selectedProvenanceSpan && (
        <div
          data-testid="unified-prompt-selected-provenance"
          data-facet={selectedProvenanceSpan.facetId}
          data-match-type={selectedProvenanceSpan.matchType}
          className="mb-3 rounded-lg bg-[var(--surface-low)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]"
        >
          <span className="font-semibold text-[var(--text-primary)]">
            {selectedProvenanceSpan.label}
          </span>{" "}
          {selectedProvenanceSpan.matchType === "facet_only"
            ? "is a related signal without an exact editable prompt span."
            : `is linked to "${selectedProvenanceSpan.matchedText}".`}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {mode === "template" ? (
          <TemplateModeEditor
            templateSource={templateSource}
            variables={variables}
            variableValues={combinedVariableValues}
            templateStatus={templateStatus}
            templateReason={templateReason}
            compact={compact}
            onTemplateChange={handleTemplateChange}
            onVariableChange={handleVariableChange}
          />
        ) : (
          <div className="space-y-3">
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
              onChange={handleTextChange}
            />
            {auxiliaryVariables.length > 0 && (
              <TemplateVariablePanel
                variables={auxiliaryVariables}
                values={auxiliaryVariableValues}
                onChange={handleVariableChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
