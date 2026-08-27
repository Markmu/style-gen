"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { invalidateStyleMemoryLists } from "@/components/style-memory/style-memory-delete-dialog";
import type { RepresentativeCandidate } from "@/types/models";

/**
 * plan-05（架构 §6.4 代表结果选择器）：ModalDialog 内的候选选择层。
 *
 * - 打开时 GET /api/templates/[id]/representative-candidates 游标加载
 *   （createdAt DESC / id DESC keyset），「加载更早」带 nextCursor 翻页。
 * - 条目：缩略图 + promptSummary + 时间；radio 单选。
 * - [确认] → POST representative-result { generationTaskId } → 成功关闭并
 *   触发详情回读（user_verified + 新代表结果；禁乐观更新，ADR-1）。
 * - 取消零请求（AC-05）：关闭 / Escape / 背景点击不发任何请求。
 * - 空候选：解释相关范围（派生 Iteration ∪ 来源 Iteration，completed 且有结果）。
 */

interface CandidatePage {
  items: RepresentativeCandidate[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface RepresentativeResultSelectorProps {
  memoryId: string;
  memoryName: string;
  open: boolean;
  onClose: () => void;
  /** 确认成功后回读详情（消费方触发 GET 刷新） */
  onConfirmed: () => void | Promise<void>;
}

async function fetchCandidatePage(
  memoryId: string,
  cursor: string | null,
): Promise<CandidatePage> {
  const search = new URLSearchParams();
  if (cursor) {
    search.set("cursor", cursor);
  }
  const query = search.toString();
  const res = await fetch(
    `/api/templates/${memoryId}/representative-candidates${query ? `?${query}` : ""}`,
  );
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // 保留默认错误信息
    }
    throw new Error(body.error ?? "候选 Iteration 加载失败，可重试。");
  }
  const data = (await res.json()) as Partial<CandidatePage>;
  return {
    items: Array.isArray(data.items) ? (data.items as RepresentativeCandidate[]) : [],
    hasMore: data.hasMore === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
  };
}

