"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import type { AnalysisTemplateStatus, TemplateVariable } from "@/types/models";

const NEGATIVE_PROMPT_VARIABLE_NAME = "negative_prompt";

interface PromptCardProps {
  state: WorkspaceState;
  promptText: string;
  negativePromptText?: string;
  templateContent?: string | null;
  templateVariables?: TemplateVariable[];
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
  onResolvedPromptChange?: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onNegativePromptChange?: (value: string) => void;
  onSaveTemplate?: (content: string) => void;
}

export function PromptCard({
  state,
  promptText,
  negativePromptText = "",
  templateContent = null,
  templateVariables = [],
  templateStatus = null,
  templateReason = null,
  templateKey = null,
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onNegativePromptChange,
  onSaveTemplate,
}: PromptCardProps) {
  const prompt = promptText.trim();
  const isLoading = state === "analyzing";
  const [saveTemplateContent, setSaveTemplateContent] = useState(
    templateContent || promptText,
  );
  const lastSaveResetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const resetKey = templateKey ?? templateContent ?? null;
    if (resetKey === lastSaveResetKeyRef.current) return;
    lastSaveResetKeyRef.current = resetKey;
    setSaveTemplateContent(templateContent || promptText);
  }, [promptText, templateContent, templateKey]);

  const handleSaveContentChange = useCallback((value: string) => {
    setSaveTemplateContent(value);
  }, []);

  const auxiliaryVariables = useMemo<TemplateVariable[]>(
    () => [
      {
        name: NEGATIVE_PROMPT_VARIABLE_NAME,
        defaultValue: negativePromptText,
        label: "Negative Prompt",
      },
    ],
    [negativePromptText],
  );

  const auxiliaryVariableValues = useMemo(
    () => ({
      [NEGATIVE_PROMPT_VARIABLE_NAME]: negativePromptText,
    }),
    [negativePromptText],
  );

  const handleAuxiliaryVariableChange = useCallback(
    (name: string, value: string) => {
      if (name === NEGATIVE_PROMPT_VARIABLE_NAME) {
        onNegativePromptChange?.(value);
      }
    },
    [onNegativePromptChange],
  );

  return (
    <article
      data-testid="prompt-card"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Prompt
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Generation text
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prompt && onSaveTemplate && (
            <button
              type="button"
              onClick={() => onSaveTemplate(saveTemplateContent || promptText)}
              className="h-8 rounded-md border border-[var(--border-interactive)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            >
              Save as Template
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <PromptSkeleton />
        ) : prompt ? (
          <div className="flex min-h-full flex-col gap-4">
            <div className="min-h-[360px]">
              <UnifiedPromptEditor
                initialPromptText={promptText}
                initialTemplateContent={templateContent}
                initialTemplateVariables={templateVariables}
                auxiliaryVariables={auxiliaryVariables}
                auxiliaryVariableValues={auxiliaryVariableValues}
                templateStatus={templateStatus}
                templateReason={templateReason}
                templateKey={templateKey}
                onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                onTemplateContentChange={onTemplateContentChange}
                onTemplateVariablesChange={onTemplateVariablesChange}
                onAuxiliaryVariableChange={handleAuxiliaryVariableChange}
                onSaveContentChange={handleSaveContentChange}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col justify-center rounded-lg bg-[var(--surface-low)] p-6">
            <span className="icon mb-4 text-[var(--accent-primary)]" aria-hidden="true">
              notes
            </span>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Analyze a reference image to prepare a generation prompt.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function PromptSkeleton() {
  return (
    <div className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4" aria-label="Prompt loading">
      <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-full animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-11/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--surface-bright)]" />
    </div>
  );
}
