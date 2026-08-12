"use client";

import { useId, useMemo, useState } from "react";
import {
  Aperture,
  Braces,
  Camera,
  ChevronDown,
  CircleDot,
  Droplets,
  Focus,
  Info,
  Layers3,
  Maximize,
  Minimize,
  Palette,
  Shapes,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ExpandablePanel } from "@/components/ui/expandable-panel";
import type { StoredVisualRecipe } from "@/types/models";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import {
  deriveEvidenceFacets,
  type EvidenceFacet,
  type EvidenceFacetId,
  type EvidenceFacetTone,
} from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import {
  deriveAnalysisResultViewModel,
  type AnalysisResultViewModel,
} from "@/lib/analysis-result-view-model";

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

interface FacetGroup {
  id: string;
  label: string;
  tone: EvidenceFacetTone;
  sourceField: string;
  facets: EvidenceFacet[];
}

const FACET_ICON_BY_SOURCE: Record<string, LucideIcon> = {
  visualMedium: Aperture,
  composition: Focus,
  camera: Camera,
  color: Palette,
  lighting: Sun,
  formLanguage: Shapes,
  materialTexture: Layers3,
  atmosphere: Sparkles,
  rendering: CircleDot,
  texture: Layers3,
  mood: Sparkles,
  subject: Focus,
};

const FACET_TONE_CLASSES: Record<
  EvidenceFacetTone,
  { icon: string; dot: string; selected: string }
> = {
  color: {
    icon: "bg-[var(--evidence-color-bg)] text-[var(--evidence-color-text)]",
    dot: "bg-[var(--evidence-color-text)]",
    selected:
      "bg-[color-mix(in_oklch,var(--surface-bright)_80%,var(--evidence-color-bg)_20%)] ring-[var(--evidence-color-border)]",
  },
  composition: {
    icon: "bg-[var(--evidence-composition-bg)] text-[var(--evidence-composition-text)]",
    dot: "bg-[var(--evidence-composition-text)]",
    selected:
      "bg-[color-mix(in_oklch,var(--surface-bright)_80%,var(--evidence-composition-bg)_20%)] ring-[var(--evidence-composition-border)]",
  },
  lighting: {
    icon: "bg-[var(--evidence-lighting-bg)] text-[var(--evidence-lighting-text)]",
    dot: "bg-[var(--evidence-lighting-text)]",
    selected:
      "bg-[color-mix(in_oklch,var(--surface-bright)_80%,var(--evidence-lighting-bg)_20%)] ring-[var(--evidence-lighting-border)]",
  },
  texture: {
    icon: "bg-[var(--evidence-texture-bg)] text-[var(--evidence-texture-text)]",
    dot: "bg-[var(--evidence-texture-text)]",
    selected:
      "bg-[color-mix(in_oklch,var(--surface-bright)_80%,var(--evidence-texture-bg)_20%)] ring-[var(--evidence-texture-border)]",
  },
  mood: {
    icon: "bg-[var(--evidence-mood-bg)] text-[var(--evidence-mood-text)]",
    dot: "bg-[var(--evidence-mood-text)]",
    selected:
      "bg-[color-mix(in_oklch,var(--surface-bright)_80%,var(--evidence-mood-bg)_20%)] ring-[var(--evidence-mood-border)]",
  },
  neutral: {
    icon: "bg-[var(--evidence-neutral-bg)] text-[var(--evidence-neutral-text)]",
    dot: "bg-[var(--text-muted)]",
    selected:
      "bg-[color-mix(in_oklch,var(--surface-bright)_82%,var(--accent-primary-soft)_18%)] ring-[var(--border-interactive)]",
  },
};

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function compactKeyword(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  if (words.length <= 8 && normalized.length <= 72) return normalized;
  return `${words.slice(0, 7).join(" ")}…`;
}

function summaryKeywords(values: string[], limit = 3) {
  const chunks = values.flatMap((value) =>
    value
      .split(/[,;·|]/)
      .map((chunk) => chunk.trim())
      .filter(Boolean),
  );
  return unique(chunks).slice(0, limit).map(compactKeyword);
}

function groupEvidenceFacets(facets: EvidenceFacet[]) {
  const groups = new Map<string, FacetGroup>();

  facets.forEach((facet) => {
    const id = facet.sourceField || facet.id;
    const existing = groups.get(id);
    if (existing) {
      existing.facets.push(facet);
      return;
    }
    groups.set(id, {
      id,
      label: facet.label,
      tone: facet.tone,
      sourceField: facet.sourceField,
      facets: [facet],
    });
  });

  return [...groups.values()];
}

function confidenceForGroup(group: FacetGroup) {
  const values = group.facets.flatMap((facet) =>
    facet.confidence === null ? [] : [facet.confidence],
  );
  if (values.length === 0) return null;
  return Math.round(
    (values.reduce((total, confidence) => total + confidence, 0) / values.length) *
      100,
  );
}

