"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

/** GET /api/generation 返回的历史列表项 */
export interface GenerationHistoryItem {
  id: string;
  resultFileUrl: string;
  createdAt: string;
}

export class GenerationHistoryListError extends Error {
  status: number;
  code?: string;
  retryable?: boolean;

  constructor(
    message: string,
    options: { status: number; code?: string; retryable?: boolean },
  ) {
    super(message);
    this.name = "GenerationHistoryListError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

/** GET /api/generation 返回的响应体 */
interface GenerationHistoryResponse {
  items: GenerationHistoryItem[];
  nextCursor: string | null;
}

async function fetchGenerationHistory(
  pageParam: string | null
): Promise<GenerationHistoryResponse> {
  const params = new URLSearchParams();
  params.set("pageSize", "20");
  if (pageParam) {
    params.set("cursor", pageParam);
  }

  const res = await fetch(`/api/generation?${params.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const data = errorData as {
      error?: string;
      code?: string;
      retryable?: boolean;
    };
    throw new GenerationHistoryListError(
      data.error ?? "Failed to fetch generation history",
      {
        status: res.status,
        code: data.code,
        retryable: data.retryable,
      },
    );
  }
  return res.json() as Promise<GenerationHistoryResponse>;
}

export function useHistoryList(enabled = true) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery<GenerationHistoryResponse, Error>({
    queryKey: ["generation-history"],
    queryFn: ({ pageParam }: { pageParam: unknown }) =>
      fetchGenerationHistory(pageParam as string | null),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
    enabled,
    retry: false,
  });

  /** 使缓存失效（供Generation Complete后调用） */
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["generation-history"] });
  };

  // 扁平化所有页的数据
  const pages = query.data?.pages;
  const data = pages?.flatMap((page) => page.items);
  const itemCount = data?.length ?? 0;

  return {
    data,
    status: query.isError
      ? "error"
      : query.isLoading
        ? "loading"
        : itemCount === 0
          ? "empty"
          : "ready",
    isEmpty: !query.isLoading && !query.isError && itemCount === 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch,
  };
}
