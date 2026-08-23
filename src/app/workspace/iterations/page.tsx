"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PanelRightOpen, Search, X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { IterationList } from "@/components/iterations/iteration-list";
import {
  IterationDetailErrorFace,
  IterationDetailPanel,
  IterationDetailSkeleton,
} from "@/components/iterations/iteration-detail-panel";
import {
  IterationEmptyFace,
  IterationListErrorFace,
  IterationLoadingSkeleton,
  IterationNoMatchFace,
  IterationUnauthorizedFace,
} from "@/components/iterations/iteration-state-faces";
import { useIterationDetail } from "@/hooks/use-iteration-detail";
import { useIterationList } from "@/hooks/use-iteration-list";
import { useIterationMemoryView } from "@/hooks/use-iteration-memory-view";
import type { IterationStatusFilter } from "@/types/models";

/**
 * plan-02 + plan-03: `/workspace/iterations` — Iteration Memory master-detail 页。
 *
 * 列表侧（plan-02）：搜索 + 状态筛选 + 三态条目 + 加载较早 + 五种状态面。
 * 详情侧（plan-03）：selectedId 驱动三态详情面板（processing 5s 轮询原地迁移）、
 * 上一条/下一条（跨页边界自动加载较早后继续）、详情打开/关闭只改 selectedId，
 * 不触碰列表状态与滚动（架构 §3.3 master-detail 正交）。
 * 视图状态由 workspace layout 层的 store 保活并同步 URL（ADR-6）。
 */

