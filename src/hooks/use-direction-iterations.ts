"use client";

import { useQuery } from "@tanstack/react-query";
import type { DirectionIterationFeed } from "@/types/models";

/**
 * plan-05（ADR-5 / 架构 §6.4）：当前方向结果 feed hook。
 *
 * - 请求 `GET /api/generation?view=direction&analysisTaskId=…&pageSize=5`；
 *   分析方向变化时 query key 隔离（在途响应只写回旧 key，防串台）。
 * - feed 存在 active（pending/processing）时每 2-3 秒刷新；终态后停止。
 *   当前主动任务仍由 `useGeneration` 详情轮询负责，两通道互不替代。
 * - 查询/刷新失败保留 previous data（React Query 缓存不清空、草稿不受影响），
 *   由调用方提供重试；不回退成空结果、不伪造终态。
 * - 只消费分组 DTO：completed/active/latestFailure 三组独立，不把 active 或
 *   latestFailure 混入 completed 五张缩略图。
 */

/** active 存在时的刷新间隔（架构 §8.1：processing 时 2-3 秒一次） */
export const DIRECTION_FEED_POLL_INTERVAL_MS = 3000;

/** completed 限额（服务端契约 1-5；本次结果区固定取五条） */
export const DIRECTION_FEED_PAGE_SIZE = 5;

export class DirectionFeedError extends Error {
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
    this.name = "DirectionFeedError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? options.status >= 500;
  }
}

const EMPTY_DIRECTION_FEED: DirectionIterationFeed = {
  completed: [],
  active: null,
  latestFailure: null,
};

/**
 * 宽松解析分组 DTO：
 * - `completed` 必须是数组；`active`/`latestFailure` 缺省归 null。
 * - 非 feed 形态（如旧 mock 的 `{items:[]}` 列表响应）按空方向 feed 处理，
 *   不把普通列表条目伪造成方向结果。
 */
function parseDirectionFeed(payload: unknown): DirectionIterationFeed {
  if (!payload || typeof payload !== "object") return EMPTY_DIRECTION_FEED;
  const candidate = payload as Partial<DirectionIterationFeed>;
  if (!Array.isArray(candidate.completed)) return EMPTY_DIRECTION_FEED;
  return {
    completed: candidate.completed,
    active: candidate.active ?? null,
    latestFailure: candidate.latestFailure ?? null,
  };
}

async function fetchDirectionFeed(
  analysisTaskId: string,
  signal: AbortSignal,
): Promise<DirectionIterationFeed> {
  const params = new URLSearchParams({
    view: "direction",
    analysisTaskId,
    pageSize: String(DIRECTION_FEED_PAGE_SIZE),
  });
  const res = await fetch(`/api/generation?${params.toString()}`, { signal });
  if (!res.ok) {
    let body: { error?: string; code?: string; retryable?: boolean } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // 保留默认错误信息
    }
    throw new DirectionFeedError({
      message: body.error ?? "Failed to load the direction results",
      status: res.status,
      code: body.code,
      retryable: body.retryable,
    });
  }
  return parseDirectionFeed(await res.json());
}

/** 方向 feed query key（方向 key = analysisTaskId，ADR-1） */
export function directionIterationsQueryKey(
  analysisTaskId?: string | null,
): unknown[] {
  return analysisTaskId
    ? ["direction-iterations", analysisTaskId]
    : ["direction-iterations"];
}

export function useDirectionIterations(analysisTaskId: string | null) {
  const query = useQuery({
    queryKey: directionIterationsQueryKey(analysisTaskId),
    queryFn: ({ signal }) => fetchDirectionFeed(analysisTaskId!, signal),
    enabled: !!analysisTaskId,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (current) => {
      // active 存在时定时刷新；终态（active 清空）后停止（架构 §6.4.5）
      if (current.state.data?.active) {
        return DIRECTION_FEED_POLL_INTERVAL_MS;
      }
      return false;
    },
  });

  // 刷新失败时 React Query 保留最后一次成功 data（previous data 不清空），
  // 页面据此同时展示错误位与既有缩略图/草稿（架构 §8.2 L2）
  return {
    feed: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    /** active 存在，feed 处于定时刷新节奏中（终态后停止） */
    isPolling: !!query.data?.active,
    refetch: () => {
      if (!analysisTaskId) return;
      void query.refetch();
    },
  };
}

export type UseDirectionIterationsResult = ReturnType<
  typeof useDirectionIterations
>;
