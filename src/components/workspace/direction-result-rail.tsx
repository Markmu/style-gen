"use client";

import {
  ExternalLink,
  RefreshCw,
  Star,
  Columns2,
  ImageIcon,
  Copy,
  Bookmark,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { DirectionIterationListItem } from "@/types/models";

/**
 * plan-05（ADR-5 / 架构 §6.4 / AC-04、AC-06）：本次结果 rail。
 *
 * - 三组状态独立内联：最近五个 completed 真实缩略图、一个 active face、
 *   一个 latestFailure face（截断原因 + 主动重试）；三组不共享名额，
 *   active/failure 绝不挤占五张成功缩略图。
 * - 当前选择（selected）是瞬时的，由新完成结果或用户点击切换；
 *   本次首选（preferred）只由用户操作写入，两者使用不同文案与 aria 状态。
 * - completed 缺结果资产时显示来源异常标记，不渲染假图、不开放结果动作
 *   （比较/首选/作为新参考；架构 §7.4）。
 * - 列表失败（L2）保留 previous data 并提供重试；更旧结果仍可打开完整
 *   Iteration（Iteration Memory 是完整历史）。
 *
 * plan-06（架构 §6.6 / §6.7 / AC-04、AC-06、AC-07）扩展：
 * - 首选滚出五条窗口时显示「首选已在 Iteration Memory」与打开详情动作；
 *   无效首选（不同方向/failed/无资产）只显示无效原因提示，不呈现窗口外提示。
 * - 每个完成条目提供 Memory 动作（无来源 Memory → 保存向导；有 → 代表结果确认）。
 * - 有来源 Memory 时渲染验证状态位（服务端详情派生，客户端不乐观伪造）。
 */

/** 无效首选清理提示（detail 验证发现结构性无效事实时由页面写入） */
export interface PreferredInvalidNotice {
  iterationId: string;
  /** 无效原因（failed / 无结果资产 / 不同方向等，直接展示给用户） */
  reason: string;
}

/** 来源 Memory 验证状态位（由服务端详情派生；写成功回读完成后更新） */
export interface DirectionMemoryStatus {
  memoryName: string | null;
  verificationStatus: "pending_verification" | "user_verified";
  representativeIterationId: string | null;
}

export interface DirectionResultRailProps {
  feed: {
    completed: DirectionIterationListItem[];
    active: DirectionIterationListItem | null;
    latestFailure: DirectionIterationListItem | null;
  } | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string | null;
  /** 瞬时当前所选 completed id（无则空串/null） */
  selectedIterationId: string | null;
  unreadResultId?: string | null;
  onViewLatest?: () => void;
  /** 会话首选 id（只由用户操作写入；滚出五条窗口仍保留） */
  preferredIterationId: string | null;
  /** 无效首选清理提示（存在时不呈现窗口外提示，AC-06 两种出口互斥） */
  preferredInvalidNotice?: PreferredInvalidNotice | null;
  /** 来源 Memory 验证状态位（有 currentTemplateId 时由页面传入） */
  memoryStatus?: DirectionMemoryStatus | null;
  onSelect: (iterationId: string) => void;
  onSetPreferred: (iterationId: string) => void;
  onCompare: (iterationId: string) => void;
  /** 沿用当前草稿再次生成 */
  onRegenerate: () => void;
  /** 作为新参考（plan-06：方向切换守卫 + sourceAssetId 分析） */
  onUseAsNewReference: (iterationId: string) => void;
  /** Memory 动作（无来源 Memory → 保存向导预选；有 → 代表结果确认） */
  onOpenMemoryAction: (iterationId: string) => void;
  onOpenIteration: (iterationId?: string) => void;
  /** 窗口外首选「打开详情」（导航 Iteration Memory 完整历史） */
  onOpenPreferredDetail: (iterationId: string) => void;
  /** 最近失败主动重试：POST 新任务，不复活原任务 */
  onRetryFailure: () => void;
  /** 方向 feed 失败重试（保留 previous data） */
  onRetryFeed: () => void;
}

function RailActionButton({
  label,
  testId,
  icon,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  testId: string;
  icon: LucideIcon;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={disabled ? `${label} (result image unavailable)` : label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
        pressed
          ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
          : "bg-[var(--surface-bright)]/70 text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <AppIcon icon={icon} size={14} strokeWidth={1.75} />
    </button>
  );
}

export function DirectionResultRail({
  feed,
  isLoading,
  isError,
  errorMessage,
  selectedIterationId,
  unreadResultId,
  onViewLatest,
  preferredIterationId,
  preferredInvalidNotice,
  memoryStatus,
  onSelect,
  onSetPreferred,
  onCompare,
  onRegenerate,
  onUseAsNewReference,
  onOpenMemoryAction,
  onOpenIteration,
  onOpenPreferredDetail,
  onRetryFailure,
  onRetryFeed,
}: DirectionResultRailProps) {
  const completed = feed?.completed ?? [];
  const active = feed?.active ?? null;
  const latestFailure = feed?.latestFailure ?? null;
  const hasAnyResult = completed.length > 0 || !!active || !!latestFailure;

  return (
    <section
      data-testid="direction-result-rail"
      data-selected-id={selectedIterationId ?? ""}
      data-preferred-id={preferredIterationId ?? ""}
      aria-label="Current results"
      className="mx-4 mb-2 shrink-0 rounded-xl bg-[var(--surface-low)]/56 px-2.5 py-1.5 ring-1 ring-[var(--border-static)] sm:mx-6 lg:mx-8"
    >
      {/* 空态/加载态保持单行紧凑：rail 常驻三栏下方，不能挤压专业画布可用高度 */}
      <div className="flex min-w-0 items-center justify-between gap-2 px-1">
        <p className="label-tech shrink-0 text-[var(--text-muted)]"> Current results </p>
        {isLoading && !feed ? (
          <span
            role="status"
            className="truncate text-[0.65rem] leading-4 text-[var(--text-muted)]"
          >
             Loading results for this direction... </span>
        ) : !hasAnyResult ? (
          <span className="truncate text-[0.65rem] leading-4 text-[var(--text-secondary)]">
             Your renders and their progress will appear here. </span>
        ) : (
          <span className="truncate text-[0.65rem] leading-4 text-[var(--text-muted)]">
             Latest  {completed.length}   completed results. Full history in Iteration Memory </span>
        )}
      </div>

      {unreadResultId && <button type="button" onClick={onViewLatest} className="btn-secondary mt-1 rounded-lg px-2 py-1 text-xs">View latest result</button>}

      {isError && (
        <div
          data-testid="direction-feed-error"
          className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-bright)]/72 px-2.5 py-1.5 ring-1 ring-[var(--border-interactive)]"
        >
          <p className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">
             Results could not be refreshed {errorMessage ? `：${errorMessage}` : ""} . Your results and draft are preserved. Retry or open Iteration Memory. </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="direction-feed-retry"
              onClick={onRetryFeed}
              className="btn-secondary h-7 rounded-lg px-2.5 text-xs font-medium"
            >
               Retry </button>
            {/* plan-07（架构 §8.2 L2「结果位显示重试/打开 Iteration」）：
                feed 失败时提供打开完整 Iteration 的出口——完整历史由
                Iteration Memory 管理，不依赖本次 feed 刷新成功 */}
            <button
              type="button"
              data-testid="direction-feed-open-iteration"
              onClick={() => onOpenIteration()}
              className="btn-secondary h-7 rounded-lg px-2.5 text-xs font-medium"
            >
               Open full iteration </button>
          </div>
        </div>
      )}

      {hasAnyResult && (
        <div className="mt-1 flex items-stretch gap-2 overflow-x-auto px-1 pb-0.5">
          {completed.map((item) => {
            const assetMissing = !item.resultAssetId || !item.resultFileUrl;
            const isSelected = selectedIterationId === item.id;
            const isPreferred = preferredIterationId === item.id;
            return (
              <div
                key={item.id}
                data-testid="direction-completed-item"
                data-iteration-id={item.id}
                data-selected={isSelected}
                data-preferred={isPreferred}
                {...(assetMissing ? { "data-asset-missing": "true" } : {})}
                role="group"
                aria-label={`Result ${item.promptSummary}`}
                onClick={() => onSelect(item.id)}
                className={`flex w-28 shrink-0 cursor-pointer flex-col gap-1.5 rounded-xl p-1.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--accent-primary)] ${
                  isSelected
                    ? "bg-[color-mix(in_oklch,var(--surface-bright)_82%,var(--accent-primary-soft)_18%)] ring-1 ring-[var(--border-interactive)]"
                    : "bg-[var(--surface-bright)]/56 hover:bg-[var(--surface-bright)]/80"
                }`}
              >
                <button
                  type="button"
                  aria-label={`Select result ${item.promptSummary}`}
                  aria-current={isSelected}
                  disabled={assetMissing}
                  onClick={() => onSelect(item.id)}
                  className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-low)] ring-1 ring-[var(--border-static)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                >
                  {assetMissing ? (
                    <span className="flex flex-col items-center gap-0.5 px-1 text-center text-[0.625rem] leading-3 text-[var(--text-muted)]">
                      <AppIcon icon={ImageIcon} size={16} strokeWidth={1.75} />
                       Source unavailable: result image missing </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.resultFileUrl ?? ""}
                      alt={`Result ${item.promptSummary}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
                <div className="flex items-center justify-center gap-1">
                  <RailActionButton
                    label={isPreferred ? "Clear preferred result" : "Set as preferred result"}
                    testId="direction-item-preferred"
                    icon={Star}
                    pressed={isPreferred}
                    disabled={assetMissing}
                    onClick={() => onSetPreferred(item.id)}
                  />
                  <RailActionButton
                    label="Compare with reference"
                    testId="direction-item-compare"
                    icon={Columns2}
                    disabled={assetMissing}
                    onClick={() => onCompare(item.id)}
                  />
                  <RailActionButton
                    label="Review generation bar"
                    testId="direction-item-regenerate"
                    icon={RefreshCw}
                    disabled={assetMissing}
                    onClick={onRegenerate}
                  />
                  <RailActionButton
                    label="Use as new reference"
                    testId="direction-item-new-reference"
                    icon={Copy}
                    disabled={assetMissing}
                    onClick={() => onUseAsNewReference(item.id)}
                  />
                  <RailActionButton
                    label="Save or update Style Memory"
                    testId="direction-item-save-memory"
                    icon={Bookmark}
                    disabled={assetMissing}
                    onClick={() => onOpenMemoryAction(item.id)}
                  />
                  <RailActionButton
                    label="Open full iteration"
                    testId="direction-item-open-iteration"
                    icon={ExternalLink}
                    onClick={() => onOpenIteration(item.id)}
                  />
                </div>
              </div>
            );
          })}

          {active && (
            <div
              data-testid="direction-active-face"
              data-iteration-id={active.id}
              role="status"
              aria-label="Rendering"
              className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-[var(--surface-bright)]/56 p-1.5 ring-1 ring-[var(--border-static)]"
            >
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-primary)] motion-reduce:animate-none"
                aria-hidden="true"
              />
              <p className="px-1 text-center text-[0.625rem] leading-3 text-[var(--text-secondary)]">
                 Rendering </p>
              <p className="w-full truncate px-1 text-center text-[0.625rem] leading-3 text-[var(--text-muted)]">
                {active.promptSummary}
              </p>
            </div>
          )}

          {latestFailure && (
            <div
              data-testid="direction-failure-face"
              data-iteration-id={latestFailure.id}
              role="alert"
              aria-label="Latest render failed"
              className="flex w-36 shrink-0 flex-col justify-between gap-1 rounded-xl bg-[var(--surface-bright)]/56 p-1.5 ring-1 ring-[var(--border-interactive)]"
            >
              <div className="min-w-0">
                <p className="text-[0.625rem] font-semibold leading-3 text-[var(--text-secondary)]">
                   Latest render failed </p>
                <p
                  title={latestFailure.errorMessage ?? undefined}
                  className="mt-0.5 line-clamp-2 break-words text-[0.625rem] leading-3 text-[var(--text-muted)]"
                >
                  {latestFailure.errorMessage ?? "Generation failed"}
                </p>
              </div>
              <button
                type="button"
                data-testid="direction-failure-retry"
                onClick={onRetryFailure}
                className="btn-secondary flex h-6 w-full items-center justify-center gap-1 rounded-lg px-1.5 text-[0.625rem] font-medium"
              >
                <AppIcon icon={RefreshCw} size={12} strokeWidth={1.75} />
                 Review generation options </button>
            </div>
          )}
        </div>
      )}

      {/* plan-06（架构 §6.7.4 / AC-06）：首选滚出五条窗口仍按 detail 有效——
          保留 ID 并提供「首选已在 Iteration Memory」+ 打开详情；只有详情验证
          无效才清除并说明原因，两种出口互斥 */}
      {preferredIterationId &&
        !completed.some((item) => item.id === preferredIterationId) &&
        !preferredInvalidNotice && (
          <div
            data-testid="direction-preferred-external"
            data-iteration-id={preferredIterationId}
            className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-bright)]/56 px-2.5 py-1.5 ring-1 ring-[var(--border-static)]"
          >
            <p className="min-w-0 text-[0.65rem] leading-4 text-[var(--text-secondary)]">
               Your preferred result is preserved in Iteration Memory, outside the latest five results. </p>
            <button
              type="button"
              data-testid="direction-preferred-open-detail"
              onClick={() => onOpenPreferredDetail(preferredIterationId)}
              className="btn-secondary h-6 shrink-0 rounded-lg px-2 text-[0.625rem] font-medium"
            >
               Open details </button>
          </div>
        )}

      {preferredInvalidNotice && (
        <p
          data-testid="direction-preferred-invalid"
          data-iteration-id={preferredInvalidNotice.iterationId}
          role="status"
          className="mt-1.5 px-1 text-[0.65rem] leading-4 text-[var(--text-secondary)]"
        >
           Preferred result cleared:  {preferredInvalidNotice.reason} . Select another result from this direction. </p>
      )}

      {memoryStatus && (
        <p
          data-testid="direction-memory-status"
          data-verification={memoryStatus.verificationStatus}
          data-representative-iteration-id={
            memoryStatus.representativeIterationId ?? ""
          }
          className="mt-1 px-1 font-mono text-[0.625rem] leading-4 tracking-wide text-[var(--text-muted)]"
        >
           Source Memory {memoryStatus.memoryName ? `「${memoryStatus.memoryName}」` : ""}
           Verification:  {memoryStatus.verificationStatus === "user_verified"
            ? "User verified"
            : "Pending verification"}
          {memoryStatus.representativeIterationId
            ? ` - Representative result ${memoryStatus.representativeIterationId}`
            : ""}
        </p>
      )}
    </section>
  );
}
