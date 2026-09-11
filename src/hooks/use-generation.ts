"use client";

import { useQuery } from "@tanstack/react-query";
import type { GenerationTask } from "@/types/models";

const POLL_INTERVAL_MS = 2000;

/** GET /api/generation/:id 的响应类型 */
export interface GenerationTaskWithResult extends GenerationTask {
  resultFileUrl: string | null;
}

/** 会话过期错误：API 返回 401 时抛出，不应Retry */
class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Your session expired. Please log in again.");
    this.name = "UnauthorizedError";
  }
}

async function fetchGenerationTask(
  taskId: string,
): Promise<GenerationTaskWithResult> {
  const res = await fetch(`/api/generation/${taskId}`);
  if (res.status === 401) {
    // 会话过期：引导重新Log in，保留当前页面（架构 4.3 session_expired）
    window.dispatchEvent(new Event("workspace-session-expired"));
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ??
        "Failed to fetch generation task",
    );
  }
  return res.json() as Promise<GenerationTaskWithResult>;
}

export function useGeneration(taskId: string | null): {
  data: GenerationTaskWithResult | null;
  isPolling: boolean;
  error: Error | null;
} {
  const { data, error, isFetching } = useQuery<
    GenerationTaskWithResult,
    Error
  >({
    queryKey: ["generation", taskId],
    queryFn: () => fetchGenerationTask(taskId!),
    enabled: !!taskId,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: (_failureCount, err) => {
      // 401 不Retry，直接引导Log in
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
      return Math.min(5000, POLL_INTERVAL_MS + query.state.dataUpdateCount * 500);
    },
  });

  return {
    data: data ?? null,
    isPolling: isFetching && !!taskId,
    error: error ?? null,
  };
}
