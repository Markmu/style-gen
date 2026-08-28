"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Clock3, Copy, MoreHorizontal, Pencil, TriangleAlert } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { StatePresenter } from "@/components/ui/state-presenter";
import { RepresentativeResultSelector } from "@/components/style-memory/representative-result-selector";
import { ReusePrecheckDialog } from "@/components/style-memory/reuse-precheck-dialog";
import { StyleMemoryDeleteDialog, invalidateStyleMemoryLists } from "@/components/style-memory/style-memory-delete-dialog";
import { StyleMemoryDetailView } from "@/components/style-memory/style-memory-detail-view";
import { StyleMemoryEditForm } from "@/components/style-memory/style-memory-edit-form";
import { STYLE_MEMORY_LIST_QUERY_STORAGE_KEY } from "@/lib/style-memory-view-model";
import type { StyleMemoryDetail } from "@/types/models";

/**
 * plan-05（架构 §6.2 详情链路 / §6.4 治理闭环）：/workspace/templates/[id]。
 *
 * - 挂载 GET /api/templates/[id] 加载 StyleMemoryDetail；404 → 「不存在或已被
 *   删除」+ 返回列表；503 → StatePresenter failedRecoverable 可重试且列表入口
 *   保持可用（AC-10）；加载骨架稳定。
 * - 页面头：返回列表（恢复列表页原查询）、名称、状态徽标、编辑、更多
 *   （编辑 / 复制 / 删除，danger）、使用这条 Memory（按现状跳转工作区，
 *   plan-07 接管）。
 * - 确认导航初始焦点（plan-03 约定）：页面挂载且数据就绪后初始焦点置于页面
 *   主标题（tabIndex=-1）。
 */

class StyleMemoryDetailError extends Error {
  status: number;
  code: string | null;
  retryable: boolean;

  constructor(options: { message: string; status: number; code?: string; retryable?: boolean }) {
    super(options.message);
    this.name = "StyleMemoryDetailError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? options.status >= 500;
  }
}

async function fetchStyleMemoryDetail(
  id: string,
  signal: AbortSignal,
): Promise<StyleMemoryDetail> {
  const res = await fetch(`/api/templates/${id}`, { signal });
  if (!res.ok) {
    let body: { error?: string; code?: string; retryable?: boolean } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // 保留默认错误信息
    }
    throw new StyleMemoryDetailError({
      message: body.error ?? "Failed to load Style Memory details",
      status: res.status,
      code: body.code,
      retryable: body.retryable,
    });
  }
  return (await res.json()) as StyleMemoryDetail;
}

