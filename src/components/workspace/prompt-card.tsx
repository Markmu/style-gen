"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import type { EvidenceFacetId } from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
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
  provenanceSpans?: PromptProvenanceSpan[];
  selectedFacetId?: EvidenceFacetId | null;
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
  provenanceSpans = [],
  selectedFacetId = null,
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
  const selectedProvenanceSpan = useMemo(
    () =>
      selectedFacetId
        ? provenanceSpans.find((span) => span.facetId === selectedFacetId) ?? null
        : null,
    [provenanceSpans, selectedFacetId],
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
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Prompt + Render
            <span className="icon text-[15px] text-[var(--text-muted)]" aria-hidden="true">
              info
            </span>
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Prompt provenance and generation controls
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prompt && onSaveTemplate && (
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <PromptSkeleton />
        ) : prompt ? (
          <div className="flex min-h-full flex-col gap-4">
            <PromptProvenance
              spans={provenanceSpans}
              selectedFacetId={selectedFacetId}
            />
            <div
              className={
                renderDock
                  ? "h-[92px] min-h-0 overflow-hidden"
                  : "min-h-[360px]"
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
                selectedProvenanceSpan={selectedProvenanceSpan}
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
            <div className="flex min-h-[260px] flex-1 flex-col justify-center rounded-xl bg-[var(--surface-low)] p-6">
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
      {renderDock && <div className="mt-4 shrink-0">{renderDock}</div>}
    </article>
  );
}

function PromptProvenance({
  spans,
  selectedFacetId,
}: {
  spans: PromptProvenanceSpan[];
  selectedFacetId: EvidenceFacetId | null;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-low)]/70 p-2">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-xs font-semibold text-[var(--text-primary)]">
          Prompt provenance
        </p>
        <span className="icon text-[14px] text-[var(--text-muted)]" aria-hidden="true">
          info
        </span>
      </div>
      <div className="flex flex-wrap gap-1 text-xs leading-5">
        {spans.length > 0 ? (
          spans.map((span) => {
            const selected = selectedFacetId === span.facetId;
            const isFacetOnly = span.matchType === "facet_only";

            return (
              <span
                key={span.facetId}
                data-testid={
                  isFacetOnly
                    ? `prompt-provenance-facet-only-${span.facetId}`
                    : `prompt-provenance-span-${span.facetId}`
                }
                data-facet={span.facetId}
                data-selected={selected ? "true" : "false"}
                data-match-type={span.matchType}
                title={span.summary}
                className={`evidence-chip rounded-md px-2 py-0 ring-1 transition ${
                  selected
                    ? "bg-[var(--accent-primary)] text-[var(--text-on-primary)] ring-[var(--accent-primary)]"
                    : isFacetOnly
                      ? "bg-[var(--surface-bright)] text-[var(--text-secondary)] ring-[var(--border-static)]"
                      : "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-dim)] ring-[color-mix(in_oklch,var(--accent-primary)_18%,var(--border-static)_82%)]"
                }`}
              >
                {isFacetOnly
                  ? `${span.label}: related signal / 相关信号`
                  : span.matchedText}
              </span>
            );
          })
        ) : (
          <span className="rounded-md bg-[var(--surface-bright)] px-2 py-0 text-[var(--text-secondary)]">
            Related signal chips will appear after analysis.
          </span>
        )}
      </div>
      <p className="sr-only">
        These chips explain related signals only; they are not added to the system prompt or
        user prompt.
      </p>
    </div>
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
