"use client";

import { StatePresenter } from "@/components/ui/state-presenter";

/**
 * plan-02: Iteration Memory 列表五种状态面（空态/加载骨架/搜索无匹配/未登录/列表服务不可用）。
 *
 * 文案遵循 PRD 三段式（发生了什么 / 保留了什么 / 下一步），
 * 结构复用 `StatePresenter` 以对齐 The Precision Frame 的状态语言。
 */

interface FaceProps {
  className?: string;
}

/** 首次使用无任何记录 → 引导开始第一次创作 + 返回工作台 */
export function IterationEmptyFace({
  onStartCreating,
  onBackToWorkspace,
  className,
}: FaceProps & {
  onStartCreating: () => void;
  onBackToWorkspace: () => void;
}) {
  return (
    <div
      data-testid="iteration-state-face"
      data-face="empty"
      className={className}
    >
      <StatePresenter
        status="empty"
        title="No iterations yet"
        description="No generation attempt has been recorded in Iteration Memory. Your workspace stays ready with its current reference and prompt, and every attempt you submit from the workspace will be kept here."
        primaryActionLabel="Start first iteration"
        secondaryActionLabel="Open Workspace"
        onPrimaryAction={onStartCreating}
        onSecondaryAction={onBackToWorkspace}
      />
    </div>
  );
}

/** 首屏列表加载骨架（不与任何状态面或列表同时渲染） */
export function IterationLoadingSkeleton({ className }: FaceProps) {
  return (
    <div
      role="status"
      aria-label="Loading Iteration Memory"
      className={`flex flex-col gap-2 ${className ?? ""}`}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={`iteration-skeleton-${index}`}
          aria-hidden="true"
          className="surface-panel flex items-center gap-4 rounded-lg p-3"
        >
          <div className="h-16 w-24 shrink-0 animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
          </div>
          <div className="h-3 w-16 shrink-0 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** 搜索/筛选后无匹配：保留条件，提供清除搜索 / 切换筛选行动 */
export function IterationNoMatchFace({
  onClearSearch,
  onSwitchFilter,
  className,
}: FaceProps & {
  onClearSearch: () => void;
  onSwitchFilter: () => void;
}) {
  return (
    <div
      data-testid="iteration-state-face"
      data-face="no-match"
      className={className}
    >
      <StatePresenter
        status="noResults"
        title="No iterations match this search"
        description="No record matches the current keyword and status filter. Your search and filter stay exactly as they are, so you can clear the search or switch to all statuses to widen the view."
        primaryActionLabel="Clear search"
        secondaryActionLabel="Switch to all statuses"
        onPrimaryAction={onClearSearch}
        onSecondaryAction={onSwitchFilter}
      />
    </div>
  );
}

/** 未登录（401）：云端记录需要登录，本地工作台状态保留 */
export function IterationUnauthorizedFace({
  onSignIn,
  onBackToWorkspace,
  className,
}: FaceProps & {
  onSignIn: () => void;
  onBackToWorkspace: () => void;
}) {
  return (
    <div
      data-testid="iteration-state-face"
      data-face="unauthorized"
      className={className}
    >
      <StatePresenter
        status="authRequired"
        title="Sign in to view Iteration Memory"
        description="Iteration Memory keeps your generation history in the cloud and needs a signed-in account. Your local workspace draft is preserved untouched, and you will return to this page after signing in."
        primaryActionLabel="Sign in"
        secondaryActionLabel="Back to Workspace"
        onPrimaryAction={onSignIn}
        onSecondaryAction={onBackToWorkspace}
      />
    </div>
  );
}

/** 列表请求 5xx：说明当前工作台不受影响，可重试 */
export function IterationListErrorFace({
  message,
  onRetry,
  onBackToWorkspace,
  className,
}: FaceProps & {
  message?: string | null;
  onRetry: () => void;
  onBackToWorkspace: () => void;
}) {
  const reason = message ? `${message} ` : "";
  return (
    <div
      data-testid="iteration-state-face"
      data-face="error"
      className={className}
    >
      <StatePresenter
        status="failedRecoverable"
        title="Iteration Memory is temporarily unavailable"
        description={`${reason}The Iteration Memory list could not load, and your current workspace is not affected. Retry to load the list again, or return to the workspace to keep creating.`}
        primaryActionLabel="Retry"
        secondaryActionLabel="Back to Workspace"
        onPrimaryAction={onRetry}
        onSecondaryAction={onBackToWorkspace}
      />
    </div>
  );
}
