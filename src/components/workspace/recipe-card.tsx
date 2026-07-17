"use client";

import { useId, useState } from "react";
import { Braces, ChevronDown, Info, Maximize, Minimize } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ExpandablePanel } from "@/components/ui/expandable-panel";
import type { StoredVisualRecipe } from "@/types/models";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import {
  deriveEvidenceFacets,
  type EvidenceFacet,
  type EvidenceFacetId,
} from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import { deriveAnalysisResultViewModel } from "@/lib/analysis-result-view-model";

interface RecipeCardProps {
  state: WorkspaceState;
  recipe: StoredVisualRecipe | null;
  facets?: EvidenceFacet[];
  provenanceSpans?: PromptProvenanceSpan[];
  selectedFacetId?: EvidenceFacetId | null;
  onFacetSelect?: (facetId: EvidenceFacetId) => void;
  enabledInvariantIds?: string[];
  onInvariantToggle?: (invariantId: string) => void;
}

const FACET_SUMMARY_COLLAPSE_UNITS = 80;

function shouldCollapseFacetSummary(summary: string) {
  const displayUnits = Array.from(summary).reduce((total, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return total + (codePoint > 0xff ? 2 : 1);
  }, 0);

  return displayUnits > FACET_SUMMARY_COLLAPSE_UNITS;
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

interface EvidenceFacetItemProps {
  facet: EvidenceFacet;
  selected: boolean;
  promptStatus?: PromptProvenanceSpan["matchType"];
  onSelect?: (facetId: EvidenceFacetId) => void;
}

function EvidenceFacetItem({
  facet,
  selected,
  promptStatus,
  onSelect,
}: EvidenceFacetItemProps) {
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const summaryId = useId();
  const isSummaryCollapsible = shouldCollapseFacetSummary(facet.summary);

  return (
    <div
      data-facet={facet.id}
      data-selected={selected ? "true" : "false"}
      className={`evidence-chip group flex w-full flex-col items-stretch gap-0 rounded-xl p-3 text-left transition ${
        selected
          ? "bg-[color-mix(in_oklch,var(--surface-bright)_82%,var(--accent-primary-soft)_18%)] ring-1 ring-[color-mix(in_oklch,var(--accent-primary)_42%,var(--border-static)_58%)]"
          : "bg-[var(--surface-low)]/62 ring-1 ring-[var(--border-static)] hover:bg-[var(--surface-bright)]"
      }`}
    >
      <button
        type="button"
        data-testid={`evidence-facet-${facet.id}`}
        data-facet={facet.id}
        data-source-field={facet.sourceField}
        data-selected={selected ? "true" : "false"}
        aria-pressed={selected}
        onClick={() => onSelect?.(facet.id)}
        className="w-full text-left"
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
                <p
                  id={summaryId}
                  data-testid={`evidence-summary-${facet.id}`}
                  className={`mt-1 text-xs leading-5 text-[var(--text-secondary)] ${
                    isSummaryCollapsible && !isSummaryExpanded
                      ? "line-clamp-2"
                      : ""
                  }`}
                >
                  {facet.summary}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-[var(--text-secondary)]">
                {facet.confidenceLabel}
              </span>
            </div>
          </div>
        </div>
      </button>

      {facet.evidence.length > 0 && (
        <ul className="ml-10 mt-2 space-y-1 text-[0.72rem] leading-5 text-[var(--text-muted)]">
          {facet.evidence.map((item) => (
            <li key={item}>Observed: {item}</li>
          ))}
        </ul>
      )}

      <div className="ml-10 mt-2 flex flex-wrap items-center gap-1.5 text-[0.68rem] text-[var(--text-muted)]">
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
        {isSummaryCollapsible && (
          <button
            type="button"
            aria-expanded={isSummaryExpanded}
            aria-controls={summaryId}
            aria-label={`${isSummaryExpanded ? "Show less" : "Show more"} ${facet.label} analysis`}
            onClick={() => setIsSummaryExpanded((expanded) => !expanded)}
            className="ml-auto inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2"
          >
            {isSummaryExpanded ? "Show less" : "Show more"}
            <AppIcon
              icon={ChevronDown}
              size={14}
              strokeWidth={1.75}
              className={`transition-transform duration-200 ${
                isSummaryExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}
      </div>
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
  enabledInvariantIds,
  onInvariantToggle,
}: RecipeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const titleId = useId();
  const isAnalyzing = state === "analyzing";
  const evidenceFacets = facets ?? deriveEvidenceFacets(recipe);
  const promptStatusByFacet = new Map(
    provenanceSpans.map((span) => [span.facetId, span.matchType]),
  );
  const viewModel = recipe ? deriveAnalysisResultViewModel(recipe) : null;
  const enabledInvariants = new Set(
    enabledInvariantIds ?? viewModel?.invariants.map((item) => item.id) ?? [],
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
          ) : recipe && viewModel ? (
            <div className="space-y-4">
              <section data-testid="content-analysis" className="rounded-xl bg-[var(--surface-low)]/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="label-tech text-[var(--text-muted)]">Content analysis</p>
                  <span className="rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-[var(--text-muted)]">
                    {viewModel.status}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-5 text-[var(--text-primary)]">
                  {viewModel.subject}
                </p>
                <p
                  data-testid="style-intelligence-image-summary"
                  className={`mt-1 text-xs leading-5 text-[var(--text-secondary)] ${
                    isExpanded ? "" : "max-h-10 overflow-hidden"
                  }`}
                >
                  {viewModel.summary}
                </p>
                {viewModel.version === "v2" && viewModel.contentLines.length > 0 && (
                  <dl className="mt-3 space-y-1.5 border-t border-[var(--border-static)] pt-3 text-xs">
                    {viewModel.contentLines.map((line) => (
                      <div key={line.label} className="grid grid-cols-[6rem_1fr] gap-2">
                        <dt className="text-[var(--text-muted)]">{line.label}</dt>
                        <dd className="text-[var(--text-secondary)]">{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-2">
                  <TagList tags={viewModel.tags} />
                </div>
                {viewModel.version === "v2" && viewModel.tags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(viewModel.tags.join(", "))}
                    className="btn-secondary mt-2 rounded-lg px-2 py-1 text-[0.68rem] font-semibold"
                  >
                    Copy fingerprint
                  </button>
                )}
              </section>

              <section data-testid="style-dna" className="space-y-2">
                <p className="label-tech px-1 text-[var(--text-muted)]">Style DNA</p>
                {evidenceFacets.map((facet) => {
                  const selected = selectedFacetId === facet.id;
                  const promptStatus = promptStatusByFacet.get(facet.id);

                  return (
                    <EvidenceFacetItem
                      key={`${facet.id}-${facet.summary}`}
                      facet={facet}
                      selected={selected}
                      promptStatus={promptStatus}
                      onSelect={onFacetSelect}
                    />
                  );
                })}
              </section>

              {viewModel.version === "v2" && (
                <section data-testid="style-invariants" className="space-y-2 rounded-xl bg-[var(--surface-low)]/70 p-3">
                  <div>
                    <p className="label-tech text-[var(--text-muted)]">Style invariants</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                      Cross-content rules. Disable a rule to recompose reusable prompts only.
                    </p>
                  </div>
                  {viewModel.invariants.map((invariant) => (
                    <label key={invariant.id} className="flex cursor-pointer gap-2 rounded-lg bg-[var(--surface-bright)] p-2.5 text-xs">
                      <input
                        type="checkbox"
                        checked={enabledInvariants.has(invariant.id)}
                        onChange={() => onInvariantToggle?.(invariant.id)}
                        className="mt-0.5 accent-[var(--accent-primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-[var(--text-primary)]">{invariant.value}</span>
                        <span className="mt-1 block text-[0.7rem] text-[var(--text-muted)]">
                          {invariant.kind} · {Math.round(invariant.confidence * 100)}% · {invariant.dimension}
                        </span>
                      </span>
                    </label>
                  ))}
                </section>
              )}

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
