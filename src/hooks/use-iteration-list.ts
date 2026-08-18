"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { IterationListItem, IterationStatusFilter } from "@/types/models";

/**
 * plan-02: Iteration Memory 列表数据 hook（架构 §6.1 列表读链路）。
 *
 * 首屏加载与"加载较早"共用 keyset 游标分页；筛选/搜索变化即更换 query key，
 * 过期响应由 React Query 按 key 隔离，快速连续切换筛选时以最后一次为准。
 */

export const ITERATION_LIST_PAGE_SIZE = 20;

/**
 * plan-03（ADR-7）: 列表当前窗口含 processing 条目时的低频重拉间隔。
 * 仅替换条目数据，不重置滚动；无 processing 即停（架构 §6.5）。
 */
export const ITERATION_LIST_PROCESSING_REFRESH_MS = 10000;

export class IterationListError extends Error {
  status: number;
  code: string | null;
  retryable: boolean;

  constructor(options: {
    message: string;
    status: number;
    code?: string;
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = "IterationListError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? options.status >= 500;
  }
}

interface IterationListPage {
  items: IterationListItem[];
  nextCursor: string | null;
}

async function fetchIterationListPage(params: {
  q: string;
  status: IterationStatusFilter;
  cursor: string | null;
}): Promise<IterationListPage> {
  const search = new URLSearchParams();
  search.set("pageSize", String(ITERATION_LIST_PAGE_SIZE));
  search.set("status", params.status);
  if (params.q.length > 0) {
    search.set("q", params.q);
  }
  if (params.cursor) {
    search.set("cursor", params.cursor);
  }

  const res = await fetch(`/api/generation?${search.toString()}`);
  if (!res.ok) {
    let body: { error?: string; code?: string; retryable?: boolean } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // 保留默认错误信息
    }
    throw new IterationListError({
      message: body.error ?? "Failed to load Iteration Memory",
      status: res.status,
      code: body.code,
      retryable: body.retryable,
    });
  }

  const data = (await res.json()) as Partial<IterationListPage>;
  return {
    items: Array.isArray(data.items) ? (data.items as IterationListItem[]) : [],
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
  };
}

/** 列表状态机（架构 §3.3 列表侧；empty 与 no-match 区分） */
export type IterationListPhase =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "no-match"
  | "error";

function dedupeById(items: IterationListItem[]): IterationListItem[] {
  const seen = new Set<string>();
  const unique: IterationListItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

export function useIterationList(params: {
  q: string;
  status: IterationStatusFilter;
}) {
  const trimmedQ = params.q.trim();

  const query = useInfiniteQuery({
    queryKey: ["iteration-list", { q: trimmedQ, status: params.status }],
    queryFn: ({ pageParam }) =>
      fetchIterationListPage({
        q: trimmedQ,
        status: params.status,
        cursor: (pageParam as string | null) ?? null,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: IterationListPage) =>
      lastPage.nextCursor ?? undefined,
    retry: false,
    refetchOnWindowFocus: false,
    // plan-03（ADR-7）: 当前窗口含 processing 条目时 10s 低频重拉当前查询，
    // 使"完成后状态面替换为真实结果"对停留在列表的用户可见。
    refetchInterval: (current) => {
      const pages = current.state.data?.pages ?? [];
      const hasProcessing = pages.some((page) =>
        page.items.some((item) => item.status === "processing"),
      );
      return hasProcessing ? ITERATION_LIST_PROCESSING_REFRESH_MS : false;
    },
  });

  const pages = query.data?.pages ?? [];
  const items = dedupeById(pages.flatMap((page) => page.items));
  const hasItems = items.length > 0;
  const isError = query.isError;
  const error = query.error instanceof Error ? query.error : null;
  const isUnauthorized =
    isError &&
    error instanceof IterationListError &&
    error.status === 401;
  /** 当前查询是否带条件（区分"无任何记录"与"当前查询无匹配"） */
  const hasActiveQuery = trimmedQ.length > 0 || params.status !== "all";

  const phase: IterationListPhase = isError
    ? "error"
    : query.isPending
      ? "loading"
      : hasItems
        ? "ready"
        : hasActiveQuery
          ? "no-match"
          : "empty";

  return {
    items,
    phase,
    error,
    errorStatus: error instanceof IterationListError ? error.status : null,
    isUnauthorized,
    hasNextPage: query.hasNextPage ?? false,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    /** 当前已加载深度对应的下一页游标（视图 store 游标栈记录） */
    nextCursor:
      pages.length > 0 ? pages[pages.length - 1].nextCursor : null,
    /** 加载较早失败：已加载条目保留，仅加载动作给出提示（边界场景表） */
    isLoadEarlierError: isError && hasItems,
    loadEarlier: () => query.fetchNextPage(),
    retry: () => query.refetch(),
  };
}

export type UseIterationListResult = ReturnType<typeof useIterationList>;
