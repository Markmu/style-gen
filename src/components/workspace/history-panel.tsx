"use client";

import { useEffect, useRef } from "react";
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

  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 30) return `${diffDay}天前`;
  return date.toLocaleDateString("zh-CN");
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
  const {
    data,
    isLoading,
    isError,
    error: _error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useHistoryList();

  // 滚动到底部加载更多
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface-mid)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-bold text-[var(--text-primary)]">History</h2>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          aria-label="刷新历史记录"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
        </button>
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
              加载失败，点击重试
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-bright)]"
            >
              重试
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-center text-sm text-[var(--text-secondary)]">
              还没有生成记录
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
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                <span className="text-xs text-[var(--text-secondary)]">生成中...</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 p-2">
              {data.map((item: GenerationHistoryItem) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onRestore?.(item.id)}
                  className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-[var(--surface-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
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
                <span className="text-xs text-[var(--text-secondary)]">加载中...</span>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
