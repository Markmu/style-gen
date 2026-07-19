"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { FileText, Info, Maximize, Minimize } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ExpandablePanel } from "@/components/ui/expandable-panel";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import { StructuredPromptEditor } from "@/components/workspace/structured-prompt-editor";
import type {
  AnalysisTemplateStatus,
  StoredVisualRecipe,
  TemplateVariable,
  V2PromptWorkspaceState,
} from "@/types/models";
import { isVisualRecipeV2Success } from "@/lib/visual-recipe";
import type { EvidenceFacetId } from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";

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
  recipe?: StoredVisualRecipe | null;
  v2PromptState?: V2PromptWorkspaceState | null;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedFacetId?: EvidenceFacetId | null;
  onV2PromptStateChange?: (
    update: (current: V2PromptWorkspaceState) => V2PromptWorkspaceState,
  ) => void;
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
  recipe = null,
  v2PromptState = null,
  provenanceSpans = [],
  selectedFacetId = null,
  onV2PromptStateChange,
}: PromptCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const titleId = useId();
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
        label: "Negative constraints",
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
  const structuredRecipe = isVisualRecipeV2Success(recipe) ? recipe : null;
  const selectedProvenanceSpan =
    provenanceSpans.find((span) => span.facetId === selectedFacetId) ?? null;
  const canSaveStyleMemory =
    prompt && onSaveTemplate && state !== "history_restored";
  const showRenderDock = Boolean(renderDock) && !isExpanded;

  const handleAuxiliaryVariableChange = useCallback(
    (name: string, value: string) => {
      if (name === NEGATIVE_PROMPT_VARIABLE_NAME) {
        onNegativePromptChange?.(value);
      }
    },
    [onNegativePromptChange],
  );

  return (
    <ExpandablePanel
      expanded={isExpanded}
      labelledBy={titleId}
      testId="prompt-expandable-panel"
      onClose={() => setIsExpanded(false)}
    >
      <article
        data-testid="prompt-card"
        className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-4"
      >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Prompt + Render
            <AppIcon icon={Info} size={16} className="text-[var(--text-muted)]" />
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
          <button
            type="button"
            data-expand-toggle="true"
            aria-label={
              isExpanded
                ? "Close expanded Prompt editor"
                : "Expand Prompt editor"
            }
            title={
              isExpanded
                ? "Close expanded Prompt editor"
                : "Expand Prompt editor"
            }
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg"
          >
            <AppIcon
              icon={isExpanded ? Minimize : Maximize}
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>

      <div
        className={
          showRenderDock || isExpanded
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto"
        }
      >
        {isLoading ? (
          <PromptSkeleton />
        ) : prompt || structuredRecipe ? (
          <div
            className={
              showRenderDock
                ? "flex h-full min-h-0 flex-col gap-3"
                : isExpanded
                  ? "flex h-full min-h-0 flex-col"
                : "flex min-h-full flex-col gap-4"
            }
          >
            <div
              data-testid="prompt-editor-frame"
              className={
                showRenderDock
                  ? "min-h-[14rem] flex-1 overflow-hidden"
                  : isExpanded
                    ? "h-full min-h-0 flex-1 overflow-hidden"
                  : "min-h-[22.5rem]"
              }
            >
              {structuredRecipe && v2PromptState && onV2PromptStateChange ? (
                <StructuredPromptEditor
                  recipe={structuredRecipe}
                  state={v2PromptState}
                  compact={showRenderDock}
                  negativePromptText={negativePromptText}
                  provenanceSpans={provenanceSpans}
                  selectedProvenanceSpan={selectedProvenanceSpan}
                  onStateChange={onV2PromptStateChange}
                  onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                  onTemplateVariablesChange={onTemplateVariablesChange}
                  onNegativePromptChange={onNegativePromptChange}
                  onSaveContentChange={handleSaveContentChange}
                />
              ) : (
                <UnifiedPromptEditor
                initialPromptText={promptText}
                initialTemplateContent={templateContent}
                initialTemplateVariables={templateVariables}
                auxiliaryVariables={auxiliaryVariables}
                auxiliaryVariableValues={auxiliaryVariableValues}
                templateStatus={templateStatus}
                templateReason={templateReason}
                templateKey={templateKey}
                compact={showRenderDock}
                provenanceSpans={provenanceSpans}
                selectedProvenanceSpan={selectedProvenanceSpan}
                onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                onTemplateContentChange={onTemplateContentChange}
                onTemplateVariablesChange={onTemplateVariablesChange}
                onAuxiliaryVariableChange={handleAuxiliaryVariableChange}
                onSaveContentChange={handleSaveContentChange}
              />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="flex min-h-[16.25rem] flex-1 flex-col justify-center rounded-xl bg-[var(--surface-low)] p-6">
              <AppIcon icon={FileText} size={24} className="mb-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Prompt will appear here
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
      {showRenderDock && (
        <div data-testid="prompt-render-dock-slot" className="mt-2 shrink-0">
          {renderDock}
        </div>
      )}
      </article>
    </ExpandablePanel>
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
