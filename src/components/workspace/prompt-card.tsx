"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
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
  error?: WorkspaceError | null;
  onResolvedPromptChange?: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onNegativePromptChange?: (value: string) => void;
  onSaveTemplate?: (content: string) => void;
  onBackToEdit?: () => void;
  renderDock?: ReactNode;
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
  error = null,
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onNegativePromptChange,
  onSaveTemplate,
  onBackToEdit,
  renderDock,
}: PromptCardProps) {
  const prompt = promptText.trim();
  const isLoading = state === "analyzing";
  const analysisError = error && error.stage !== "generation" ? error : null;
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
  const canSaveStyleMemory = prompt && onSaveTemplate && state !== "history_restored";

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
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Prompt + Render
            <span className="icon text-[0.9375rem] text-[var(--text-muted)]" aria-hidden="true">
              info
            </span>
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Prompt and generation controls
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canSaveStyleMemory && (
            <button
              type="button"
              onClick={() => onSaveTemplate(saveTemplateContent || promptText)}
              className="btn-secondary h-8 rounded-lg px-2.5 text-xs font-medium"
            >
              Save as Style Memory
            </button>
          )}
        </div>
      </div>

      <div
        className={
          renderDock
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto"
        }
      >
        {isLoading ? (
          <PromptSkeleton />
        ) : prompt ? (
          <div
            className={
              renderDock
                ? "flex h-full min-h-0 flex-col gap-3"
                : "flex min-h-full flex-col gap-4"
            }
          >
            <div
              data-testid="prompt-editor-frame"
              className={
                renderDock
                  ? "min-h-[14rem] flex-1 overflow-hidden"
                  : "min-h-[22.5rem]"
              }
            >
              <UnifiedPromptEditor
                initialPromptText={promptText}
                initialTemplateContent={templateContent}
                initialTemplateVariables={templateVariables}
                auxiliaryVariables={auxiliaryVariables}
                auxiliaryVariableValues={auxiliaryVariableValues}
                templateStatus={templateStatus}
                templateReason={templateReason}
                templateKey={templateKey}
                compact={Boolean(renderDock)}
                onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                onTemplateContentChange={onTemplateContentChange}
                onTemplateVariablesChange={onTemplateVariablesChange}
                onAuxiliaryVariableChange={handleAuxiliaryVariableChange}
                onSaveContentChange={handleSaveContentChange}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="flex min-h-[16.25rem] flex-1 flex-col justify-center rounded-xl bg-[var(--surface-low)] p-6">
              <span className="icon mb-4 text-[var(--accent-primary)]" aria-hidden="true">
                notes
              </span>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Prompt provenance will appear here
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {analysisError
                  ? "Prompt context preserved. Back to Edit keeps your workspace ready while you retry analysis or replace the reference."
                  : "Analyze a reference image to prepare generation text, style locks, variables, and negative constraints."}
              </p>
              {analysisError && (
                <button
                  type="button"
                  onClick={onBackToEdit}
                  className="btn-secondary mt-4 w-fit rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Back to Edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {renderDock && (
        <div data-testid="prompt-render-dock-slot" className="mt-2 shrink-0">
          {renderDock}
        </div>
      )}
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
