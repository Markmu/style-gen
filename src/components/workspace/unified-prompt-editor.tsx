"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractVariables,
  mergeVariableValues,
  replaceVariables,
} from "@/lib/template-parser";
import { TemplateModeEditor } from "@/components/workspace/template-mode-editor";
import { TextModeEditor } from "@/components/workspace/text-mode-editor";

type PromptMode = "template" | "text";

interface UnifiedPromptEditorProps {
  initialPromptText: string;
  initialTemplateContent?: string | null;
  onResolvedPromptChange: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onSaveTemplate?: (templateContent: string) => void;
}

export function UnifiedPromptEditor({
  initialPromptText,
  initialTemplateContent,
  onResolvedPromptChange,
  onTemplateContentChange,
  onSaveTemplate,
}: UnifiedPromptEditorProps) {
  const [mode, setMode] = useState<PromptMode>(
    initialTemplateContent ? "template" : "text",
  );
  const [templateSource, setTemplateSource] = useState(
    initialTemplateContent || initialPromptText,
  );
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    () => mergeVariableValues(initialTemplateContent || initialPromptText, {}),
  );
  const [textPrompt, setTextPrompt] = useState(initialPromptText);
  const textTouchedRef = useRef(false);
  const lastPromptRef = useRef(initialPromptText);
  const lastTemplateRef = useRef(initialTemplateContent ?? null);
  const lastEmittedPromptRef = useRef(initialPromptText);

  useEffect(() => {
    if (initialTemplateContent && initialTemplateContent !== lastTemplateRef.current) {
      lastTemplateRef.current = initialTemplateContent;
      lastPromptRef.current = initialPromptText;
      textTouchedRef.current = false;
      setMode("template");
      setTemplateSource(initialTemplateContent);
      setVariableValues((previous) => mergeVariableValues(initialTemplateContent, previous));
      setTextPrompt(replaceVariables(initialTemplateContent, {}));
      return;
    }

    if (
      initialPromptText &&
      initialPromptText !== lastPromptRef.current &&
      initialPromptText !== lastEmittedPromptRef.current &&
      !initialTemplateContent
    ) {
      lastPromptRef.current = initialPromptText;
      textTouchedRef.current = false;
      setTextPrompt(initialPromptText);
      setTemplateSource(initialPromptText);
      setMode("text");
    }
  }, [initialPromptText, initialTemplateContent]);

  const variables = useMemo(() => extractVariables(templateSource), [templateSource]);
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

  const handleTemplateChange = useCallback((value: string) => {
    setTemplateSource(value);
    setVariableValues((previous) => mergeVariableValues(value, previous));
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
        <p className="label-tech text-[var(--text-muted)]">Edit</p>
        <div className="flex items-center gap-2">
          {onSaveTemplate && (
            <button
              type="button"
              onClick={() => onSaveTemplate(templateSource)}
              className="h-7 shrink-0 rounded-md border border-[var(--border-interactive)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            >
              保存为模板
            </button>
          )}
          <div className="flex h-7 rounded-md bg-[var(--surface-low)] p-0.5">
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`h-6 rounded-[5px] px-2.5 text-xs transition-colors ${
                mode === "template"
                  ? "bg-[var(--surface-bright)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              模板模式
            </button>
            <button
              type="button"
              onClick={switchToText}
              className={`h-6 rounded-[5px] px-2.5 text-xs transition-colors ${
                mode === "text"
                  ? "bg-[var(--surface-bright)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              文本模式
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
            onTemplateChange={handleTemplateChange}
            onVariableChange={handleVariableChange}
          />
        ) : (
          <TextModeEditor promptText={textPrompt} onChange={handleTextChange} />
        )}
      </div>
    </div>
  );
}