function formatCandidateDate(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

export function RepresentativeResultSelector({
  memoryId,
  memoryName,
  open,
  onClose,
  onConfirmed,
}: RepresentativeResultSelectorProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<RepresentativeCandidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);

  // 每次打开重新加载第一页（挂载即请求；关闭后重置，取消路径零请求）
  useEffect(() => {
    if (!open) return;
    if (loadedRef.current === memoryId) return;
    loadedRef.current = memoryId;
    setItems([]);
    setHasMore(false);
    setNextCursor(null);
    setSelectedId(null);
    setLoadError(null);
    setSubmitError(null);
    setSubmitting(false);
    setIsLoading(true);
    fetchCandidatePage(memoryId, null)
      .then((page) => {
        setItems(page.items);
        setHasMore(page.hasMore);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "候选 Iteration 加载失败，可重试。");
      })
      .finally(() => {
        setIsLoading(false);
      });
    return () => {
      loadedRef.current = null;
    };
  }, [open, memoryId]);

  const loadEarlier = async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const page = await fetchCandidatePage(memoryId, nextCursor);
      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "更早的候选加载失败，可重试。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/templates/${memoryId}/representative-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationTaskId: selectedId }),
      });
      if (!res.ok) {
        let body: { error?: string } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          // 保留默认错误信息
        }
        setSubmitError(body.error ?? "设置代表结果失败，可重试。");
        return;
      }
      onClose();
      // 状态转已验证需反映到列表（60s staleTime 缓存）+ 详情回读刷新
      await invalidateStyleMemoryLists(queryClient);
      await onConfirmed();
    } catch {
      setSubmitError("网络异常，设置代表结果失败；可重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      label="选择代表结果"
      labelledBy={titleId}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border-static)] px-5 py-4 pr-16">
          <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">
            选择代表结果
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            为「{memoryName}」选择一条已完成 Iteration 的结果作为代表结果；确认后这条
            Memory 会转为「用户已验证」。
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading && items.length === 0 ? (
            <div
              data-testid="representative-candidates-skeleton"
              className="space-y-2"
              aria-hidden="true"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`candidate-skeleton-${index}`}
                  className="h-16 animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : loadError && items.length === 0 ? (
            <div role="alert" className="rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-soft)] px-3.5 py-3 text-xs leading-5 text-[var(--color-error)]">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => {
                  loadedRef.current = null;
                  setLoadError(null);
                  void loadFirstPage(memoryId, {
                    setItems,
                    setHasMore,
                    setNextCursor,
                    setIsLoading,
                    setLoadError,
                  });
                }}
                className="btn-secondary mt-2 inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium"
              >
                重试
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/50 px-4 py-6 text-center">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                暂无相关已完成 Iteration
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[0.6875rem] leading-5 text-[var(--text-muted)]">
                相关范围：从这条 Memory 派生的 Iteration，以及它的来源 Iteration
                中已完成且生成出结果的记录。可以先在工作区用它生成，再回来选择代表结果。
              </p>
            </div>
          ) : (
            <>
              <ul
                role="radiogroup"
                aria-label="代表结果候选"
                className="space-y-2"
              >
                {items.map((candidate) => {
                  const checked = selectedId === candidate.id;
                  return (
                    <li key={candidate.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors ${
                          checked
                            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                            : "border-[var(--border-static)] hover:bg-[var(--surface-hover)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="representative-candidate"
                          value={candidate.id}
                          checked={checked}
                          onChange={() => setSelectedId(candidate.id)}
                          className="h-4 w-4 shrink-0 accent-[var(--accent-primary)]"
                        />
                        {candidate.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={candidate.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border-static)] object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--border-static)] bg-[var(--surface-low)]">
                            <AppIcon icon={ImageIcon} size={16} className="text-[var(--text-muted)]" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
                            {candidate.promptSummary}
                          </span>
                          <span className="mt-0.5 block font-mono text-[0.625rem] text-[var(--text-muted)]">
                            {formatCandidateDate(candidate.createdAt)}
                          </span>
                        </span>
                        {checked ? (
                          <AppIcon
                            icon={Check}
                            size={15}
                            className="shrink-0 text-[var(--accent-primary)]"
                          />
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadEarlier()}
                  disabled={isLoading}
                  className="btn-secondary mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-xs font-medium"
                >
                  {isLoading ? "加载中…" : "加载更早"}
                </button>
              ) : null}
              {loadError ? (
                <p role="alert" className="mt-2 text-[0.6875rem] text-[var(--color-error)]">
                  {loadError}
                </p>
              ) : null}
            </>
          )}

          {submitError ? (
            <p role="alert" className="mt-3 rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--color-error)]">
              {submitError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-static)] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-medium"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedId || submitting}
            className="btn-primary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-semibold"
          >
            {submitting ? "确认中…" : "确认为代表结果"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

/** 首屏加载失败重试（与挂载加载共用状态写入） */
async function loadFirstPage(
  memoryId: string,
  setState: {
    setItems: (items: RepresentativeCandidate[]) => void;
    setHasMore: (hasMore: boolean) => void;
    setNextCursor: (cursor: string | null) => void;
    setIsLoading: (loading: boolean) => void;
    setLoadError: (error: string | null) => void;
  },
): Promise<void> {
  setState.setIsLoading(true);
  setState.setLoadError(null);
  try {
    const page = await fetchCandidatePage(memoryId, null);
    setState.setItems(page.items);
    setState.setHasMore(page.hasMore);
    setState.setNextCursor(page.nextCursor);
  } catch (error) {
    setState.setLoadError(
      error instanceof Error ? error.message : "候选 Iteration 加载失败，可重试。",
    );
  } finally {
    setState.setIsLoading(false);
  }
}
