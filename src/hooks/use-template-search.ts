"use client";

import { useState, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StyleMemoryListItem } from "@/types/models";

/**
 * plan-04：Style Memory 列表搜索/筛选 hook。
 * - 消费 plan-02 交付的 GET /api/templates 新 DTO（`StyleMemoryListItem`）
 * - `status` 三态筛选（all | user_verified | pending_verification）与 `search`
 *   一起交给服务端谓词，客户端不做二次过滤
 * - 搜索/筛选/游标初始值来自 URL（由列表页持久化与恢复）
 */

/** 验证状态筛选（与服务端 status 白名单一致） */
export type StyleMemoryStatusFilter =
  | "all"
  | "user_verified"
  | "pending_verification";

const STATUS_FILTER_VALUES: StyleMemoryStatusFilter[] = [
  "all",
  "user_verified",
  "pending_verification",
];

/** URL `status` 参数 → 合法筛选值（非法/缺省回落 all） */
export function parseStatusFilter(
  value: string | null | undefined,
): StyleMemoryStatusFilter {
  return STATUS_FILTER_VALUES.includes(value as StyleMemoryStatusFilter)
    ? (value as StyleMemoryStatusFilter)
    : "all";
}

interface UseTemplateSearchOptions {
  /** URL 恢复：初始搜索词 */
  initialSearch?: string;
  /** URL 恢复：初始验证状态筛选 */
  initialStatus?: StyleMemoryStatusFilter;
  /** URL 恢复：游标（翻页后返回列表时恢复原位置） */
  initialCursor?: string | null;
}

interface UseTemplateSearchReturn {
  templates: StyleMemoryListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: TemplateSearchError | null;
  errorStatus: number | null;
  errorCode: string | null;
  isAuthRequired: boolean;
  isRecoverableError: boolean;
  search: string;
  setSearch: (keyword: string) => void;
  status: StyleMemoryStatusFilter;
  setStatus: (status: StyleMemoryStatusFilter) => void;
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

export function useTemplateSearch(
  options: UseTemplateSearchOptions = {},
): UseTemplateSearchReturn {
  const [search, setSearch] = useState(options.initialSearch ?? "");
  const [status, setStatus] = useState<StyleMemoryStatusFilter>(
    options.initialStatus ?? "all",
  );
  const initialCursor = options.initialCursor ?? null;

  const debouncedSearch = useDeferredValue(search);
  const isSearching = search !== debouncedSearch;

  const {
    data: templates,
    isLoading,
    isError,
    error,
  } = useQuery<StyleMemoryListItem[], TemplateSearchError>({
    queryKey: [
      "templates",
      {
        search: debouncedSearch.trim(),
        status,
        ...(initialCursor ? { cursor: initialCursor } : {}),
      },
    ],
    queryFn: async (): Promise<StyleMemoryListItem[]> => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim().length > 0) {
        params.set("search", debouncedSearch.trim());
      }
      if (status !== "all") {
        params.set("status", status);
      }
      if (initialCursor) {
        params.set("cursor", initialCursor);
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
        items: StyleMemoryListItem[];
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
    status,
    setStatus,
    isSearching,
  };
}
