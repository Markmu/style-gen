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
  error: Error | null;
  search: string;
  setSearch: (keyword: string) => void;
  isSearching: boolean;
}

/**
 * 模板搜索 hook
 * - 使用 React useDeferredValue 实现 300ms debounce 效果
 * - 使用 React Query 缓存和自动请求
 * - 初始 search 为空字符串，加载最近模板
 */
export function useTemplateSearch(): UseTemplateSearchReturn {
  const [search, setSearch] = useState("");

  // useDeferredValue 在高优先级更新（输入）Done后返回 deferred 值
  // 实际效果：输入期间不触发查询，停顿后才用最新值发起请求
  const debouncedSearch = useDeferredValue(search);
  const isSearching = search !== debouncedSearch;

  const {
    data: templates,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["templates", { search: debouncedSearch }],
    queryFn: async (): Promise<TemplateListItem[]> => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim().length > 0) {
        params.set("search", debouncedSearch.trim());
      }
      params.set("limit", "20");

      const res = await fetch(`/api/templates?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to search templates");
      }

      const result = (await res.json()) as {
        items: TemplateListItem[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      return result.items;
    },
  });

  return {
    templates,
    isLoading,
    isError,
    error,
    search,
    setSearch,
    isSearching,
  };
}
