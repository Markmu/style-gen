"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractVariables,
  mergeVariableValues,
  replaceVariables,
} from "@/lib/template-parser";
import { TemplateModeEditor } from "@/components/workspace/template-mode-editor";
import { TextModeEditor } from "@/components/workspace/text-mode-editor";
import type {
  AnalysisTemplateStatus,
  TemplateVariable,
} from "@/types/models";

type PromptMode = "template" | "text";

interface UnifiedPromptEditorProps {
  initialPromptText: string;
  initialTemplateContent?: string | null;
  initialTemplateVariables?: TemplateVariable[];
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
  onResolvedPromptChange: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onSaveTemplate?: (templateContent: string) => void;
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
  templateStatus = null,
  templateReason = null,
  templateKey = null,
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onSaveTemplate,
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

  const variables = useMemo(() => {
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
  const resolvedTemplatePrompt = useMemo(
    () => replaceVariables(templateSource, variableValues),
    [templateSource, variableValues],
  );
  const resolvedPrompt = mode === "template" ? resolvedTemplatePrompt : textPrompt;

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

  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariableValues((previous) => ({ ...previous, [name]: value }));
  }, []);

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
      className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl p-5"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <p className="label-tech text-[var(--accent-primary)]">Edit</p>
        <div className="flex items-center gap-2">
          {onSaveTemplate && (
            <button
              type="button"
              onClick={() =>
                onSaveTemplate(mode === "template" ? templateSource : textPrompt)
              }
              className="h-7 shrink-0 rounded-md border border-[var(--border-interactive)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            >
              Save as Template
            </button>
          )}
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

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {mode === "template" ? (
          <TemplateModeEditor
            templateSource={templateSource}
            variables={variables}
            variableValues={variableValues}
            templateStatus={templateStatus}
            templateReason={templateReason}
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
            <TextModeEditor promptText={textPrompt} onChange={handleTextChange} />
          </div>
        )}
      </div>
    </div>
  );
}
