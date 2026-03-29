"use client";

import { useQuery } from "@tanstack/react-query";
import { signIn } from "next-auth/react";
import type { AnalysisTask } from "@/types/models";

const POLL_INTERVAL_MS = 2000;

/** 会话过期错误：API 返回 401 时抛出，不应重试 */
class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("会话已过期，请重新登录");
    this.name = "UnauthorizedError";
  }
}

async function fetchAnalysisTask(taskId: string): Promise<AnalysisTask> {
  const res = await fetch(`/api/analysis/${taskId}`);
  if (res.status === 401) {
    // 会话过期：引导重新登录，保留当前页面（架构 4.3 session_expired）
    signIn("google", { callbackUrl: window.location.pathname });
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ?? "Failed to fetch analysis task",
    );
  }
  return res.json() as Promise<AnalysisTask>;
}

export function useAnalysis(taskId: string | null): {
  data: AnalysisTask | null;
  isPolling: boolean;
  error: Error | null;
} {
  const { data, error, isFetching } = useQuery<AnalysisTask, Error>({
    queryKey: ["analysis", taskId],
    queryFn: () => fetchAnalysisTask(taskId!),
    enabled: !!taskId,
    retry: (_failureCount, err) => {
      // 401 不重试，直接引导登录
      if (err instanceof UnauthorizedError) return false;
      return _failureCount < 3;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") {
        return false;
      }
      // 401 错误时停止轮询
      if (query.state.error instanceof UnauthorizedError) {
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });

  return {
    data: data ?? null,
    isPolling: isFetching && !!taskId,
    error: error ?? null,
  };
}
