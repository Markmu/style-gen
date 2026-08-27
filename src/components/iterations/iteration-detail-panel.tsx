"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock3,
  Copy,
  CornerUpLeft,
  ImageIcon,
  Info,
  X,
} from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ReplaceConfirmDialog } from "@/components/iterations/replace-confirm-dialog";
import { SaveStyleMemoryDialog } from "@/components/iterations/save-style-memory-dialog";
import { useIterationRestore } from "@/hooks/use-iteration-restore";
import type { StatusTone } from "@/lib/ui/status-copy";
import {
  getIterationDegradedCopy,
  getIterationFailureCopy,
  ITERATION_DEGRADED_COPY_KEYS,
  ITERATION_PROCESSING_COPY,
  toIterationDetailModel,
  type IterationDetailModel,
} from "@/lib/iterations/view-model";
import type { IterationDetail } from "@/types/models";

/**
 * plan-03: Iteration Memory 三态详情面板（架构 §3.3 详情状态机、§6.2、§6.5）。
 *
 * - completed：参考图与真实结果并排（第一视觉焦点）+ "当时的创作上下文"分区块。
 * - processing：阶段文案 + "可以离开此页面"安抚 + 已保留上下文；不渲染任何
 *   生成/重复提交入口，也不渲染底部动作区。
 * - failed：失败说明（errorMessage → 业务文案）+ 保留的完整上下文。
 * - 缺失标记（recipeSource/variablesSource/sourceImageUrl）显示三段式降级提示，
 *   不阻断其余区块；来源图缺失显示占位说明而非裂图。
 * - 底部动作区：plan-04 填充默认主动作——completed"继续此方向"、failed
 *   "修正并继续"（同一恢复链路，架构 §6.3 步骤 1）；primaryActions /
 *   secondaryActions 插槽仍可覆盖/追加（显式传入 primaryActions 时不渲染内置
 *   主动作，避免重复）。恢复守卫判定 confirm 时弹出替换确认对话框；确认
 *   对话框挂起期间切换详情会关闭对话框且不应用载荷。
 * - 安全（架构 §8.3）：提示、排除项、失败说明与证据文本一律纯文本渲染。
 */

export interface IterationDetailPanelProps {
  detail: IterationDetail;
  onBackToList: () => void;
  onPrevious: () => void;
  onNext: () => void;
  /** 列表边界（最老/最新）时对应方向禁用 */
  hasPrevious: boolean;
  hasNext: boolean;
  /** 动作区插槽（plan-04 填充 primaryActions，plan-05 填充 secondaryActions） */
  primaryActions?: ReactNode;
  secondaryActions?: ReactNode;
  /** processing 轮询连续失败 3 次：保留内容 + "更新暂不可用 + 重试" */
  updatesUnavailable?: boolean;
  onRetryUpdates?: () => void;
}

function StatusBadge({
  tone,
  label,
}: {
  tone: StatusTone;
  label: string;
}) {
  return (
    <span
      aria-label={`Status: ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 text-[0.65625rem] font-semibold ${
        tone === "success"
          ? "text-[var(--status-success-text)]"
          : tone === "danger"
            ? "text-[var(--status-danger-text)]"
            : "text-[var(--status-accent-text)]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "success"
            ? "bg-[var(--color-success)]"
            : tone === "danger"
              ? "bg-[var(--color-error)]"
              : "bg-[var(--accent-primary)]"
        }`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** 参考图：缺失（sourceImageUrl null）或加载失败时显示占位说明，不渲染裂图（L1） */
function ReferenceImage({
  sourceImageUrl,
  hasSourceImage,
  promptSummary,
}: {
  sourceImageUrl: string | null;
  hasSourceImage: boolean;
  promptSummary: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!hasSourceImage || failed) {
    const copy = getIterationDegradedCopy(
      ITERATION_DEGRADED_COPY_KEYS.sourceImageMissing,
    );
    return (
      <div
        data-testid="iteration-reference-missing"
        className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)] px-3 text-center"
      >
        <AppIcon icon={ImageIcon} size={18} className="text-[var(--text-muted)]" />
        <span className="text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
          {copy.what} {copy.preserved}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="iteration-reference-image"
      className="relative overflow-hidden rounded-xl border border-[var(--border-static)] bg-[var(--surface-media)] shadow-xs"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sourceImageUrl ?? ""}
        alt={`Reference image: ${promptSummary}`}
        onError={() => setFailed(true)}
        className="aspect-[4/3] w-full object-cover"
      />
    </div>
  );
}

/** 结果图：仅 completed 且有结果 URL；加载失败降级为占位说明（L1） */
function ResultImage({
  resultFileUrl,
  hasResult,
  promptSummary,
}: {
  resultFileUrl: string | null;
  hasResult: boolean;
  promptSummary: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!hasResult) return null;

  if (failed) {
    const copy = getIterationDegradedCopy(
      ITERATION_DEGRADED_COPY_KEYS.resultPreviewUnavailable,
    );
    return (
      <div
        data-testid="iteration-result-missing"
        className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)] px-3 text-center"
      >
        <AppIcon icon={ImageIcon} size={18} className="text-[var(--text-muted)]" />
        <span className="text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
          {copy.what} {copy.preserved}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="iteration-result-image"
      className="relative overflow-hidden rounded-xl border border-[var(--border-static)] bg-[var(--surface-media)] shadow-xs"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resultFileUrl ?? ""}
        alt={`Generated result: ${promptSummary}`}
        onError={() => setFailed(true)}
        className="aspect-[4/3] w-full object-cover"
      />
    </div>
  );
}