function StatusBadge({ status }: { status: StyleMemoryDetail["verificationStatus"] }) {
  const isVerified = status === "user_verified";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold shadow-xs ${
        isVerified
          ? "border-[var(--border-static)]/60 bg-[var(--surface-floating)] text-[var(--text-primary)]"
          : "border-[var(--border-static)]/60 bg-[var(--surface-floating)]/90 text-[var(--text-secondary)]"
      }`}
    >
      <AppIcon
        icon={isVerified ? BadgeCheck : Clock3}
        size={12}
        className={isVerified ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"}
      />
      {isVerified ? "User verified" : "Pending verification"}
    </span>
  );
}

function BackToListLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      <AppIcon icon={ArrowLeft} size={14} />
      Back to list
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div
      data-testid="style-memory-detail-skeleton"
      aria-hidden="true"
      className="space-y-5"
    >
      <div className="h-9 w-64 animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="surface-panel h-64 animate-pulse rounded-2xl bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="surface-panel h-56 animate-pulse rounded-2xl bg-[var(--surface-low)] motion-reduce:animate-none" />
        <div className="surface-panel h-56 animate-pulse rounded-2xl bg-[var(--surface-low)] motion-reduce:animate-none" />
      </div>
      <div className="surface-panel h-32 animate-pulse rounded-2xl bg-[var(--surface-low)] motion-reduce:animate-none" />
    </div>
  );
}

function StyleMemoryDetailPageInner() {
  const routeParams = useParams<{ id: string }>();
  const id = routeParams.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // 列表页在 URL 持久化时同步记录原查询（plan-04 联动）；详情侧恢复使用
  const [listQuery, setListQuery] = useState("");
  useEffect(() => {
    try {
      setListQuery(window.sessionStorage.getItem(STYLE_MEMORY_LIST_QUERY_STORAGE_KEY) ?? "");
    } catch {
      setListQuery("");
    }
  }, [id]);
  const listHref = listQuery
    ? `/workspace/templates?${listQuery}`
    : "/workspace/templates";

  const query = useQuery<StyleMemoryDetail, StyleMemoryDetailError>({
    queryKey: ["style-memory-detail", id],
    queryFn: ({ signal }) => fetchStyleMemoryDetail(id, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const detail = query.data ?? null;
  const error = query.error;

  // 确认导航初始焦点（plan-03 约定）：数据就绪后聚焦页面主标题（每 id 一次，
  // 回读刷新不重复抢焦点）
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (detail && focusedIdRef.current !== id) {
      focusedIdRef.current = id;
      titleRef.current?.focus();
    }
  }, [detail, id]);

  // 治理动作状态
  const [editOpen, setEditOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // plan-07：详情「使用这条 Memory」接管为复用预检弹层（AC-06）
  const [precheckOpen, setPrecheckOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const showRenameNotice = searchParams.get("notice") === "rename";
  const dismissRenameNotice = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("notice");
    const next = params.toString();
    router.replace(next ? `/workspace/templates/${id}?${next}` : `/workspace/templates/${id}`, {
      scroll: false,
    });
  }, [id, router, searchParams]);

  const handleUse = useCallback(() => {
    // plan-07（AC-06）：入口接管为复用预检——展示将保留规则/必填变量门/
    // 工作区影响，确认后由弹层完成快照握手与导航。
    setPrecheckOpen(true);
  }, []);

  const handleDuplicate = useCallback(async () => {
    if (isDuplicating) return;
    setIsDuplicating(true);
    setDuplicateError(null);
    try {
      const res = await fetch(`/api/templates/${id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        let body: { error?: string } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          // 保留默认错误信息
        }
        setDuplicateError(body.error ?? "Duplicate failed. Please try again later.");
        return;
      }
      const copy = (await res.json()) as { id: string };
      // 新复制品需反映到列表（60s staleTime 缓存）
      await invalidateStyleMemoryLists(queryClient);
      router.push(`/workspace/templates/${copy.id}?notice=rename`);
    } catch {
      setDuplicateError("Network error — duplicate failed. You can retry.");
    } finally {
      setIsDuplicating(false);
    }
  }, [id, isDuplicating, queryClient, router]);

  const refreshDetail = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const handleLogin = useCallback(() => {
    router.push(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/workspace/templates/${id}`)}`,
    );
  }, [id, router]);

  // ─── 状态分支 ───
  const isNotFound = query.isError && error instanceof StyleMemoryDetailError && error.status === 404;
  const isAuthRequired =
    query.isError && error instanceof StyleMemoryDetailError && error.status === 401;

  if (isNotFound) {
    return (
      <div
        data-testid="style-memory-detail-page"
        className="flex h-full min-h-0 flex-col bg-[var(--surface-page)]"
      >
        <header className="shrink-0 px-4 py-5 sm:px-6 lg:px-8">
          <BackToListLink href={listHref} />
        </header>
        <div className="px-4 pb-8 sm:px-6 lg:px-8">
          <section
            aria-live="polite"
            data-status="notFound"
            className="ai-panel surface-panel rounded-lg p-6"
          >
            <div className="flex items-start gap-4">
              <span
                className="status-tone-dot mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full text-[var(--status-neutral-text)] bg-current opacity-70"
                data-testid="state-presenter-tone"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  This memory does not exist or was deleted
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  This Style Memory may have been deleted, or the link points to
                  content that is no longer available. The list and other assets
                  are unaffected.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={listHref}
                    className="btn-primary rounded-md px-4 py-2 text-sm font-medium"
                  >
                    Back to list
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        data-testid="style-memory-detail-page"
        className="flex h-full min-h-0 flex-col bg-[var(--surface-page)]"
      >
        <header className="shrink-0 px-4 py-5 sm:px-6 lg:px-8">
          <BackToListLink href={listHref} />
        </header>
        <div className="px-4 pb-8 sm:px-6 lg:px-8">
          {isAuthRequired ? (
            <StatePresenter
              status="authRequired"
              title="Sign in to view Style Memory details"
              description="Cloud Style Memory requires sign-in. You will return to this detail page after signing in."
              primaryActionLabel="Sign in"
              onPrimaryAction={handleLogin}
            />
          ) : (
            <StatePresenter
              status="failedRecoverable"
              title="Style Memory details unavailable"
              description={`${
                error?.message ?? "Details could not be loaded."
              } The list entry stays available — retry to restore this detail page.`}
              primaryActionLabel="Retry"
              onPrimaryAction={() => void query.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div
        data-testid="style-memory-detail-page"
        className="flex h-full min-h-0 flex-col bg-[var(--surface-page)]"
      >
        <div className="min-h-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="style-memory-detail-page"
      className="flex h-full min-h-0 flex-col bg-[var(--surface-page)]"
    >
      {/* 页面头：返回列表 / 名称 + 徽标 / 编辑 / 更多 / 使用这条 Memory */}
      <header
        data-testid="style-memory-detail-header"
        className="shrink-0 px-4 pb-4 pt-5 sm:px-6 lg:px-8 lg:pb-5 lg:pt-6"
      >
        <BackToListLink href={listHref} />
        <div className="mt-2 flex flex-col gap-3.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1
                ref={titleRef}
                tabIndex={-1}
                className="min-w-0 truncate text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)] outline-none"
              >
                {detail.name}
              </h1>
              <StatusBadge status={detail.verificationStatus} />
            </div>
            {detail.description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                {detail.description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="btn-secondary inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-medium shadow-sm transition-all hover:border-[var(--border-interactive)] active:scale-[0.98]"
            >
              <AppIcon icon={Pencil} size={14} />
              Edit
            </button>
            <DropdownMenu
              trigger={{ icon: MoreHorizontal, label: "More" }}
              items={[
                {
                  key: "edit",
                  label: "Edit",
                  onSelect: () => setEditOpen(true),
                },
                {
                  key: "duplicate",
                  label: isDuplicating ? "Duplicating…" : "Duplicate",
                  onSelect: () => void handleDuplicate(),
                },
                {
                  key: "delete",
                  label: "Delete",
                  danger: true,
                  onSelect: () => setDeleteOpen(true),
                },
              ]}
            />
            <button
              type="button"
              onClick={handleUse}
              className="btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              Use this memory
              <AppIcon icon={ArrowUpRight} size={14} />
            </button>
          </div>
        </div>

        {duplicateError ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--color-error)]"
          >
            <AppIcon icon={TriangleAlert} size={14} className="mt-0.5 shrink-0" />
            {duplicateError}
          </div>
        ) : null}
      </header>

      {showRenameNotice ? (
        <div
          role="status"
          className="shrink-0 px-4 pb-3 sm:px-6 lg:px-8"
        >
          <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 px-3.5 py-2.5">
            <p className="text-xs leading-5 text-[var(--text-primary)]">
              Duplicate created. It starts as Pending verification — rename it
              and set a representative result to complete verification.
            </p>
            <button
              type="button"
              onClick={dismissRenameNotice}
              className="shrink-0 text-xs font-medium text-[var(--accent-primary)] hover:underline"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {/* 四分区 + 高级信息 + 使用情况 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6 lg:px-8">
        <StyleMemoryDetailView
          detail={detail}
          onSelectRepresentative={() => setSelectorOpen(true)}
        />
      </div>

      {/* 治理弹层（plan-03 原语） */}
      <StyleMemoryEditForm
        detail={detail}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={refreshDetail}
      />
      <RepresentativeResultSelector
        memoryId={detail.id}
        memoryName={detail.name}
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onConfirmed={refreshDetail}
      />
      <StyleMemoryDeleteDialog
        detail={detail}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        listHref={listHref}
      />

      {/* plan-07：复用预检弹层（AC-06）——详情页头「使用这条 Memory」的接管宿主 */}
      <ReusePrecheckDialog
        open={precheckOpen}
        memoryId={id}
        onClose={() => setPrecheckOpen(false)}
      />
    </div>
  );
}

/** useSearchParams / useParams 需要 Suspense 边界（Next.js 15 要求） */
export default function StyleMemoryDetailPage() {
  return (
    <Suspense fallback={null}>
      <StyleMemoryDetailPageInner />
    </Suspense>
  );
}
