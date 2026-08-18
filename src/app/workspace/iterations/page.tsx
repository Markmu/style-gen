"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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
      <header className="shrink-0 px-4 pb-4 pt-6 sm:px-6 lg:px-8 lg:pb-5 lg:pt-8">
        <div className="max-w-2xl">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)] lg:text-[2.25rem]">
            Iteration Memory
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Every generation attempt across statuses. Search by prompt keyword,
            then open an iteration to continue its direction.
          </p>
        </div>
      </header>

      <section
        aria-label="Iteration Memory filters"
        className="shrink-0 px-4 pb-4 sm:px-6 lg:px-8"
      >
        {areControlsReady ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <label className="style-memory-search group relative flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-3 sm:max-w-md">
              <span className="sr-only">Search iterations</span>
              <AppIcon
                icon={Search}
                size={18}
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
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>

            <div
              role="radiogroup"
              aria-label="Status filter"
              className="flex flex-wrap items-center gap-2"
            >
              {STATUS_FILTERS.map((filter) => (
                <label
                  key={filter.value}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    status === filter.value
                      ? "border-[var(--accent-primary)] text-[var(--accent-primary)]"
                      : "border-[var(--border-static)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="iteration-status-filter"
                    value={filter.value}
                    checked={status === filter.value}
                    onChange={() => applyFilter(q, filter.value)}
                    className="h-3.5 w-3.5 accent-[var(--accent-primary)]"
                  />
                  <span>{filter.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="h-11 min-w-0 flex-1 animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none sm:max-w-md" />
            <div className="h-8 w-64 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
          </div>
        )}
      </section>

      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-6 sm:px-6 lg:flex-row lg:px-8 lg:pb-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            <>
              <p
                className="mb-2 shrink-0 text-xs font-medium text-[var(--text-muted)]"
                aria-live="polite"
              >
                {list.items.length}{" "}
                {list.items.length === 1 ? "iteration" : "iterations"}
              </p>
              <IterationList
                items={list.items}
                selectedId={selectedId}
                onSelect={handleSelect}
                hasNextPage={list.hasNextPage}
                isFetchingNextPage={list.isFetchingNextPage}
                loadEarlierError={list.isLoadEarlierError}
                onLoadEarlier={() => list.loadEarlier()}
              />
            </>
          )}
        </div>

        <aside
          aria-label="Iteration detail"
          className="hidden min-h-0 w-96 shrink-0 flex-col lg:flex"
        >
          {selectedId === null ? (
            <div className="surface-panel flex h-full flex-col gap-3 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Iteration detail
              </h2>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                Select an iteration to open its full creation context: reference,
                evidence, prompt, and settings. The list keeps your search,
                filter, and position while the detail is open.
              </p>
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
