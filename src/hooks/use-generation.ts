"use client";

import { useQuery } from "@tanstack/react-query";
import type { GenerationTask } from "@/types/models";

const POLL_INTERVAL_MS = 3000;

/** GET /api/generation/:id 的响应类型 */
export interface GenerationTaskWithResult extends GenerationTask {
  resultFileUrl: string | null;
}

async function fetchGenerationTask(
  taskId: string,
): Promise<GenerationTaskWithResult> {
  const res = await fetch(`/api/generation/${taskId}`);
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
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") {
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