function DegradedNotice({ copyKey }: { copyKey: string }) {
  const copy = getIterationDegradedCopy(copyKey);
  return (
    <div
      data-degraded={copyKey}
      className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--border-static)] bg-[var(--surface-low)] px-2.5 py-2 text-[0.6875rem] leading-5 text-[var(--text-secondary)]"
    >
      <AppIcon
        icon={Info}
        size={14}
        className="mt-0.5 shrink-0 text-[var(--text-muted)]"
      />
      <p>
        {copy.what} {copy.preserved} {copy.next}
      </p>
    </div>
  );
}

/**
 * plan-05: 详情底部 secondaryActions 默认内容——保存为 Style Memory 三态
 * （可保存入口 / 已保存态 + 打开 / 来源缺失说明，架构 §6.4、§5.2）。
 */
function IterationSaveActions({
  isEligible,
  savedTemplate,
  sourceAssetId,
  onOpenSaveDialog,
  onOpenSavedMemory,
}: {
  /** completed 且有真实结果（保存资格的公共前置） */
  isEligible: boolean;
  savedTemplate: { id: string; name: string } | null;
  sourceAssetId: string | null;
  onOpenSaveDialog: () => void;
  onOpenSavedMemory: (templateId: string) => void;
}) {
  if (!isEligible) return null;

  if (savedTemplate) {
    return (
      <div
        data-testid="iteration-saved-state"
        className="flex min-h-0 w-full flex-wrap items-center gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-3 py-1.5 shadow-xs sm:w-auto"
      >
        <AppIcon
          icon={CircleCheck}
          size={15}
          className="shrink-0 text-[var(--color-success)]"
        />
        <span className="text-xs leading-5 text-[var(--text-secondary)]">
          Saved as Style Memory:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {savedTemplate.name}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onOpenSavedMemory(savedTemplate.id)}
          className="btn-secondary flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
        >
          <AppIcon icon={ArrowUpRight} size={13} />
          Open
        </button>
      </div>
    );
  }

  if (!sourceAssetId) {
    return (
      <p
        data-testid="iteration-save-unavailable"
        className="max-w-sm text-xs leading-5 text-[var(--text-muted)]"
      >
        The source image for this attempt is missing, so it cannot be saved as a
        Style Memory. The result and context above remain readable.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSaveDialog}
      className="btn-secondary flex w-full items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all sm:w-auto"
    >
      <AppIcon icon={BookmarkPlus} size={15} />
      Save as Style Memory
    </button>
  );
}

