"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { invalidateStyleMemoryLists } from "@/components/style-memory/style-memory-delete-dialog";
import type { RepresentativeCandidate } from "@/types/models";

/**
 * plan-05（架构 §6.4 代表结果选择器）：ModalDialog 内的候选选择层。
 *
 * - 打开时 GET /api/templates/[id]/representative-candidates 游标加载
 *   （createdAt DESC / id DESC keyset），「Load earlier」带 nextCursor 翻页。
 * - 条目：缩略图 + promptSummary + 时间；radio 单选。
 * - [确认] → POST representative-result { generationTaskId } → 成功关闭并
 *   触发详情回读（user_verified + 新代表结果；禁乐观更新，ADR-1）。
 * - 取消零请求（AC-05）：关闭 / Escape / 背景点击不发任何请求。
 * - 空候选：解释相关范围（派生 Iteration ∪ 来源 Iteration，completed 且有结果）。
 *
 * plan-06（实现规格 §2/§4）：候选读取迁移到 query-key 化的唯一 owner
 * （useInfiniteQuery + `representativeCandidatesQueryKey(memoryId)`），宿主
 * （工作区统一刷新协调器）可显式 invalidate/refetch 该 key，不再另建第二份
 * 候选缓存；组件本地仅保留 radio 选择与提交态。新增 `preselectedIterationId`
 * （工作台 preferred 入口预选）与容器 testid。
 */

interface CandidatePage {
  items: RepresentativeCandidate[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** 候选列表 query key（唯一 owner：组件读取与刷新协调器回读共用同一 key） */
export function representativeCandidatesQueryKey(memoryId: string): unknown[] {
  return ["style-memory-representative-candidates", memoryId];
}

async function fetchCandidatePage({
  memoryId,
  cursor,
  signal,
}: {
  memoryId: string;
  cursor: string | null;
  signal: AbortSignal;
}): Promise<CandidatePage> {
  const search = new URLSearchParams();
  if (cursor) {
    search.set("cursor", cursor);
  }
  const query = search.toString();
  const res = await fetch(
    `/api/templates/${memoryId}/representative-candidates${query ? `?${query}` : ""}`,
    { signal },
  );
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // 保留默认错误信息
    }
    throw new Error(body.error ?? "Failed to load candidate iterations. You can retry.");
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

export interface RepresentativeResultSelectorProps {
  memoryId: string;
  memoryName: string;
  open: boolean;
  /** 工作台 preferred 入口：打开时预选该结果对应 radio（不在候选中则不预选） */
  preselectedIterationId?: string | null;
  onClose: () => void;
  /** 确认成功后回读详情（消费方触发 GET 刷新；读取失败由消费方自理，不影响写入事实） */
  onConfirmed: () => void | Promise<void>;
}

export function RepresentativeResultSelector({
  memoryId,
  memoryName,
  open,
  preselectedIterationId = null,
  onClose,
  onConfirmed,
}: RepresentativeResultSelectorProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // 候选读取的唯一 owner（plan-06 §2）：打开时加载第一页，翻页走 fetchNextPage；
  // 关闭即停用（取消路径零请求），缓存交给 key 管理，宿主可显式 invalidate/refetch。
  const candidatesQuery = useInfiniteQuery({
    queryKey: representativeCandidatesQueryKey(memoryId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchCandidatePage({ memoryId, cursor: pageParam, signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // 每次打开重置选择层（预选 preferred 结果或清空）与提交态
  useEffect(() => {
    if (!open) return;
    setSelectedId(preselectedIterationId ?? null);
    setSubmitError(null);
    setPageError(null);
    setSubmitting(false);
  }, [open, memoryId, preselectedIterationId]);

  const items = candidatesQuery.data
    ? candidatesQuery.data.pages.flatMap((page) => page.items)
    : [];
  const itemsWithDedup = items.filter(
    (candidate, index) => items.findIndex((item) => item.id === candidate.id) === index,
  );
  const hasMore = candidatesQuery.hasNextPage === true;
  const isFirstLoad =
    candidatesQuery.isPending && candidatesQuery.isFetching && itemsWithDedup.length === 0;
  const loadError =
    candidatesQuery.isError && itemsWithDedup.length === 0
      ? candidatesQuery.error instanceof Error
        ? candidatesQuery.error.message
        : "Failed to load candidate iterations. You can retry."
      : null;

  const loadEarlier = async () => {
    if (!candidatesQuery.hasNextPage || candidatesQuery.isFetching) return;
    setPageError(null);
    try {
      await candidatesQuery.fetchNextPage();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load earlier candidates. You can retry.",
      );
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
        setSubmitError(body.error ?? "Failed to set the representative result. You can retry.");
        return;
      }
      onClose();
      // 状态转已验证需反映到列表（60s staleTime 缓存）+ 详情回读刷新
      await invalidateStyleMemoryLists(queryClient);
      // 写入已成功：后续回读失败由宿主呈现（“已保存，刷新失败”只重试读取），
      // 不得回滚写入事实，也不在此重复提交。
      await Promise.resolve(onConfirmed()).catch(() => undefined);
    } catch {
      setSubmitError("Network error — failed to set the representative result. You can retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      label="Select representative result"
      labelledBy={titleId}
      testId="representative-result-selector"
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--border-static)] px-5 py-4 pr-16">
          <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">
            Select representative result
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Choose a completed iteration result as the representative result for
            &quot;{memoryName}&quot;. Once confirmed, this memory becomes User
            verified.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isFirstLoad ? (
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
          ) : loadError ? (
            <div role="alert" className="rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-soft)] px-3.5 py-3 text-xs leading-5 text-[var(--color-error)]">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => void candidatesQuery.refetch()}
                className="btn-secondary mt-2 inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium"
              >
                Retry
              </button>
            </div>
          ) : itemsWithDedup.length === 0 && !candidatesQuery.isFetching ? (
            <div className="rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/50 px-4 py-6 text-center">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                No related completed iterations yet
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[0.6875rem] leading-5 text-[var(--text-muted)]">
                Related scope: iterations derived from this memory, plus its
                source iteration where generation completed with a result.
                Generate with it in the workspace first, then come back to
                select a representative result.
              </p>
            </div>
          ) : (
            <>
              <ul
                role="radiogroup"
                aria-label="Representative result candidates"
                className="space-y-2"
              >
                {itemsWithDedup.map((candidate) => {
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
                  disabled={candidatesQuery.isFetching}
                  className="btn-secondary mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-xs font-medium"
                >
                  {candidatesQuery.isFetching ? "Loading…" : "Load earlier"}
                </button>
              ) : null}
              {pageError ? (
                <p role="alert" className="mt-2 text-[0.6875rem] text-[var(--color-error)]">
                  {pageError}
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
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedId || submitting}
            className="btn-primary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-semibold"
          >
            {submitting ? "Confirming…" : "Set as representative result"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
