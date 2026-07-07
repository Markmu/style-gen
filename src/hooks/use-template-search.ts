"use client";

import { useState, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";

/** 模板列表项（API 返回的精简字段） */
export interface TemplateListItem {
  id: string;
  name: string;
  variableCount: number;
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  createdAt: string;
}

interface UseTemplateSearchReturn {
  templates: TemplateListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: TemplateSearchError | null;
  errorStatus: number | null;
  errorCode: string | null;
  isAuthRequired: boolean;
  isRecoverableError: boolean;
  search: string;
  setSearch: (keyword: string) => void;
  isSearching: boolean;
}

interface TemplateErrorResponse {
  error?: string;
  code?: string;
  retryable?: boolean;
}

export class TemplateSearchError extends Error {
  status: number;
  code: string | null;
  retryable: boolean;

  constructor({
    message,
    status,
    code,
    retryable,
  }: {
    message: string;
    status: number;
    code?: string;
    retryable?: boolean;
  }) {
    super(message);
    this.name = "TemplateSearchError";
    this.status = status;
    this.code = code ?? null;
    this.retryable = retryable ?? (status >= 500 || status === 429);
  }
}

async function readErrorResponse(res: Response): Promise<TemplateErrorResponse> {
  try {
    return (await res.json()) as TemplateErrorResponse;
  } catch {
    return {};
  }
}

/**
 * 模板搜索 hook
 * - 搜索请求保持现有 /api/templates contract
 * - 使用 React useDeferredValue 暴露轻量 isSearching 过渡状态
 * - 使用 React Query 缓存和自动请求
 * - 初始 search 为空字符串，加载最近模板
 */
export function useTemplateSearch(): UseTemplateSearchReturn {
  const [search, setSearch] = useState("");

  const debouncedSearch = useDeferredValue(search);
  const isSearching = search !== debouncedSearch;

  const {
    data: templates,
    isLoading,
    isError,
    error,
  } = useQuery<TemplateListItem[], TemplateSearchError>({
    queryKey: ["templates", { search }],
    queryFn: async (): Promise<TemplateListItem[]> => {
      const params = new URLSearchParams();
      if (search.trim().length > 0) {
        params.set("search", search.trim());
      }
      params.set("limit", "20");

      const res = await fetch(`/api/templates?${params.toString()}`);
      if (!res.ok) {
        const data = await readErrorResponse(res);
        throw new TemplateSearchError({
          message: data.error ?? "Failed to search Style Memories",
          status: res.status,
          code: data.code,
          retryable: data.retryable,
        });
      }

      const result = (await res.json()) as {
        items: TemplateListItem[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      return result.items;
    },
    retry: false,
  });

  const errorStatus = error?.status ?? null;
  const errorCode = error?.code ?? null;
  const isAuthRequired = errorStatus === 401;
  const isRecoverableError = Boolean(error && !isAuthRequired);

  return {
    templates,
    isLoading,
    isError,
    error,
    errorStatus,
    errorCode,
    isAuthRequired,
    isRecoverableError,
    search,
    setSearch,
    isSearching,
  };
}
