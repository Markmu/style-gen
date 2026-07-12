"use client";

import { useId, useState } from "react";
import { Braces, Info, Maximize, Minimize } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ExpandablePanel } from "@/components/ui/expandable-panel";
import type { VisualRecipe } from "@/types/models";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import {
  deriveEvidenceFacets,
  type EvidenceFacet,
  type EvidenceFacetId,
} from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";

interface RecipeCardProps {
  state: WorkspaceState;
  recipe: VisualRecipe | null;
  facets?: EvidenceFacet[];
  provenanceSpans?: PromptProvenanceSpan[];
  selectedFacetId?: EvidenceFacetId | null;
  onFacetSelect?: (facetId: EvidenceFacetId) => void;
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-block rounded-full bg-[var(--surface-bright)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function RecipeCard({
  state,
  recipe,
  facets,
  provenanceSpans = [],
  selectedFacetId = null,
  onFacetSelect,
}: RecipeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const titleId = useId();
  const isAnalyzing = state === "analyzing";
  const evidenceFacets = facets ?? deriveEvidenceFacets(recipe);
  const promptStatusByFacet = new Map(
    provenanceSpans.map((span) => [span.facetId, span.matchType]),
  );

  return (
    <ExpandablePanel
      expanded={isExpanded}
      labelledBy={titleId}
      testId="style-intelligence-expandable-panel"
      onClose={() => setIsExpanded(false)}
    >
      <article
        id="visual-recipe"
        data-testid="recipe-card"
        className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-4"
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
            >
              Style Intelligence
              <AppIcon icon={Info} size={16} className="text-[var(--text-muted)]" />
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              AI style signals and evidence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-expand-toggle="true"
              aria-label={
                isExpanded
                  ? "Close expanded Style Intelligence"
                  : "Expand Style Intelligence"
              }
              title={
                isExpanded
                  ? "Close expanded Style Intelligence"
                  : "Expand Style Intelligence"
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isAnalyzing ? (
            <RecipeSkeleton />
          ) : recipe ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-[var(--surface-low)]/70 p-3">
                <p className="label-tech text-[var(--text-muted)]">Core summary</p>
                <p className="mt-2 text-sm font-medium leading-5 text-[var(--text-primary)]">
                  {recipe.subject}
                </p>
                <p
                  data-testid="style-intelligence-image-summary"
                  className={`mt-1 text-xs leading-5 text-[var(--text-secondary)] ${
                    isExpanded ? "" : "max-h-10 overflow-hidden"
                  }`}
                >
                  {recipe.imageSummary}
                </p>
                <div className="mt-2">
                  <TagList tags={recipe.styleTags} />
                </div>
              </div>

              <div className="space-y-2">
                {evidenceFacets.map((facet) => {
                  const selected = selectedFacetId === facet.id;
                  const promptStatus = promptStatusByFacet.get(facet.id);

                  return (
                    <button
                      key={facet.id}
                      type="button"
                      data-testid={`evidence-facet-${facet.id}`}
                      data-facet={facet.id}
                      data-source-field={facet.sourceField}
                      data-selected={selected ? "true" : "false"}
                      onClick={() => onFacetSelect?.(facet.id)}
                      className={`evidence-chip group w-full rounded-xl p-3 text-left transition ${
                        selected
                          ? "bg-[color-mix(in_oklch,var(--surface-bright)_82%,var(--accent-primary-soft)_18%)] ring-1 ring-[color-mix(in_oklch,var(--accent-primary)_42%,var(--border-static)_58%)]"
                          : "bg-[var(--surface-low)]/62 ring-1 ring-[var(--border-static)] hover:bg-[var(--surface-bright)]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-bright)] text-xs font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border-static)]"
                          aria-hidden="true"
                        >
                          {facet.anchorIndex + 1}
                          </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                {facet.label}
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                                {facet.summary}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-[var(--text-secondary)]">
                              {facet.confidenceLabel}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[0.68rem] text-[var(--text-muted)]">
                            <span className="rounded-full bg-[var(--surface-bright)] px-2 py-0.5">
                              source: {facet.sourceField}
                            </span>
                            <span className="rounded-full bg-[var(--surface-bright)] px-2 py-0.5">
                              {promptStatus === "facet_only"
                                ? "related signal"
                                : promptStatus
                                  ? "prompt span linked"
                                  : "prompt pending"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl bg-[color-mix(in_oklch,var(--surface-bright)_82%,var(--accent-primary-soft)_18%)] p-3 text-xs leading-5 text-[var(--text-secondary)] ring-1 ring-[color-mix(in_oklch,var(--accent-primary)_18%,var(--border-static)_82%)]">
                Click any facet to highlight related areas in the reference and
                connected prompt spans.
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[16.25rem] flex-col justify-center rounded-xl bg-[var(--surface-low)] p-6">
              <AppIcon icon={Braces} size={24} className="mb-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Waiting for style signals
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                After upload, AI will separate color, composition, lighting,
                texture, and mood into editable evidence.
              </p>
            </div>
          )}
        </div>
      </article>
    </ExpandablePanel>
  );
}

function RecipeSkeleton() {
  return (
    <div className="space-y-4 rounded-lg bg-[var(--surface-low)] p-4" aria-label="Visual Recipe loading">
      <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-[var(--surface-bright)]" />
        <div className="h-3 w-10/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
        <div className="h-3 w-7/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      </div>
      <div className="flex gap-2 pt-2">
        <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--surface-bright)]" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      </div>
    </div>
  );
}
