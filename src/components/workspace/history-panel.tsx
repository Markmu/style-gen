"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useHistoryList, type GenerationHistoryItem } from "@/hooks/use-history-list";

export interface HistoryPanelProps {
  currentGenerationTaskId?: string;
  onRestore?: (id: string) => void;
}

function ThumbnailSkeleton() {
  return (
    <div className="w-[4.5rem] shrink-0">
      <div className="aspect-square w-full animate-pulse rounded-md bg-[var(--surface-bright)]" />
    </div>
  );
}

export function HistoryPanel({
  currentGenerationTaskId,
  onRestore,
}: HistoryPanelProps) {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useHistoryList(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !scrollRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        root: scrollRef.current,
        rootMargin: "80px",
      },
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section
      data-testid="history-panel"
      className="min-w-0 flex-1"
      aria-label="Generation history"
    >
      <div className="flex h-5 items-center gap-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
          History
        </h2>
        <button
          type="button"
          onClick={() => refetch()}
          className="interactive-lift flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          aria-label="Refresh history"
          title="Refresh history"
        >
          <span
            className="material-symbols-outlined leading-none"
            style={{ fontSize: 20, lineHeight: "20px" }}
          >
            refresh
          </span>
        </button>
      </div>

      <div
        ref={scrollRef}
        data-testid="generation-history-strip"
        className="mt-2 flex min-h-[4.5rem] min-w-0 items-center gap-2 overflow-x-auto pb-1"
      >
        {isLoading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <ThumbnailSkeleton key={i} />
            ))}
          </>
        )}

        {isError && !isLoading && (
          <div className="flex min-h-[4.5rem] min-w-[13rem] items-center gap-3 rounded-lg bg-[var(--surface-control)] px-3 text-sm text-[var(--text-secondary)]">
            <span className="min-w-0 flex-1">Loading failed</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="btn-secondary rounded-md px-3 py-1.5 text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && (!data || data.length === 0) && (
          <div className="flex min-h-[4.5rem] min-w-[12rem] items-center rounded-lg bg-[var(--surface-control)] px-3 text-sm text-[var(--text-secondary)]">
            No generations yet
          </div>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <>
            {currentGenerationTaskId && (
              <div
                data-testid="history-current-generation"
                className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-control)] text-[var(--text-secondary)]"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-info)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-info)]" />
                </span>
                <span className="text-[0.68rem]">Generating</span>
              </div>
            )}

            {data.map((item: GenerationHistoryItem) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onRestore?.(item.id)}
                className="interactive-lift group h-[4.5rem] w-[4.5rem] shrink-0 rounded-lg p-1.5"
                aria-label="Restore generation"
              >
                <span className="media-lens relative block aspect-square w-full rounded-md">
                  <Image
                    src={item.resultFileUrl}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-150 ease-out group-hover:scale-[1.03]"
                    sizes="72px"
                    unoptimized
                  />
                </span>
              </button>
            ))}

            <div ref={sentinelRef} className="h-1 w-1 shrink-0" />

            {isFetchingNextPage && <ThumbnailSkeleton />}
          </>
        )}
      </div>
    </section>
  );
}
