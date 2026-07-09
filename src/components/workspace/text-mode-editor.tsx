"use client";

import { PromptHighlightedEditor } from "@/components/workspace/prompt-highlighted-editor";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import type { TemplateVariable } from "@/types/models";

interface TextModeEditorProps {
  promptText: string;
  onChange: (value: string) => void;
  compact?: boolean;
  variables?: TemplateVariable[];
  variableValues?: Record<string, string>;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedProvenanceSpan?: PromptProvenanceSpan | null;
}

export function TextModeEditor({
  promptText,
  onChange,
  compact = false,
  variables = [],
  variableValues = {},
  provenanceSpans = [],
  selectedProvenanceSpan = null,
}: TextModeEditorProps) {
  return (
    <PromptHighlightedEditor
      ariaLabel="Full Generation Prompt"
      value={promptText}
      onChange={onChange}
      placeholder="A full prompt appears after analysis, and you can edit it here directly."
      mode="text"
      minHeightClass={compact ? "min-h-[12rem]" : "min-h-[20rem]"}
      compact={compact}
      variables={variables}
      variableValues={variableValues}
      provenanceSpans={provenanceSpans}
      selectedProvenanceSpan={selectedProvenanceSpan}
      testId="text-mode-highlight-editor"
    />
  );
}
