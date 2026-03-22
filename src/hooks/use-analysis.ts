"use client";

import { useQuery } from "@tanstack/react-query";
import type { AnalysisTask } from "@/types/models";

const POLL_INTERVAL_MS = 2000;

async function fetchAnalysisTask(taskId: string): Promise<AnalysisTask> {
  const res = await fetch(`/api/analysis/${taskId}`);
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
