"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Layers3, Search, X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { StatePresenter } from "@/components/ui/state-presenter";
import { ReusePrecheckDialog } from "@/components/style-memory/reuse-precheck-dialog";
import { TemplateCard } from "@/components/workspace/template-card";
import { parseStatusFilter, useTemplateSearch, type StyleMemoryStatusFilter } from "@/hooks/use-template-search";
import { STYLE_MEMORY_LIST_QUERY_STORAGE_KEY } from "@/lib/style-memory-view-model";

/** 搜索提示承诺范围 = 实际服务端谓词口径（架构 §6.1；PRD 规则 8：不承诺未覆盖的信息） */
const SEARCH_ARIA_LABEL =
  "搜索 Style Memory：名称、说明、风格规则（含风格指纹与增强方向）、排除约束、变量名与标签";
const SEARCH_SCOPE_HINT =
  "可搜索名称、说明、风格规则（含风格指纹与增强方向）、排除约束、变量名与标签";

const STATUS_FILTER_OPTIONS: Array<{
  value: StyleMemoryStatusFilter;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "user_verified", label: "用户已验证" },
  { value: "pending_verification", label: "待验证" },
];

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      data-testid="style-memory-card-skeleton"
      className="style-memory-card flex min-h-[25rem] flex-col rounded-2xl border border-[var(--border-static)]/60 bg-[var(--surface-panel)] p-0"
    >
      <div className="style-memory-source aspect-[16/10] w-full animate-pulse rounded-t-2xl bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="flex flex-1 flex-col justify-between gap-3.5 p-4.5">
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-16 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="flex gap-1.5">
            <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
          </div>
        </div>
        <div className="h-14 w-full animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none" />
        <div className="h-9 w-full animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function StyleMemoryPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // plan-03 确认导航约定：删除等确认类动作导航回列表时，初始焦点落页面首要内容
  const listTitleRef = useRef<HTMLHeadingElement>(null);

  // URL 条件恢复：search / status / cursor 以 URL 为初始来源（plan-04 架构 §6.1）
  const {
    templates,
    isLoading,
    isError,
    error,
    isAuthRequired,
    search,
    setSearch,
    status,
    setStatus,
    isSearching,
  } = useTemplateSearch({
    initialSearch: searchParams.get("search") ?? "",
    initialStatus: parseStatusFilter(searchParams.get("status")),
    initialCursor: searchParams.get("cursor"),
  });

  const hasSearched = search.trim().length > 0;
  const hasActiveFilters = hasSearched || status !== "all";
  // 服务端已按谓词过滤并按 COALESCE(last_used, updated_at) DESC 排序；
  // 前端不做二次过滤或排序（plan-04：搜索/筛选与可见信息一致）
  const memories = useMemo(() => templates ?? [], [templates]);
  const hasMemories = memories.length > 0;

  const isFetchFailure = !isLoading && isError;
  const showAuthRequired = isFetchFailure && isAuthRequired;
  const showFailedRecoverable = isFetchFailure && !isAuthRequired;
  const showEmpty =
    !isLoading && !isFetchFailure && !hasSearched && status === "all" && !hasMemories;
  const showNoResults =
    !isLoading && !isFetchFailure && hasActiveFilters && !hasMemories;
  const showGrid = !isLoading && !isFetchFailure && hasMemories;
  // 服务不可用（503 等）时保留搜索/筛选与当前内容可见（PRD AC-10）
  const showToolbar = !showAuthRequired;

  const resultLabel = `${memories.length} 条`;

  /** URL 条件持久化：search / status 写入 query（浅替换，保留其余参数如 cursor/focus） */
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = search.trim();
    if (trimmed) {
      params.set("search", trimmed);
    } else {
      params.delete("search");
    }
    if (status !== "all") {
      params.set("status", status);
    } else {
      params.delete("status");
    }

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }

    // plan-05：同步记录列表原查询，详情页「返回列表」/删除确认导航恢复原条件
    // （AC-07；sessionStorage 不可用时降级为无查询返回）
    try {
      window.sessionStorage.setItem(STYLE_MEMORY_LIST_QUERY_STORAGE_KEY, query);
    } catch {
      // 忽略：隐私模式等场景下 sessionStorage 不可写
    }
  }, [search, status, pathname, router, searchParams]);

  // plan-03 确认导航约定：页面挂载后初始焦点置于页面主标题（键盘旅程不断焦）
  useEffect(() => {
    listTitleRef.current?.focus();
  }, []);

  // plan-05（Task 5）: `focus` 查询参数定位（高亮在 URL 清理后保留）
  const focusParam = searchParams.get("focus");
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    if (focusParam) {
      setPendingFocusId(focusParam);
    }
  }, [focusParam]);

  useEffect(() => {
    if (!pendingFocusId || isLoading) return;

    const target = memories.find((memory) => memory.id === pendingFocusId) ?? null;
    if (target) {
      setFocusedId(target.id);
    }
    setPendingFocusId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pendingFocusId, isLoading, memories, router, pathname, searchParams]);

  useEffect(() => {
    if (!focusedId) return;
    requestAnimationFrame(() => {
      document
        .querySelector('[data-testid="style-memory-card"][data-focused="true"]')
        ?.scrollIntoView?.({ block: "center" });
    });
  }, [focusedId]);

  // Global keyboard shortcut: `/` or `Cmd+K` focuses the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const goToWorkspace = useCallback(() => {
    router.push("/workspace");
  }, [router]);

  // plan-07：卡片「使用」接管为复用预检（AC-06）——不再直接预写快照/跳转，
  // 由预检弹层负责影响判定、必填变量门与确认后的快照握手。
  const [precheckMemoryId, setPrecheckMemoryId] = useState<string | null>(null);
  const handleUseTemplate = useCallback((id: string) => {
    setPrecheckMemoryId(id);
  }, []);
  const closePrecheck = useCallback(() => setPrecheckMemoryId(null), []);

  const handleRetry = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["templates"] });
    router.refresh();
  }, [queryClient, router]);

  const handleLogin = useCallback(() => {
    // 401 保留查询条件：登录入口携带原 search/status 返回原入口（PRD AC-10）
    const query = searchParams.toString();
    const returnUrl = query ? `${pathname}?${query}` : pathname;
    router.push(`/api/auth/signin?callbackUrl=${encodeURIComponent(returnUrl)}`);
  }, [router, pathname, searchParams]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setStatus("all");
  }, [setSearch, setStatus]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--surface-page)]"
      data-testid="style-memory-page"
    >
      {/* Precision Workbench Header */}
      <header className="shrink-0 px-4 pb-4 pt-6 sm:px-6 lg:px-8 lg:pb-5 lg:pt-7">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <h1
                ref={listTitleRef}
                tabIndex={-1}
                className="min-w-0 text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)] outline-none lg:text-[2.5rem]"
              >
                Style Memory
              </h1>
              {!isLoading && !isFetchFailure && hasMemories && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-static)]/60 bg-[var(--surface-control)]/80 px-2.5 py-0.5 font-mono text-xs font-medium text-[var(--text-secondary)] shadow-sm">
                  <AppIcon icon={Layers3} size={13} className="text-[var(--accent-primary)]" />
                  {memories.length} 已保存
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              保存值得复用、能够说明依据的风格规则。
            </p>
          </div>
          {showGrid && (
            <button
              type="button"
              onClick={goToWorkspace}
              className="btn-secondary inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium shadow-sm transition-all hover:border-[var(--border-interactive)] active:scale-[0.98]"
            >
              <AppIcon icon={ArrowLeft} size={15} />
              打开工作区
            </button>
          )}
        </div>
      </header>

      {/* Filter and Search Toolbar */}
      {showToolbar && (
        <section
          aria-label="Style Memory 搜索与筛选"
          className="shrink-0 space-y-3 px-4 pb-4 sm:px-6 lg:px-8"
        >
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <label className="style-memory-search group relative flex min-h-11 min-w-0 flex-1 items-center rounded-xl px-3 transition-all sm:max-w-xl">
              <span className="sr-only">{SEARCH_ARIA_LABEL}</span>
              <AppIcon
                icon={Search}
                size={16}
                className="shrink-0 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                aria-label={SEARCH_ARIA_LABEL}
                title={SEARCH_SCOPE_HINT}
                onChange={(event) => setSearch(event.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="搜索名称、风格规则或变量"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              {isSearching && (
                <span
                  className="shrink-0 text-xs font-medium text-[var(--text-muted)]"
                  aria-live="polite"
                >
                  搜索中
                </span>
              )}
              {hasSearched && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="interactive-lift flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="清除搜索"
                >
                  <AppIcon icon={X} size={14} />
                </button>
              )}
              {!hasSearched && (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none hidden items-center rounded border border-[var(--border-static)] bg-[var(--surface-low)]/80 px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--text-muted)] shadow-xs sm:inline-flex"
                >
                  /
                </kbd>
              )}
            </label>

            {/* Result count + sort (server-ordered by recent use) */}
            <div className="flex shrink-0 items-center gap-3">
              {!isLoading && (
                <p
                  className="font-mono text-xs font-medium text-[var(--text-muted)]"
                  aria-live="polite"
                >
                  {resultLabel}
                </p>
              )}
              <p className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--text-muted)]">
                <AppIcon icon={Clock3} size={12} />
                排序：最近使用
              </p>
            </div>
          </div>

          {/* Verification status filter pills（与搜索组合生效，服务端谓词） */}
          {!isLoading && (
            <div
              className="flex flex-wrap items-center gap-1.5 pt-1"
              role="group"
              aria-label="验证状态筛选"
            >
              {STATUS_FILTER_OPTIONS.map((option) => {
                const active = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? "bg-[var(--accent-primary)] text-white shadow-xs"
                        : "border border-[var(--border-static)]/60 bg-[var(--surface-control)]/60 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline"
                >
                  <AppIcon icon={X} size={12} />
                  清除筛选
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Main Grid & State Presenter View */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6 lg:px-8">
        <div className="w-full">
          {isLoading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`style-memory-skeleton-${index}`} />
              ))}
            </div>
          )}

          {showAuthRequired && (
            <StatePresenter
              status="authRequired"
              title="登录后查看云端 Style Memory"
              description="云端 Style Memory 需要登录后查看。当前工作区内容保持不变，登录后会带着当前的搜索与筛选条件回到这里。"
              primaryActionLabel="登录"
              secondaryActionLabel="返回工作区"
              onPrimaryAction={handleLogin}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {showFailedRecoverable && (
            <StatePresenter
              status="failedRecoverable"
              title="Style Memory 服务暂不可用"
              description={`${error?.message ?? "Style Memory 服务暂时无法加载。"}当前搜索与筛选条件已保留，重试后会恢复原视图；工作区不受影响。`}
              primaryActionLabel="重试"
              secondaryActionLabel="返回工作区"
              onPrimaryAction={handleRetry}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {showEmpty && (
            <section
              aria-live="polite"
              className="ai-panel surface-panel rounded-lg p-6"
              data-status="empty"
            >
              <div className="flex items-start gap-4">
                <span
                  className="status-tone-dot mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full text-[var(--status-neutral-text)] bg-current opacity-70"
                  data-testid="state-presenter-tone"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-[var(--text-primary)]">
                    还没有保存的 Style Memory
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                    可以从工作区保存待验证方向，或从完成的 Iteration 保存用户已验证方向。
                    保存后会在这里保留验证状态、核心规则与代表结果。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href="/workspace"
                      className="btn-primary rounded-md px-4 py-2 text-sm font-medium"
                    >
                      打开工作区
                    </Link>
                    <Link
                      href="/workspace/iterations"
                      className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                    >
                      查看 Iterations
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}

          {showNoResults && (
            <StatePresenter
              status="noResults"
              title="没有匹配的 Style Memory"
              description={`已按名称、说明、风格规则（含风格指纹与增强方向）、排除约束、变量名与标签搜索“${search.trim()}”${
                status !== "all" ? "，并按验证状态筛选" : ""
              }。当前条件已保留，可清除条件查看全部，或返回工作区。`}
              primaryActionLabel="清除搜索与筛选"
              secondaryActionLabel="返回工作区"
              onPrimaryAction={clearAllFilters}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {showGrid && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {memories.map((memory) => (
                <TemplateCard
                  key={memory.id}
                  template={memory}
                  focused={focusedId === memory.id}
                  onUse={handleUseTemplate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* plan-07：复用预检弹层（AC-06）——列表卡片「使用」入口的接管宿主 */}
      <ReusePrecheckDialog
        open={precheckMemoryId !== null}
        memoryId={precheckMemoryId}
        onClose={closePrecheck}
      />
    </div>
  );
}

/** plan-05: useSearchParams 需要 Suspense 边界（Next.js 15 要求） */
export default function StyleMemoryPage() {
  return (
    <Suspense fallback={null}>
      <StyleMemoryPageInner />
    </Suspense>
  );
}