function ContentAnalysis({ viewModel }: { viewModel: AnalysisResultViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const keywords = summaryKeywords(
    [
      viewModel.subject,
      ...viewModel.contentLines.map((line) => line.value),
    ],
    4,
  );

  return (
    <section
      data-testid="content-analysis"
      className="overflow-hidden rounded-xl bg-[var(--surface-low)]/64 ring-1 ring-inset ring-[var(--border-static)]"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--surface-bright)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--evidence-neutral-bg)] text-[var(--evidence-neutral-text)]">
          <AppIcon icon={Focus} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Content
            </span>
            <span className="rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {viewModel.status}
            </span>
          </span>
          <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">
            {keywords.join(", ") || viewModel.subject}
          </span>
        </span>
        <AppIcon
          icon={ChevronDown}
          size={16}
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div id={detailsId} className="px-3 pb-3 pl-14">
          <p
            data-testid="style-intelligence-image-summary"
            className="text-xs leading-5 text-[var(--text-secondary)]"
          >
            {viewModel.summary}
          </p>
          {viewModel.contentLines.length > 0 && (
            <dl className="mt-3 space-y-2 rounded-lg bg-[var(--surface-bright)]/72 p-3 text-xs">
              {viewModel.contentLines.map((line) => (
                <div key={line.label} className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <dt className="text-[var(--text-muted)]">{line.label}</dt>
                  <dd className="text-[var(--text-secondary)]">{line.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {viewModel.status === "fallback" && (
            <div
              role="status"
              className="mt-3 rounded-lg bg-[var(--surface-bright)] p-3 text-xs leading-5 text-[var(--text-secondary)]"
            >
              {viewModel.extractionReasons.length > 0 && (
                <ul className="space-y-1 text-[var(--text-muted)]">
                  {viewModel.extractionReasons.map((reason, index) => (
                    <li key={`${index}-${reason}`}>{reason}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2">
                The original visual analysis remains available in the Prompt editor.
                You can edit or render with it, or replace the reference and retry.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface EvidenceFacetGroupProps {
  group: FacetGroup;
  selectedFacetId: EvidenceFacetId | null;
  promptStatusByFacet: Map<
    EvidenceFacetId,
    PromptProvenanceSpan["matchType"]
  >;
  onFacetSelect?: (facetId: EvidenceFacetId) => void;
}

function EvidenceFacetGroup({
  group,
  selectedFacetId,
  promptStatusByFacet,
  onFacetSelect,
}: EvidenceFacetGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const selected = group.facets.some((facet) => facet.id === selectedFacetId);
  const confidence = confidenceForGroup(group);
  const keywords = summaryKeywords(group.facets.map((facet) => facet.summary));
  const Icon = FACET_ICON_BY_SOURCE[group.sourceField] ?? Droplets;
  const tone = FACET_TONE_CLASSES[group.tone];

  const handleToggle = () => {
    setExpanded((current) => !current);
    onFacetSelect?.(group.facets[0].id);
  };

  return (
    <section
      data-facet={group.tone}
      data-selected={selected ? "true" : "false"}
      className={`overflow-hidden rounded-xl ring-1 ring-inset transition-colors ${
        selected
          ? tone.selected
          : "bg-[var(--surface-low)]/54 ring-[var(--border-static)] hover:bg-[var(--surface-bright)]/76"
      }`}
    >
      <button
        type="button"
        data-testid={`evidence-facet-${group.id}`}
        data-facet={group.id}
        data-source-field={group.sourceField}
        data-selected={selected ? "true" : "false"}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={handleToggle}
        className="flex w-full items-center gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}
          aria-hidden="true"
        >
          <AppIcon icon={Icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {group.label}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-[0.68rem] font-semibold text-[var(--text-secondary)]">
              {confidence === null ? "AI" : `${confidence}%`}
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            </span>
          </span>
          <span className="mt-1 block break-words text-xs leading-4 text-[var(--text-secondary)] line-clamp-2">
            {keywords.join(", ")}
          </span>
        </span>
        <AppIcon
          icon={ChevronDown}
          size={16}
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div id={detailsId} className="space-y-2 px-3 pb-3 pl-14">
          {group.facets.map((facet) => {
            const observationSelected = selectedFacetId === facet.id;
            const promptStatus = promptStatusByFacet.get(facet.id);
            return (
              <button
                key={facet.id}
                type="button"
                data-testid={`evidence-observation-${facet.id}`}
                aria-pressed={observationSelected}
                onClick={() => onFacetSelect?.(facet.id)}
                className={`block w-full rounded-lg p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                  observationSelected
                    ? "bg-[var(--surface-bright)] ring-1 ring-[var(--border-interactive)]"
                    : "bg-[var(--surface-bright)]/62 hover:bg-[var(--surface-bright)]"
                }`}
              >
                <span
                  data-testid={`evidence-summary-${facet.id}`}
                  className="block text-xs font-medium leading-5 text-[var(--text-primary)]"
                >
                  {facet.summary}
                </span>
                {facet.evidence.length > 0 && (
                  <span className="mt-2 block space-y-1 text-[0.7rem] leading-5 text-[var(--text-muted)]">
                    {facet.evidence.map((item) => (
                      <span key={item} className="block">
                        {item}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem] text-[var(--text-muted)]">
                  <span className="rounded-full bg-[var(--surface-low)] px-2 py-0.5">
                    {facet.sourceField}
                  </span>
                  <span className="rounded-full bg-[var(--surface-low)] px-2 py-0.5">
                    {promptStatus === "facet_only"
                      ? "related signal"
                      : promptStatus
                        ? "prompt linked"
                        : "prompt pending"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface StyleRulesProps {
  viewModel: AnalysisResultViewModel;
  enabledInvariantIds?: string[];
  onInvariantToggle?: (invariantId: string) => void;
}

function StyleRules({
  viewModel,
  enabledInvariantIds,
  onInvariantToggle,
}: StyleRulesProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const enabledInvariants = new Set(
    enabledInvariantIds ?? viewModel.invariants.map((item) => item.id),
  );

  if (viewModel.version !== "v2" || viewModel.invariants.length === 0) return null;

  return (
    <section
      data-testid="style-invariants"
      className="overflow-hidden rounded-xl bg-[var(--surface-low)]/54 ring-1 ring-inset ring-[var(--border-static)]"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--surface-bright)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--evidence-neutral-bg)] text-[var(--evidence-neutral-text)]">
          <AppIcon icon={Braces} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">
            Style rules
          </span>
          <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">
            {viewModel.invariants.length} reusable invariants
          </span>
        </span>
        <AppIcon
          icon={ChevronDown}
          size={16}
          className={`text-[var(--text-muted)] transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div id={detailsId} className="space-y-2 px-3 pb-3 pl-14">
          {viewModel.invariants.map((invariant) => (
            <label
              key={invariant.id}
              className="flex cursor-pointer gap-2 rounded-lg bg-[var(--surface-bright)]/72 p-2.5 text-xs"
            >
              <input
                type="checkbox"
                checked={enabledInvariants.has(invariant.id)}
                onChange={() => onInvariantToggle?.(invariant.id)}
                className="mt-0.5 accent-[var(--accent-primary)]"
              />
              <span className="min-w-0">
                <span className="block font-medium text-[var(--text-primary)]">
                  {invariant.value}
                </span>
                <span className="mt-1 block text-[0.7rem] text-[var(--text-muted)]">
                  {invariant.kind} / {Math.round(invariant.confidence * 100)}% /{" "}
                  {invariant.dimension}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-[var(--surface-bright)] px-2.5 py-1 text-[0.68rem] font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)]"
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
  enabledInvariantIds,
  onInvariantToggle,
}: RecipeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const titleId = useId();
  const isAnalyzing = state === "analyzing";
  const evidenceFacets = facets ?? deriveEvidenceFacets(recipe);
  const styleEvidenceFacets = useMemo(
    () => evidenceFacets.filter((facet) => facet.sourceField !== "subject"),
    [evidenceFacets],
  );
  const facetGroups = useMemo(
    () => groupEvidenceFacets(styleEvidenceFacets),
    [styleEvidenceFacets],
  );
  const promptStatusByFacet = useMemo(
    () => new Map(provenanceSpans.map((span) => [span.facetId, span.matchType])),
    [provenanceSpans],
  );
  const viewModel = recipe ? deriveAnalysisResultViewModel(recipe) : null;

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
              Keywords first, complete evidence on demand
            </p>
          </div>
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
            <AppIcon icon={isExpanded ? Minimize : Maximize} strokeWidth={1.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isAnalyzing ? (
            <RecipeSkeleton />
          ) : recipe && viewModel ? (
            <div className="space-y-3">
              <ContentAnalysis viewModel={viewModel} />

              {facetGroups.length > 0 && (
                <section data-testid="style-dna" className="space-y-2">
                  <div className="flex items-center justify-between px-1 pt-1">
                    <p className="label-tech text-[var(--text-muted)]">Style DNA</p>
                    <span className="text-[0.68rem] text-[var(--text-muted)]">
                      {facetGroups.length} dimensions
                    </span>
                  </div>
                  {facetGroups.map((group) => (
                    <EvidenceFacetGroup
                      key={group.id}
                      group={group}
                      selectedFacetId={selectedFacetId}
                      promptStatusByFacet={promptStatusByFacet}
                      onFacetSelect={onFacetSelect}
                    />
                  ))}
                </section>
              )}

              {viewModel.tags.length > 0 && (
                <section className="px-1 py-1" aria-label="Style fingerprint">
                  <p className="label-tech mb-2 text-[var(--text-muted)]">
                    Style fingerprint
                  </p>
                  <TagList tags={viewModel.tags} />
                </section>
              )}

              <StyleRules
                viewModel={viewModel}
                enabledInvariantIds={enabledInvariantIds}
                onInvariantToggle={onInvariantToggle}
              />
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
    <div
      className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4"
      aria-label="Visual Recipe loading"
    >
      {["w-full", "w-11/12", "w-full", "w-10/12", "w-full"].map(
        (width, index) => (
          <div
            key={`${width}-${index}`}
            className={`h-14 animate-pulse rounded-xl bg-[var(--surface-bright)] ${width}`}
          />
        ),
      )}
    </div>
  );
}
