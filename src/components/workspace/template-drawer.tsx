"use client";

import { useState, useEffect, useCallback } from "react";

/** Template list item (from API list response) */
interface TemplateListItem {
  id: string;
  name: string;
  variableCount: number;
  createdAt: string;
}

interface TemplateDrawerProps {
  open: boolean;
  onLoadTemplate: (content: string) => void;
  onDeleteSuccess: (id: string) => void;
  onClose: () => void;
}

export function TemplateDrawer({
  open,
  onLoadTemplate,
  onDeleteSuccess,
  onClose,
}: TemplateDrawerProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Drawer 打开时重置分页状态并加载首页数据
  useEffect(() => {
    if (!open) return;

    setTemplates([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);
    setDeleteTarget(null);
    setLoadingTemplateId(null);
    setIsLoading(true);

    fetch("/api/templates?limit=10")
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "加载失败");
        }
        const data = (await res.json()) as {
          items: TemplateListItem[];
          hasMore: boolean;
          nextCursor: string | null;
        };
        setTemplates(data.items);
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open]);

  /** 加载更多模板 */
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const res = await fetch(
        `/api/templates?cursor=${encodeURIComponent(nextCursor)}&limit=10`,
      );
      if (!res.ok) throw new Error("加载更多失败");

      const data = (await res.json()) as {
        items: TemplateListItem[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setTemplates((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error("[template-drawer] load more failed:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore]);

  /** 使用模板：获取详情 content 并回调 */
  const handleUseTemplate = useCallback(
    async (id: string) => {
      setLoadingTemplateId(id);
      try {
        const res = await fetch(`/api/templates/${id}`);
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "加载模板失败");
        }
        const template = (await res.json()) as { content: string };
        console.log("[template_loaded]", id);
        onLoadTemplate(template.content);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载模板失败");
      } finally {
        setLoadingTemplateId(null);
      }
    },
    [onLoadTemplate, onClose],
  );

  /** 确认删除模板 */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/templates/${deleteTarget}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "删除失败");
      }
      console.log("[template_deleted]", deleteTarget);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget));
      onDeleteSuccess(deleteTarget);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteTarget(null);
      setActionMenuId(null);
    }
  }, [deleteTarget, onDeleteSuccess]);

  /** 复制模板 */
  const handleDuplicate = useCallback(async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/templates/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "复制失败");
      }
      const duplicated = (await res.json()) as TemplateListItem & { content?: string };
      console.log("[template_duplicated]", { sourceId: id, newId: duplicated.id, newName: duplicated.name });
      // 将新副本插入到列表头部
      setTemplates((prev) => [
        {
          id: duplicated.id,
          name: duplicated.name,
          variableCount: duplicated.variableCount ?? 0,
          createdAt: String(duplicated.createdAt),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制失败");
    } finally {
      setDuplicatingId(null);
      setActionMenuId(null);
    }
  }, []);

  /** 格式化日期显示 */
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[320px] flex-col bg-[var(--surface-base)] shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            我的模板
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-mid)] hover:text-[var(--text-primary)]"
            aria-label="关闭"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--text-secondary)]">
              加载中...
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                还没有模板
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]/70">
                先保存一个吧
              </p>
            </div>
          )}

          {/* Template cards */}
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-lg bg-[var(--surface-mid)] p-3 ring-1 ring-[var(--border)]"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                    {template.name}
                  </h3>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActionMenuId(actionMenuId === template.id ? null : template.id)}
                      className="shrink-0 rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
                      aria-label="更多操作"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="19" cy="12" r="1" />
                        <circle cx="5" cy="12" r="1" />
                      </svg>
                    </button>
                    {/* Action dropdown menu */}
                    {actionMenuId === template.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setActionMenuId(null)}
                        />
                        <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-lg bg-[var(--surface-bright)] py-1 ring-1 ring-[var(--border)] shadow-lg">
                          <button
                            type="button"
                            onClick={() => handleDuplicate(template.id)}
                            disabled={duplicatingId === template.id}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-mid)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {duplicatingId === template.id ? "复制中..." : "复制"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(template.id);
                              setActionMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
                          >
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="mb-3 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <span>变量: {template.variableCount}</span>
                  <span>{formatDate(template.createdAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUseTemplate(template.id)}
                  disabled={loadingTemplateId === template.id}
                  className="w-full rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingTemplateId === template.id ? "加载中..." : "使用"}
                </button>
              </div>
            ))}
          </div>

          {/* Load more button */}
          {hasMore && templates.length > 0 && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-mid)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? "加载中..." : "加载更多"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog (inline) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-sm rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)] shadow-xl"
            role="alertdialog"
            aria-modal="true"
            aria-label="确认删除"
          >
            <p className="mb-4 text-sm text-[var(--text-primary)]">
              确定删除模板&ldquo;{templates.find((t) => t.id === deleteTarget)?.name}&rdquo；？删除后不可恢复。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