/** 提示文本区块，带有一键复制反馈 */
function PromptBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <section
      data-testid="iteration-context-prompt"
      aria-label="Prompt"
      className="iteration-detail-section space-y-2"
    >
      <div className="flex items-center justify-between">
        <p className="label-tech text-[var(--text-muted)]">Prompt</p>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy prompt text"
          className="interactive-lift flex items-center gap-1 rounded-md border border-[var(--border-static)] bg-[var(--surface-control)] px-2 py-1 text-[0.6875rem] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-interactive)] hover:text-[var(--text-primary)]"
        >
          <AppIcon
            icon={copied ? Check : Copy}
            size={12}
            className={copied ? "text-[var(--color-success)]" : ""}
          />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="rounded-lg border border-[var(--border-static)]/60 bg-[var(--surface-low)]/80 p-3">
        <p className="whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-primary)]">
          {prompt}
        </p>
      </div>
    </section>
  );
}

/**
 * 右区"当时的创作上下文"分区块。
 * 所有快照文本（facet 值、不变量、提示、排除项）均按纯文本渲染（架构 §8.3）。
 */
function ContextBlocks({ model }: { model: IterationDetailModel }) {
  const facetGroups = new Map<string, IterationDetailModel["facets"]>();
  for (const facet of model.facets) {
    const group = facetGroups.get(facet.label) ?? [];
    group.push(facet);
    facetGroups.set(facet.label, group);
  }

  return (
    <>
      <section
        data-testid="iteration-context-evidence"
        data-source={model.recipeSource}
        aria-label="Style evidence and invariants"
        className="iteration-detail-section space-y-2.5"
      >
        <p className="label-tech text-[var(--text-muted)]">
          Style evidence &amp; invariants
        </p>
        {model.recipeSource === "fallback" && (
          <DegradedNotice copyKey={ITERATION_DEGRADED_COPY_KEYS.recipeSnapshotFallback} />
        )}
        {model.recipeSource === "missing" ? (
          <DegradedNotice copyKey={ITERATION_DEGRADED_COPY_KEYS.recipeSnapshotMissing} />
        ) : (
          <>
            {model.facets.length > 0 && (
              <ul className="space-y-3">
                {Array.from(facetGroups.entries()).map(([label, facets]) => (
                  <li
                    key={label}
                    className="border-t border-[var(--border-static)]/70 pt-3 first:border-t-0 first:pt-0"
                  >
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {label}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {facets.map((facet) => (
                        <li
                          key={facet.id}
                          className="flex flex-wrap items-baseline gap-x-2 text-[0.6875rem] leading-5 text-[var(--text-secondary)]"
                        >
                          <span className="break-words">{facet.summary}</span>
                          {facet.confidence !== null && (
                            <span className="shrink-0 font-mono text-[0.625rem] font-semibold text-[var(--text-muted)]">
                              {Math.round(facet.confidence * 100)}%
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {model.invariants.length > 0 && (
              <div className="pt-1">
                <p className="label-tech mb-1.5 text-[0.625rem] text-[var(--text-muted)]">
                  Invariants
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {model.invariants.map((invariant) => (
                    <li
                      key={invariant.id}
                      className="rounded-full border border-[var(--border-static)] bg-[var(--surface-control)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-secondary)] shadow-2xs"
                      title={invariant.dimensionLabel}
                    >
                      {invariant.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <PromptBlock prompt={model.prompt} />

      <section
        data-testid="iteration-context-variables"
        data-source={model.variablesSource}
        aria-label="Variables and exclusions"
        className="iteration-detail-section space-y-2.5"
      >
        <p className="label-tech text-[var(--text-muted)]">
          Variables &amp; exclusions
        </p>
        {model.variablesSource === "missing" ? (
          <DegradedNotice
            copyKey={ITERATION_DEGRADED_COPY_KEYS.variablesSnapshotMissing}
          />
        ) : model.variables.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {model.variables.map((variable) => (
              <div
                key={variable.name}
                className="border-t border-[var(--border-static)]/70 py-2.5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
              >
                <dt className="label-tech text-[0.625rem] text-[var(--text-muted)]">
                  {variable.label ?? variable.name}
                </dt>
                <dd className="mt-1 break-words font-mono text-[0.6875rem] font-medium leading-5 text-[var(--text-primary)]">
                  {variable.defaultValue}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">
            No variables were set for this attempt.
          </p>
        )}
        {model.hasNegativePrompt && (
          <div className="border-t border-[var(--border-static)]/70 pt-2.5">
            <p className="label-tech mb-1 text-[0.625rem] text-[var(--text-muted)]">
              Exclusions
            </p>
            <p className="whitespace-pre-wrap break-words text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
              {model.negativePrompt}
            </p>
          </div>
        )}
      </section>

      <section
        data-testid="iteration-context-settings"
        aria-label="Generation settings"
        className="iteration-detail-section"
      >
        <p className="label-tech text-[var(--text-muted)]">Generation settings</p>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 text-[0.6875rem]">
          {/* dt/dd 与相邻网格单元间的显式空格保持 textContent 词边界（E2E 断言 \bhd\b 等） */}
          <div className="border-t border-[var(--border-static)]/70 py-2.5">
            <dt className="label-tech text-[0.625rem] text-[var(--text-muted)]">Aspect ratio</dt>{" "}
            <dd className="mt-1 font-mono font-medium text-[var(--text-primary)]">
              {model.params.aspectRatio}
            </dd>
          </div>{" "}
          <div className="border-t border-[var(--border-static)]/70 py-2.5">
            <dt className="label-tech text-[0.625rem] text-[var(--text-muted)]">Quality</dt>{" "}
            <dd className="mt-1 font-mono font-medium uppercase text-[var(--text-primary)]">
              {model.params.quality}
            </dd>
          </div>{" "}
          <div className="col-span-2 border-t border-[var(--border-static)]/70 py-2.5">
            <dt className="label-tech text-[0.625rem] text-[var(--text-muted)]">Model</dt>{" "}
            <dd className="mt-1 break-all font-mono font-medium text-[var(--text-primary)]">
              {model.modelName}
            </dd>
          </div>{" "}
          <div className="col-span-2 border-t border-[var(--border-static)]/70 py-2.5">
            <dt className="label-tech text-[0.625rem] text-[var(--text-muted)]">Created</dt>{" "}
            <dd className="mt-1 text-[var(--text-secondary)]">
              {model.createdAtLabel}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

export function IterationDetailPanel({
  detail,
  onBackToList,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  primaryActions,
  secondaryActions,
  updatesUnavailable = false,
  onRetryUpdates,
}: IterationDetailPanelProps) {
  const model = toIterationDetailModel(detail);
  const promptSummary = model.prompt.slice(0, 120);
  const router = useRouter();
  const queryClient = useQueryClient();

  // plan-04: "继续此方向 / 修正并继续"恢复链路（completed/failed 共用）
  const { restore, pendingReplace, confirmReplace, cancelReplace } =
    useIterationRestore();

  // plan-05（Task 4）: 保存成功后直接消费 201 响应 { id, name } 写入详情缓存
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const lastDetailIdRef = useRef(detail.id);
  useEffect(() => {
    if (lastDetailIdRef.current !== detail.id) {
      lastDetailIdRef.current = detail.id;
      cancelReplace();
      setIsSaveDialogOpen(false);
    }
  }, [detail.id, cancelReplace]);

  const savedTemplate = detail.savedTemplate;
  const isSaveEligible = model.status === "completed" && model.hasResult;

  const openSavedMemory = useCallback(
    (templateId: string) => {
      router.push(`/workspace/templates?focus=${templateId}`);
    },
    [router],
  );

  const handleStyleMemorySaved = useCallback(
    (template: { id: string; name: string }) => {
      queryClient.setQueryData<IterationDetail>(
        ["iteration-detail", detail.id],
        (current) =>
          current
            ? { ...current, savedTemplate: { id: template.id, name: template.name } }
            : current,
      );
      setIsSaveDialogOpen(false);
    },
    [queryClient, detail.id],
  );

  const continueDirectionLabel =
    model.status === "failed" ? "Fix and continue" : "Continue this direction";

  return (
    <div
      data-testid="iteration-detail-panel"
      data-status={model.status}
      data-iteration-id={model.id}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-page)]"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border-static)] bg-[var(--surface-panel)] px-3 py-3 sm:flex-nowrap sm:px-4">
        <button
          type="button"
          onClick={onBackToList}
          aria-label="Back to list"
          className="btn-secondary flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium xl:hidden"
        >
          <AppIcon icon={ArrowLeft} size={14} />
          <span>Back</span>
        </button>
        <div className="order-3 min-w-0 flex-1 basis-full sm:order-none sm:basis-auto">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2
              data-testid="iteration-detail-title"
              title={promptSummary}
              className="truncate text-[0.8125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
            >
              {promptSummary || "Untitled iteration"}
            </h2>
            <StatusBadge tone={model.statusTone} label={model.statusLabel} />
          </div>
          <p className="mt-0.5 truncate text-[0.65625rem] text-[var(--text-muted)]">
            {model.createdAtLabel}
          </p>
        </div>
        <div
          role="group"
          aria-label="Iteration navigation"
          className="ml-auto flex shrink-0 items-center gap-1"
        >
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Previous iteration"
            title="Previous iteration"
            className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium"
          >
            <AppIcon icon={ChevronUp} size={14} />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next iteration"
            title="Next iteration"
            className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium"
          >
            <AppIcon icon={ChevronDown} size={14} />
          </button>
          <button
            type="button"
            onClick={onBackToList}
            aria-label="Close detail"
            title="Close detail"
            className="btn-secondary hidden h-8 w-8 items-center justify-center rounded-lg xl:flex"
          >
            <AppIcon icon={X} size={14} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3.5 sm:p-4 lg:p-5">
        {model.status === "processing" && (
          <section
            data-testid="iteration-processing-notice"
            aria-live="polite"
            className="rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--status-accent-bg)] p-3.5 shadow-xs"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <AppIcon
                icon={Clock3}
                size={16}
                className="text-[var(--status-accent-text)]"
              />
              {ITERATION_PROCESSING_COPY.title}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">
              {ITERATION_PROCESSING_COPY.reassurance}
            </p>
          </section>
        )}

        {updatesUnavailable && (
          <div
            data-testid="iteration-updates-unavailable"
            role="status"
            className="rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)] p-3.5 shadow-xs"
          >
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Live updates are temporarily unavailable
            </p>
            <p className="mt-1 text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
              The detail could not refresh automatically. The content below
              stays as last loaded, and the list is not affected.
            </p>
            <button
              type="button"
              onClick={onRetryUpdates}
              className="btn-secondary mt-2.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              Retry updates
            </button>
          </div>
        )}

        {model.status === "failed" && (
          <section
            data-testid="iteration-failure-reason"
            role="alert"
            className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--status-danger-bg)] p-3.5 shadow-xs"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--status-danger-text)]">
              <AppIcon
                icon={AlertTriangle}
                size={16}
                className="text-[var(--status-danger-text)]"
              />
              {getIterationFailureCopy(model.errorMessage).title}
            </p>
            <p className="mt-1.5 break-words text-xs leading-5 text-[var(--text-primary)]">
              {getIterationFailureCopy(model.errorMessage).reason}
            </p>
            <p className="mt-1 text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
              {getIterationFailureCopy(model.errorMessage).preserved}{" "}
              {getIterationFailureCopy(model.errorMessage).next}
            </p>
          </section>
        )}

        {/* plan-07（AC-06 / PRD 规则 24）：来源 Style Memory 标注——本次迭代自哪条 Memory 派生 */}
        {detail.sourceTemplateName && (
          <div
            data-testid="iteration-source-memory"
            className="flex items-center gap-2 rounded-xl border border-[var(--border-static)]/60 bg-[var(--surface-low)]/60 px-3.5 py-2.5 shadow-xs"
          >
            <AppIcon
              icon={BookmarkPlus}
              size={14}
              className="shrink-0 text-[var(--accent-primary)]"
            />
            <p className="min-w-0 truncate text-xs leading-5 text-[var(--text-primary)]">
              <span className="font-semibold">来源 Style Memory</span>
              <span className="px-1 text-[var(--text-muted)]">·</span>
              <span className="text-[var(--text-secondary)]">
                {detail.sourceTemplateName}
              </span>
            </p>
          </div>
        )}

        {/* 左区：参考图与生成结果并排（completed 的第一视觉焦点） */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <figure className="min-w-0">
            <ReferenceImage
              sourceImageUrl={model.sourceImageUrl}
              hasSourceImage={model.hasSourceImage}
              promptSummary={promptSummary}
            />
            <figcaption className="mt-1.5 text-center font-mono text-[0.625rem] uppercase tracking-wider text-[var(--text-muted)]">
              Reference
            </figcaption>
          </figure>
          {model.hasResult && (
            <figure className="min-w-0">
              <ResultImage
                resultFileUrl={model.resultFileUrl}
                hasResult={model.hasResult}
                promptSummary={promptSummary}
              />
              <figcaption className="mt-1.5 text-center font-mono text-[0.625rem] uppercase tracking-wider text-[var(--text-muted)]">
                Result
              </figcaption>
            </figure>
          )}
        </div>

        {/* 右区：当时的创作上下文（分区块） */}
        <ContextBlocks model={model} />
      </div>

      {/* 底部动作区插槽：completed/failed 渲染默认主动作（plan-04）与默认 secondaryActions 保存链路（plan-05）；processing 不渲染 */}
      {model.status !== "processing" && (
        <footer
          data-testid="iteration-detail-actions"
          aria-label="Iteration detail actions"
          className="flex min-h-[3.5rem] shrink-0 flex-col items-stretch justify-end gap-2.5 border-t border-[var(--border-static)] bg-[var(--surface-panel)] px-3 py-3 sm:flex-row sm:items-center sm:px-4"
        >
          {secondaryActions ?? (
            <IterationSaveActions
              isEligible={isSaveEligible}
              savedTemplate={savedTemplate}
              sourceAssetId={detail.sourceAssetId}
              onOpenSaveDialog={() => setIsSaveDialogOpen(true)}
              onOpenSavedMemory={openSavedMemory}
            />
          )}
          {primaryActions ?? (
            <button
              type="button"
              onClick={() => restore(detail)}
              className="btn-primary flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold tracking-wide sm:w-auto"
            >
              <AppIcon icon={CornerUpLeft} size={14} />
              {continueDirectionLabel}
            </button>
          )}
        </footer>
      )}

      {/* plan-04: 守卫返回 confirm 时的替换确认对话框 */}
      <ReplaceConfirmDialog
        open={pendingReplace !== null}
        currentPrompt={pendingReplace?.currentPrompt ?? ""}
        targetPrompt={pendingReplace?.target.promptSnapshot ?? ""}
        onCancel={cancelReplace}
        onConfirm={confirmReplace}
      />

      {/* plan-05→plan-06: 保存为 Style Memory 三步向导（按 IterationDetail 实际字段传参） */}
      <SaveStyleMemoryDialog
        open={isSaveDialogOpen}
        promptSnapshot={detail.promptSnapshot}
        variables={detail.variables}
        negativePromptSnapshot={detail.negativePromptSnapshot}
        recipe={detail.recipe}
        recipeSource={detail.recipeSource}
        sourceImageUrl={detail.sourceImageUrl}
        resultFileUrl={detail.resultFileUrl}
        sourceAssetId={detail.sourceAssetId}
        sourceGenerationTaskId={detail.id}
        onSaved={handleStyleMemorySaved}
        onClose={() => setIsSaveDialogOpen(false)}
      />
    </div>
  );
}

/** 详情加载中（DLoading）：面板骨架，不干扰列表 */
export function IterationDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading iteration detail"
      className="flex h-full flex-col gap-3.5 bg-[var(--surface-page)] p-4"
    >
      <div className="h-9 w-full animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="aspect-[4/3] animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none" />
        <div className="aspect-[4/3] animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none" />
      </div>
      <div className="h-28 w-full animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none" />
    </div>
  );
}

/** 详情错误位（DError）：列表与视图状态不动，可重试或关闭（架构 §8.2 L3） */
export function IterationDetailErrorFace({
  message,
  onRetry,
  onClose,
}: {
  message?: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const reason = message ? `${message} ` : "";
  return (
    <div
      data-testid="iteration-detail-error"
      role="alert"
      aria-live="assertive"
      className="flex h-full flex-col gap-3.5 bg-[var(--surface-page)] p-5"
    >
      <p className="label-tech text-[var(--text-muted)]">Iteration detail</p>
      <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
        Could not open this iteration
      </h3>
      <p className="text-xs leading-5 text-[var(--text-secondary)]">
        {reason}The detail for this iteration could not load, and the list,
        search, and filters stay exactly as they are. Retry to load the detail
        again, or close it to return to the list.
      </p>
      <div className="mt-auto flex justify-end gap-2.5 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary rounded-lg px-3.5 py-2 text-xs font-medium"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="btn-primary rounded-lg px-3.5 py-2 text-xs font-medium"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
