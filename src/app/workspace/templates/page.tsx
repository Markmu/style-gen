"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTemplateSearch, type TemplateListItem } from "@/hooks/use-template-search";
import { TemplateCard } from "@/components/workspace/template-card";

/** Skeleton 卡片占位 */
function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-[var(--surface-mid)] ring-1 ring-[var(--border)]">
      <div className="aspect-[3/4] w-full animate-pulse bg-[var(--surface-base)]" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-bright)]" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-bright)]" />
      </div>
    </div>
  );
}

export default function TemplateLibraryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    templates,
    isLoading,
    isError,
    error,
    search,
    setSearch,
  } = useTemplateSearch();

  /** Use Template → 跳转到工作台并携带 templateId */
  const handleUseTemplate = useCallback(
    (id: string) => {
      router.push(`/workspace?templateId=${id}`);
    },
    [router],
  );

  /** 复制模板 */
  const handleDuplicate = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/templates/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "复制失败");
      }
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      router.refresh();
    },
    [queryClient, router],
  );

  /** 删除模板 */
  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "删除失败");
      }
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      router.refresh();
    },
    [queryClient, router],
  );

  /** 编辑模板（跳转或打开编辑器 — 暂用 console 提示） */
  const handleEdit = useCallback((id: string) => {
    // TODO: 后续可接入模板编辑功能
    console.log("[template-edit]", id);
  }, []);

  const hasSearched = search.trim().length > 0;
  const isEmpty = !isLoading && templates && templates.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* 页面标题 */}
      <div className="shrink-0 px-6 pt-6 pb-2">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">
          Template Library
        </h1>
      </div>

      {/* 搜索框 */}
      <div className="shrink-0 px-6 pb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-lg text-[var(--text-secondary)]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-mid)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
          />
          {hasSearched && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
              aria-label="清除搜索"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 主内容区：卡片网格 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        {/* 加载中：skeleton 占位 */}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={`skeleton-${i}`} />
            ))}
          </div>
        )}

        {/* 错误态 */}
        {!isLoading && isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-red-400">
              {error?.message ?? "搜索失败，请重试"}
            </p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-3 rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-mid)] hover:text-[var(--text-primary)]"
            >
              重试
            </button>
          </div>
        )}

        {/* 空态：无模板 + 未搜索 */}
        {isEmpty && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined mb-3 text-4xl text-[var(--text-secondary)]/30">
              library_books
            </span>
            <p className="text-sm text-[var(--text-secondary)]">
              还没有模板，去创作一个吧！
            </p>
          </div>
        )}

        {/* 空态：搜索无结果 */}
        {isEmpty && hasSearched && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined mb-3 text-4xl text-[var(--text-secondary)]/30">
              search_off
            </span>
            <p className="text-sm text-[var(--text-secondary)]">
              没有找到匹配的模板
            </p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-3 rounded-lg px-4 py-2 text-sm text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)]/10"
            >
              清除搜索
            </button>
          </div>
        )}

        {/* 卡片网格 */}
        {!isLoading && !isError && templates && templates.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((template: TemplateListItem) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={handleUseTemplate}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
