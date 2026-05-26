"use client";

import { useEffect, useRef, useState } from "react";
import { useHistoryList, type GenerationHistoryItem } from "@/hooks/use-history-list";

export interface HistoryPanelProps {
  currentGenerationTaskId?: string;
  onRestore?: (id: string) => void;
}

/** 格式化相对时间 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en");
}

/** 缩略图骨架屏 */
function ThumbnailSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 p-3">
      <div className="aspect-square w-full animate-pulse rounded-lg bg-[var(--surface-bright)]" />
      <div className="h-3 w-12 animate-pulse rounded bg-[var(--surface-bright)]" />
    </div>
  );
}

export function HistoryPanel({
  currentGenerationTaskId,
  onRestore,
}: HistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useHistoryList(isOpen);

  // 滚动到底部加载更多
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "100px" }
    );

    observerRef.current.observe(sentinelRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [isOpen, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const drawerId = "workspace-history-drawer";
  const toggleLabel = isOpen ? "Collapse history" : "Expand history";

  return (
    <aside
      className={`flex h-full max-w-[calc(100vw-5rem)] flex-shrink-0 justify-end overflow-hidden bg-[var(--surface-base)] transition-[width] duration-150 ease-out ${
        isOpen ? "w-72" : "w-10"
      }`}
      aria-label="History"
    >
      {!isOpen && (
        <div className="flex h-full w-10 flex-col items-center bg-[var(--surface-mid)] ring-1 ring-inset ring-[var(--border-static)]">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="mt-3 flex h-10 w-full items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)]"
            aria-controls={drawerId}
            aria-expanded={isOpen}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <span className="material-symbols-outlined text-lg">history</span>
          </button>
        </div>
      )}

      <div
        id={drawerId}
        className={`h-full w-72 max-w-[calc(100vw-5rem)] overflow-hidden bg-[var(--surface-mid)] ring-1 ring-inset ring-[var(--border-static)] transition-opacity duration-150 ease-out ${
          isOpen ? "flex flex-col opacity-100" : "hidden opacity-0"
        }`}
        aria-hidden={!isOpen}
      >
        {isOpen && (
          <>
            <div className="flex items-center gap-2 px-3 py-3">
              <h2 className="min-w-0 flex-1 text-sm font-bold text-[var(--text-primary)]">
                History
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="rounded-md p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
                  aria-label="Refresh history"
                  title="Refresh history"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                  aria-controls={drawerId}
                  aria-expanded={isOpen}
                  aria-label={toggleLabel}
                  title={toggleLabel}
                >
                  <span className="material-symbols-outlined text-lg">
                    keyboard_double_arrow_right
                  </span>
                </button>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto">
              {/* Loading skeleton */}
              {isLoading && (
                <div className="grid grid-cols-2 gap-2 p-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <ThumbnailSkeleton key={i} />
                  ))}
                </div>
              )}

              {/* Error state */}
              {isError && !isLoading && (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-8">
                  <p className="text-center text-sm text-[var(--text-secondary)]">
                    Loading failed. Click to retry.
                  </p>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-bright)]"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !isError && (!data || data.length === 0) && (
                <div className="flex flex-1 items-center justify-center py-8">
                  <p className="text-center text-sm text-[var(--text-secondary)]">
                    No generations yet
                  </p>
                </div>
              )}

              {/* Thumbnail grid */}
              {!isLoading && data && data.length > 0 && (
                <>
                  {/* Current generation progress indicator */}
                  {currentGenerationTaskId && (
                    <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-bright)] px-3 py-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-info)] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-info)]" />
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">Generating...</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 p-2">
                    {data.map((item: GenerationHistoryItem) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onRestore?.(item.id)}
                        className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-[var(--surface-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                      >
                        <div className="aspect-square w-full overflow-hidden rounded-md bg-[var(--surface-bright)]">
                          <img
                            src={item.resultFileUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <span className="truncate text-xs text-[var(--text-secondary)]">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Sentinel for infinite scroll */}
                  <div ref={sentinelRef} className="h-1" />

                  {/* Loading more indicator */}
                  {isFetchingNextPage && (
                    <div className="flex justify-center py-2">
                      <span className="text-xs text-[var(--text-secondary)]">Loading...</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
