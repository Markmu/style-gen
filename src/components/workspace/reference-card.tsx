"use client";

import Image from "next/image";
import type {
  DegradationState,
  WorkspaceError,
  WorkspaceState,
} from "@/hooks/use-workspace-state";
import { UploadZone } from "@/components/workspace/upload-zone";
import { extractAnalysisSummary } from "@/lib/analysis-summary";
import {
  deriveEvidenceFacets,
  type EvidenceFacet,
  type EvidenceFacetId,
} from "@/lib/evidence-facets";
import type { VisualRecipe } from "@/types/models";

interface ReferenceCardProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  recipe?: VisualRecipe | null;
  facets?: EvidenceFacet[];
  selectedFacetId?: EvidenceFacetId | null;
  error?: WorkspaceError | null;
  degradation?: DegradationState;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
  onRetry?: () => void;
  onFacetSelect?: (facetId: EvidenceFacetId) => void;
}

export function ReferenceCard({
  state,
  referenceImageUrl,
  isUploading,
  uploadProgress,
  recipe = null,
  facets = [],
  selectedFacetId = null,
  error = null,
  degradation,
  onFileSelected,
  onReplace,
  onRetry,
  onFacetSelect,
}: ReferenceCardProps) {
  const uploading = isUploading || state === "uploading";
  const hasReference = !!referenceImageUrl && !uploading;
  const isAnalyzing = state === "analyzing";
  const analysisError = error && error.stage !== "generation" ? error : null;
  const summary = extractAnalysisSummary(recipe);
  const evidenceFacets = facets.length > 0 ? facets : deriveEvidenceFacets(recipe);
  const anchorPositions = [
    "left-[39%] top-[18%]",
    "right-[26%] top-[35%]",
    "right-[31%] top-[57%]",
    "right-[18%] bottom-[15%]",
    "left-[22%] bottom-[24%]",
    "left-[16%] top-[42%]",
  ];
  const palette = [
    "oklch(96% 0.018 82)",
    "oklch(82% 0.07 77)",
    "oklch(75% 0.035 78)",
    "oklch(60% 0.065 72)",
    "oklch(34% 0.025 68)",
    "oklch(74% 0.012 82)",
  ];

  return (
    <article
      data-testid="reference-card"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Reference Canvas
            <span className="icon text-[15px] text-[var(--text-muted)]" aria-hidden="true">
              info
            </span>
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Source image and visual evidence
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasReference && (
            <button
              type="button"
              onClick={onReplace}
              className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Replace
            </button>
          )}
          {hasReference && (
            <button
              type="button"
              aria-label="Reference options"
              className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg"
            >
              <span className="icon text-[18px]" aria-hidden="true">
                more_horiz
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {hasReference ? (
          <div className="space-y-4">
            <div className="media-lens relative aspect-[4/5] min-h-[360px] overflow-hidden rounded-xl ring-1 ring-[var(--border-static)]">
              <Image
                src={referenceImageUrl}
                alt="Reference"
                fill
                className="object-cover"
                unoptimized
              />
              {evidenceFacets.length > 0 && (
                <>
                  {evidenceFacets.map((facet) => {
                    const selected = selectedFacetId === facet.id;
                    const position =
                      anchorPositions[facet.anchorIndex % anchorPositions.length];

                    return (
                      <button
                        key={facet.id}
                        type="button"
                        data-testid={`reference-anchor-${facet.id}`}
                        data-facet={facet.id}
                        data-selected={selected ? "true" : "false"}
                        aria-label={`${facet.label} reference anchor`}
                        onClick={() => onFacetSelect?.(facet.id)}
                        className={`absolute ${position} flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-[var(--shadow-ambient)] ring-1 transition ${
                          selected
                            ? "bg-[var(--accent-primary)] text-[var(--text-on-primary)] ring-[color-mix(in_oklch,var(--accent-primary)_55%,var(--border-static)_45%)]"
                            : "bg-[var(--surface-bright)] text-[var(--text-primary)] ring-[var(--border-static)] hover:bg-[var(--accent-primary-soft)]"
                        }`}
                      >
                        {facet.anchorIndex + 1}
                      </button>
                    );
                  })}
                  <div className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg bg-[var(--surface-bright)]/90 px-2 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-ambient)] backdrop-blur-xl">
                    <button type="button" className="icon text-[16px]" aria-label="Zoom out">
                      remove
                    </button>
                    <span>100%</span>
                    <button type="button" className="icon text-[16px]" aria-label="Zoom in">
                      add
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl bg-[var(--surface-low)]/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Detected palette
                </p>
                <span className="icon text-[14px] text-[var(--text-muted)]" aria-hidden="true">
                  info
                </span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {palette.map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="h-10 rounded-lg ring-1 ring-[var(--border-static)]"
                    style={{ background: color }}
                  />
                ))}
                <span className="flex h-10 items-center justify-center rounded-lg bg-[var(--surface-control)] text-xs font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)]">
                  +2
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                View overlays
              </p>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                {[
                  ["Composition", "grid_view"],
                  ["Lighting", "light_mode"],
                  ["Depth", "deployed_code"],
                  ["Texture", "texture"],
                ].map(([label, icon]) => (
                  <button
                    key={label}
                    type="button"
                    className="btn-secondary inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-xs"
                  >
                    <span className="icon text-[15px]" aria-hidden="true">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isAnalyzing && (
              <div
                aria-label="Reference analysis loading"
                className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-info)] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-info)]" />
                  </span>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Analyzing visual structure
                  </p>
                </div>
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  Reading color, composition, lighting, texture, mood, and subject signals
                  while keeping this reference available.
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-bright)]">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--accent-primary-soft)]" />
                </div>
                {degradation?.analysisQueueing && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Analysis is queued. The workspace remains ready while we wait.
                  </p>
                )}
              </div>
            )}

            {analysisError && (
              <div className="rounded-lg bg-[var(--color-error-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--color-error)]">
                  Analysis failed
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-error)]">
                  {analysisError.message}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  Reference context preserved: asset, image, and prompt workspace stay available
                  for retry or replacement.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                    >
                      Retry analysis
                    </button>
                  )}
                </div>
              </div>
            )}

            {summary.length > 0 && (
              <div className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="label-tech text-[var(--text-muted)]">
                    Analysis Match
                  </p>
                  <a
                    href="#visual-recipe"
                    className="text-xs font-medium text-[var(--accent-primary)] hover:text-[var(--accent-primary-dim)]"
                  >
                    View full analysis
                  </a>
                </div>
                <div className="space-y-3">
                  {summary.map((item) => (
                    <div key={item.dimension} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="icon text-[17px]"
                          style={{ color: item.iconColor }}
                          aria-hidden="true"
                        >
                          {item.iconName}
                        </span>
                        <p className="min-w-[5.5rem] text-xs font-semibold text-[var(--text-primary)]">
                          {item.label}
                        </p>
                        <p className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                          {item.value}
                        </p>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {item.percentage}%
                        </p>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-bright)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent-primary)]"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="rounded-xl bg-[var(--surface-low)]/70 p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                AI will read the reference as evidence.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Upload a reference image to extract color, composition, lighting,
                texture, mood, and subject signals for the prompt.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["color", "composition", "lighting", "texture", "mood"].map((signal) => (
                  <span
                    key={signal}
                    className="evidence-chip rounded-full bg-[var(--surface-bright)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                    data-facet={signal}
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>
            <div data-testid="reference-upload-panel" className="min-h-0 flex-1">
              <UploadZone
                referenceImageUrl={null}
                isUploading={uploading}
                uploadProgress={uploadProgress}
                onFileSelected={onFileSelected}
                onReplace={onReplace}
              />
            </div>
            {analysisError && (
              <div className="rounded-lg bg-[var(--color-error-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--color-error)]">
                  Upload failed
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-error)]">
                  {analysisError.message}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
