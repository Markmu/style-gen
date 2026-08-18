"use client";

import { useQuery } from "@tanstack/react-query";
import type { IterationDetail } from "@/types/models";

/**
 * plan-03（ADR-7 / 架构 §6.5）: Iteration Memory 详情 hook。
 *
 * - 加载 `GET /api/generation/[id]`；`detail.status === 'processing'` 时每 5s
 *   轮询同一端点，观测到 completed/failed 原地替换并停止轮询。
 * - 轮询连续失败 3 次 → 停止轮询并标记 `updatesUnavailable`（"更新暂不可用 +
 *   重试"），保留已展示内容。
 * - `selectedId` 变化即切换 query key：在途响应只写回旧 key 的缓存，新选中
 *   条目从头加载（防串台）；旧 key 失去订阅后轮询自然停止。
 */

/** 详情 processing 轮询间隔（架构 §6.5） */
export const ITERATION_DETAIL_POLL_INTERVAL_MS = 5000;
/** 轮询连续失败停止阈值（架构 §6.5：连续失败 3 次） */
export const ITERATION_DETAIL_MAX_POLL_FAILURES = 3;

export class IterationDetailError extends Error {
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
    this.name = "IterationDetailError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? options.status >= 500;
  }
}

async function fetchIterationDetail(
  id: string,
  signal: AbortSignal,
): Promise<IterationDetail> {
  const res = await fetch(`/api/generation/${id}`, { signal });
  if (!res.ok) {
    let body: { error?: string; code?: string; retryable?: boolean } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // 保留默认错误信息
    }
    throw new IterationDetailError({
      message: body.error ?? "Failed to load the iteration detail",
      status: res.status,
      code: body.code,
      retryable: body.retryable,
    });
  }
  return (await res.json()) as IterationDetail;
}

/** 详情状态机（架构 §3.3 详情侧）；idle = 未选择条目 */
export type IterationDetailStatus = "idle" | "loading" | "ready" | "error";

export function useIterationDetail(selectedId: string | null) {
  const query = useQuery({
    queryKey: ["iteration-detail", selectedId],
    queryFn: ({ signal }) => fetchIterationDetail(selectedId!, signal),
    enabled: !!selectedId,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (current) => {
      // processing 期间 5s 轮询；连续失败 3 次停止（保留最后内容）
      if (
        current.state.data?.status === "processing" &&
        current.state.fetchFailureCount < ITERATION_DETAIL_MAX_POLL_FAILURES
      ) {
        return ITERATION_DETAIL_POLL_INTERVAL_MS;
      }
      return false;
    },
  });

  // 已有内容时轮询失败保留内容（updatesUnavailable），只有首屏失败才进入错误位
  const status: IterationDetailStatus = !selectedId
    ? "idle"
    : query.data
      ? "ready"
      : query.isError
        ? "error"
        : "loading";

  const updatesUnavailable =
    status === "ready" &&
    query.data?.status === "processing" &&
    query.isError &&
    query.failureCount >= ITERATION_DETAIL_MAX_POLL_FAILURES;

  const error = query.error instanceof Error ? query.error : null;

  /** 错误位 Retry / "更新暂不可用" Retry 共用：成功即清零 failureCount 并恢复轮询节奏 */
  const refetch = () => {
    if (!selectedId) return;
    void query.refetch();
  };

  return {
    detail: query.data ?? null,
    status,
    error,
    /** processing 详情仍在轮询中 */
    isPolling:
      status === "ready" &&
      query.data?.status === "processing" &&
      !updatesUnavailable,
    updatesUnavailable,
    retry: refetch,
    retryUpdates: refetch,
  };
}

export type UseIterationDetailResult = ReturnType<typeof useIterationDetail>;