const STATUS_FILTERS: ReadonlyArray<{
  value: IterationStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const STATUS_FILTER_VALUES = new Set<string>(STATUS_FILTERS.map((f) => f.value));

const MAX_SEARCH_LENGTH = 100;

/** URL q：trim + ≤100 字符（API 契约，架构 §6.1 步骤 3） */
function sanitizeQ(raw: string | null): string {
  return (raw ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

function parseStatusFilter(raw: string | null): IterationStatusFilter {
  return raw !== null && STATUS_FILTER_VALUES.has(raw)
    ? (raw as IterationStatusFilter)
    : "all";
}

function IterationMemoryPageInner() {
  const view = useIterationMemoryView();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { q, status, selectedId } = view;

  const list = useIterationList({ q, status });
  const detail = useIterationDetail(selectedId);

  const viewRef = useRef(view);
  viewRef.current = view;
  // store 的 action 均为稳定引用（Provider useCallback），解构后供 deps 使用
  const { setFilter, pushCursor, setSelected } = view;

  // 筛选控件仅在客户端挂载后渲染：SSR HTML 中的控件会在 hydration 前接受
  // 用户输入，而 hydration 会以服务端状态复位控件，导致水合前的交互丢失。
  const [areControlsReady, setAreControlsReady] = useState(false);
  useEffect(() => {
    setAreControlsReady(true);
  }, []);

  // URL → store：仅在挂载时执行一次（页面初始化 URL 优先于 store 记忆值）。
  // 挂载期间 URL 变化均来自控件自身的 router.replace 写回，持续同步会在
  // 连续筛选（多次 replace 排队提交）时用过期的中间 URL 回滚最新筛选。
  const didSyncFromUrlRef = useRef(false);
  useEffect(() => {
    if (didSyncFromUrlRef.current) return;
    didSyncFromUrlRef.current = true;
    const urlQ = sanitizeQ(searchParams.get("q"));
    const urlStatus = parseStatusFilter(searchParams.get("status"));
    const current = viewRef.current;
    if (urlQ !== current.q.trim() || urlStatus !== current.status) {
      current.setFilter(urlQ, urlStatus);
    }
  }, [searchParams]);

  // 游标栈记录（plan-03 上一条/下一条消费）
  useEffect(() => {
    if (list.nextCursor) {
      pushCursor(list.nextCursor);
    }
  }, [list.nextCursor, pushCursor]);

  // 控件变更 → store + URL 写回（router.replace 不污染历史栈）
  const applyFilter = useCallback(
    (nextQ: string, nextStatus: IterationStatusFilter) => {
      const boundedQ = nextQ.slice(0, MAX_SEARCH_LENGTH);
      const params = new URLSearchParams();
      params.set("status", nextStatus);
      const trimmedQ = boundedQ.trim();
      if (trimmedQ.length > 0) {
        params.set("q", trimmedQ);
      }
      setFilter(boundedQ, nextStatus);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, setFilter],
  );

  const goToWorkspace = useCallback(() => {
    router.push("/workspace");
  }, [router]);

  const handleSignIn = useCallback(() => {
    const callbackUrl = encodeURIComponent("/workspace/iterations");
    router.push(`/api/auth/signin?callbackUrl=${callbackUrl}`);
  }, [router]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelected(selectedId === id ? null : id);
    },
    [selectedId, setSelected],
  );

  /** 关闭详情只清 selectedId（DClosed），列表状态与滚动不动（架构 §3.3） */
  const handleCloseDetail = useCallback(() => {
    setSelected(null);
  }, [setSelected]);

  // 上一条（更新）/ 下一条（更旧）：基于当前列表条目序列计算相邻 id；
  // 下一条跨页边界时先"加载较早"，新页到位后继续切换（Task 6）。
  const [isAdvanceAfterLoadPending, setIsAdvanceAfterLoadPending] =
    useState(false);
  const detailIndex = selectedId
    ? list.items.findIndex((item) => item.id === selectedId)
    : -1;
  const hasOlderLoaded = detailIndex >= 0 && detailIndex < list.items.length - 1;
  const hasDetailPrevious = detailIndex > 0;
  const hasDetailNext = hasOlderLoaded || (detailIndex >= 0 && list.hasNextPage);

  const goPreviousDetail = () => {
    if (detailIndex > 0) {
      setSelected(list.items[detailIndex - 1].id);
    }
  };

  const goNextDetail = () => {
    if (detailIndex < 0) return;
    if (detailIndex < list.items.length - 1) {
      setSelected(list.items[detailIndex + 1].id);
      return;
    }
    if (list.hasNextPage) {
      setIsAdvanceAfterLoadPending(true);
      void list.loadEarlier();
    }
  };

  useEffect(() => {
    if (!isAdvanceAfterLoadPending) return;
    if (detailIndex < 0 || !list.hasNextPage) {
      setIsAdvanceAfterLoadPending(false);
      return;
    }
    if (detailIndex < list.items.length - 1) {
      setIsAdvanceAfterLoadPending(false);
      setSelected(list.items[detailIndex + 1].id);
    }
  }, [
    isAdvanceAfterLoadPending,
    detailIndex,
    list.items,
    list.hasNextPage,
    setSelected,
  ]);

  // 内容互斥渲染：状态面 / 骨架 / 列表（架构 §3.3 列表状态机）
  type IterationListContent =
    | "unauthorized"
    | "error"
    | "empty"
    | "no-match"
    | "skeleton"
    | "list";
  const content: IterationListContent = (() => {
    if (list.isUnauthorized) return "unauthorized";
    if (list.phase === "error" && list.items.length === 0) return "error";
    if (list.phase === "empty") return "empty";
    if (list.phase === "no-match") return "no-match";
    // 挂载即进入 loading，idle 不可观察；其余兜底为列表态
    if (list.phase === "loading") return "skeleton";
    return "list";
  })();

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="iteration-memory-page"
    >
      <header className={`shrink-0 px-4 pb-4 pt-5 sm:px-6 lg:px-8 ${selectedId ? "hidden xl:block" : ""}`}>
        <div className="mx-auto w-full max-w-[100rem]">
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.025em] text-[var(--text-primary)]">
            Iteration Memory
          </h1>
          <p className="mt-1 max-w-[65ch] text-[0.8125rem] leading-5 text-[var(--text-secondary)]">
            Find a previous generation, inspect its evidence, and continue from
            the context that produced it.
          </p>
        </div>
      </header>

      <div className={`min-h-0 flex-1 px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 ${selectedId ? "pt-4 xl:pt-0" : ""}`}>
        <div
          data-testid="iteration-workbench"
          className="surface-panel mx-auto grid h-full min-h-0 w-full max-w-[100rem] overflow-hidden rounded-2xl border border-[var(--border-static)] bg-[var(--surface-panel)] shadow-xs xl:grid-cols-[minmax(26rem,30rem)_minmax(0,1fr)]"
        >
          <section
            aria-label="Iteration library"
            className={`min-h-0 min-w-0 flex-col bg-[var(--surface-panel)] ${
              selectedId ? "hidden xl:flex" : "flex"
            }`}
          >
            <div
              aria-label="Iteration Memory filters"
              className="shrink-0 space-y-3 border-b border-[var(--border-static)] p-3.5 sm:p-4"
            >
              {areControlsReady ? (
                <>
                  <label className="style-memory-search group relative flex min-h-10 w-full min-w-0 items-center rounded-lg px-3">
                    <span className="sr-only">Search iterations</span>
                    <AppIcon
                      icon={Search}
                      size={17}
                      className="shrink-0 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
                    />
                    <input
                      type="text"
                      value={q}
                      maxLength={MAX_SEARCH_LENGTH}
                      onChange={(event) =>
                        applyFilter(event.currentTarget.value, status)
                      }
                      placeholder="Search iterations…"
                      className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[0.8125rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    />
                    {q.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          applyFilter("", status);
                        }}
                        aria-label="Clear search query"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]"
                      >
                        <AppIcon icon={X} size={14} />
                      </button>
                    )}
                  </label>

                  <div
                    role="radiogroup"
                    aria-label="Status filter"
                    className="iteration-filter-group"
                  >
                    {STATUS_FILTERS.map((filter) => {
                      const isSelected = status === filter.value;
                      return (
                        <label
                          key={filter.value}
                          data-selected={isSelected ? "true" : undefined}
                          className="iteration-filter-pill justify-center"
                        >
                          <input
                            type="radio"
                            name="iteration-status-filter"
                            value={filter.value}
                            checked={isSelected}
                            onChange={() => applyFilter(q, filter.value)}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                          <span className="pointer-events-none">{filter.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div aria-hidden="true" className="space-y-3">
                  <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none" />
                  <div className="h-9 w-full animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none" />
                </div>
              )}

              {content === "list" && (
                <p
                  className="text-[0.6875rem] font-medium text-[var(--text-muted)]"
                  aria-live="polite"
                >
                  {list.items.length} {list.items.length === 1 ? "iteration" : "iterations"}
                </p>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-2">
          {content === "unauthorized" ? (
            <IterationUnauthorizedFace
              onSignIn={handleSignIn}
              onBackToWorkspace={goToWorkspace}
            />
          ) : content === "error" ? (
            <IterationListErrorFace
              message={list.error?.message}
              onRetry={() => list.retry()}
              onBackToWorkspace={goToWorkspace}
            />
          ) : content === "empty" ? (
            <IterationEmptyFace
              onStartCreating={goToWorkspace}
              onBackToWorkspace={goToWorkspace}
            />
          ) : content === "no-match" ? (
            <IterationNoMatchFace
              onClearSearch={() => applyFilter("", status)}
              onSwitchFilter={() => applyFilter(q, "all")}
            />
          ) : content === "skeleton" ? (
            <IterationLoadingSkeleton />
          ) : (
            <IterationList
              items={list.items}
              selectedId={selectedId}
              onSelect={handleSelect}
              hasNextPage={list.hasNextPage}
              isFetchingNextPage={list.isFetchingNextPage}
              loadEarlierError={list.isLoadEarlierError}
              onLoadEarlier={() => list.loadEarlier()}
            />
          )}
            </div>
          </section>

          <aside
            aria-label="Iteration detail"
            className={`${selectedId ? "flex" : "hidden xl:flex"} min-h-0 min-w-0 flex-col border-[var(--border-static)] bg-[var(--surface-page)] xl:border-l`}
          >
            {selectedId === null ? (
              <div
                data-testid="iteration-detail-empty"
                className="flex h-full min-h-0 items-center justify-center px-8 py-12 text-center"
              >
                <div className="max-w-sm">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-static)] bg-[var(--surface-control)] text-[var(--accent-primary)]">
                    <AppIcon icon={PanelRightOpen} size={21} />
                  </span>
                  <h2 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                    Select an iteration
                  </h2>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">
                    Compare its reference and result, review the preserved
                    evidence, or continue from the same creative context.
                  </p>
                </div>
              </div>
            ) : detail.status === "error" ? (
              <IterationDetailErrorFace
                message={detail.error?.message}
                onRetry={detail.retry}
                onClose={handleCloseDetail}
              />
            ) : detail.status === "ready" && detail.detail ? (
              <IterationDetailPanel
                detail={detail.detail}
                onBackToList={handleCloseDetail}
                onPrevious={goPreviousDetail}
                onNext={goNextDetail}
                hasPrevious={hasDetailPrevious}
                hasNext={hasDetailNext}
                updatesUnavailable={detail.updatesUnavailable}
                onRetryUpdates={detail.retryUpdates}
              />
            ) : (
              <IterationDetailSkeleton />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Suspense boundary for useSearchParams() (Next.js 15 requirement) */
export default function IterationMemoryPage() {
  return (
    <Suspense fallback={<IterationLoadingSkeleton className="p-4" />}>
      <IterationMemoryPageInner />
    </Suspense>
  );
}
