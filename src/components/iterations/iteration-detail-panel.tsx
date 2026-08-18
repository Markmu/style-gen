"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock3,
  CornerUpLeft,
  ImageIcon,
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
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
        tone === "success"
          ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
          : tone === "danger"
            ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
            : "bg-[var(--status-accent-bg)] text-[var(--status-accent-text)]"
      }`}
    >
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
        className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-md bg-[var(--surface-low)] px-3 text-center"
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
      className="overflow-hidden rounded-md bg-[var(--surface-low)]"
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
        className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-md bg-[var(--surface-low)] px-3 text-center"
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
      className="overflow-hidden rounded-md bg-[var(--surface-low)]"
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
    <p
      data-degraded={copyKey}
      className="mt-2 rounded-md bg-[var(--surface-low)] px-3 py-2 text-[0.6875rem] leading-5 text-[var(--text-secondary)]"
    >
      {copy.what} {copy.preserved} {copy.next}
    </p>
  );
}

/**
 * plan-05: 详情底部 secondaryActions 默认内容——保存为 Style Memory 三态
 * （可保存入口 / 已保存态 + 打开 / 来源缺失说明，架构 §6.4、§5.2）。
 *
 * - 可保存：completed 且有真实结果且来源资产可用且未保存（AC-06）。
 * - 已保存：`savedTemplate` 非空 → "Saved as Style Memory + Open"，
 *   不再渲染保存按钮（避免重复资产；复制走 Style Memory 既有能力）。
 * - 来源缺失（sourceAssetId null 的旧记录）→ 防御性说明，禁用保存入口。
 * - processing / failed / 无真实结果 → 不出现任何保存入口。
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
        className="flex min-h-0 flex-wrap items-center gap-2"
      >
        <AppIcon
          icon={CircleCheck}
          size={14}
          className="shrink-0 text-[var(--status-success-text)]"
        />
        <span className="text-xs leading-5 text-[var(--text-secondary)]">
          Saved as Style Memory:{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {savedTemplate.name}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onOpenSavedMemory(savedTemplate.id)}
          className="btn-secondary flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
        >
          <AppIcon icon={ArrowUpRight} size={14} />
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
      className="btn-secondary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
    >
      <AppIcon icon={BookmarkPlus} size={14} />
      Save as Style Memory
    </button>
  );
}

/**
 * 右区"当时的创作上下文"分区块。
 * 所有快照文本（facet 值、不变量、提示、排除项）均按纯文本渲染（架构 §8.3）。
 */
function ContextBlocks({ model }: { model: IterationDetailModel }) {
  return (
    <>
      <section
        data-testid="iteration-context-evidence"
        data-source={model.recipeSource}
        aria-label="Style evidence and invariants"
        className="surface-panel rounded-lg p-3"
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
              <ul className="mt-2 space-y-1.5">
                {model.facets.map((facet) => (
                  <li
                    key={facet.id}
                    className="rounded-md bg-[var(--surface-low)] px-2.5 py-1.5"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        {facet.label}
                      </span>
                      {facet.confidence !== null && (
                        <span className="shrink-0 font-mono text-[0.625rem] text-[var(--text-muted)]">
                          {Math.round(facet.confidence * 100)}%
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block break-words text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
                      {facet.summary}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {model.invariants.length > 0 && (
              <>
                <p className="mt-3 text-[0.625rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Invariants
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {model.invariants.map((invariant) => (
                    <li
                      key={invariant.id}
                      className="rounded-full bg-[var(--surface-low)] px-2 py-0.5 text-[0.65rem] text-[var(--text-secondary)]"
                      title={invariant.dimensionLabel}
                    >
                      {invariant.value}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <section
        data-testid="iteration-context-prompt"
        aria-label="Prompt"
        className="surface-panel rounded-lg p-3"
      >
        <p className="label-tech text-[var(--text-muted)]">Prompt</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-primary)]">
          {model.prompt}
        </p>
      </section>

      <section
        data-testid="iteration-context-variables"
        data-source={model.variablesSource}
        aria-label="Variables and exclusions"
        className="surface-panel rounded-lg p-3"
      >
        <p className="label-tech text-[var(--text-muted)]">
          Variables &amp; exclusions
        </p>
        {model.variablesSource === "missing" ? (
          <DegradedNotice
            copyKey={ITERATION_DEGRADED_COPY_KEYS.variablesSnapshotMissing}
          />
        ) : model.variables.length > 0 ? (
          <dl className="mt-2 space-y-1.5">
            {model.variables.map((variable) => (
              <div
                key={variable.name}
                className="rounded-md bg-[var(--surface-low)] px-2.5 py-1.5"
              >
                <dt className="text-[0.65rem] font-medium text-[var(--text-muted)]">
                  {variable.label ?? variable.name}
                </dt>
                <dd className="mt-0.5 break-words text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
                  {variable.defaultValue}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-[0.6875rem] leading-5 text-[var(--text-muted)]">
            No variables were set for this attempt.
          </p>
        )}
        {model.hasNegativePrompt && (
          <>
            <p className="mt-3 text-[0.625rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Exclusions
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
              {model.negativePrompt}
            </p>
          </>
        )}
      </section>

      <section
        data-testid="iteration-context-settings"
        aria-label="Generation settings"
        className="surface-panel rounded-lg p-3"
      >
        <p className="label-tech text-[var(--text-muted)]">Generation settings</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.6875rem]">
          {/* dt/dd 与相邻网格单元间的显式空格保持 textContent 词边界（E2E 断言 \bhd\b 等） */}
          <div>
            <dt className="text-[var(--text-muted)]">Aspect ratio</dt>{" "}
            <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
              {model.params.aspectRatio}
            </dd>
          </div>{" "}
          <div>
            <dt className="text-[var(--text-muted)]">Quality</dt>{" "}
            <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
              {model.params.quality}
            </dd>
          </div>{" "}
          <div className="col-span-2">
            <dt className="text-[var(--text-muted)]">Model</dt>{" "}
            <dd className="mt-0.5 break-all font-mono font-medium text-[var(--text-primary)]">
              {model.modelName}
            </dd>
          </div>{" "}
          <div className="col-span-2">
            <dt className="text-[var(--text-muted)]">Created</dt>{" "}
            <dd className="mt-0.5 text-[var(--text-secondary)]">
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
  // （use-iteration-detail 的 query key），面板原地切换已保存态——不重拉整页、
  // 不导航；再次进入同一详情读到的是已保存数据，不会重复显示保存按钮
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  // 确认对话框挂起期间切换详情（上一条/下一条/重新选择）：关闭对话框且不应用载荷；
  // 切换详情同样关闭保存对话框（新详情的保存资格以其自身数据为准）
  const lastDetailIdRef = useRef(detail.id);
  useEffect(() => {
    if (lastDetailIdRef.current !== detail.id) {
      lastDetailIdRef.current = detail.id;
      cancelReplace();
      setIsSaveDialogOpen(false);
    }
  }, [detail.id, cancelReplace]);

  // 已保存态由详情数据决定（保存成功即写入缓存，架构 §5.2）
  const savedTemplate = detail.savedTemplate;
  // 保存资格公共前置：completed 且有真实结果（架构 §6.4 入口条件）
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

  // completed"继续此方向"，failed"修正并继续"（同一恢复链路，架构 §6.3 步骤 1）
  const continueDirectionLabel =
    model.status === "failed" ? "Fix and continue" : "Continue this direction";

  return (
    <div
      data-testid="iteration-detail-panel"
      data-status={model.status}
      data-iteration-id={model.id}
      className="surface-panel flex h-full min-h-0 flex-col rounded-lg"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border-static)] p-3">
        <button
          type="button"
          onClick={onBackToList}
          className="btn-secondary flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
        >
          <AppIcon icon={ArrowLeft} size={14} />
          Back to list
        </button>
        <StatusBadge tone={model.statusTone} label={model.statusLabel} />
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            className="btn-secondary flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium"
          >
            <AppIcon icon={ChevronUp} size={14} />
            Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="btn-secondary flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium"
          >
            <AppIcon icon={ChevronDown} size={14} />
            Next
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {model.status === "processing" && (
          <section
            data-testid="iteration-processing-notice"
            aria-live="polite"
            className="rounded-lg bg-[var(--status-accent-bg)] p-3"
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
            className="rounded-lg bg-[var(--surface-low)] p-3"
          >
            <p className="text-xs font-medium text-[var(--text-primary)]">
              Live updates are temporarily unavailable
            </p>
            <p className="mt-1 text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
              The detail could not refresh automatically. The content below
              stays as last loaded, and the list is not affected.
            </p>
            <button
              type="button"
              onClick={onRetryUpdates}
              className="btn-secondary mt-2 rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Retry updates
            </button>
          </div>
        )}

        {model.status === "failed" && (
          <section
            data-testid="iteration-failure-reason"
            role="alert"
            className="rounded-lg bg-[var(--status-danger-bg)] p-3"
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

        {/* 左区：参考图与生成结果并排（completed 的第一视觉焦点） */}
        <div className="grid grid-cols-2 gap-2">
          <figure className="min-w-0">
            <ReferenceImage
              sourceImageUrl={model.sourceImageUrl}
              hasSourceImage={model.hasSourceImage}
              promptSummary={promptSummary}
            />
            <figcaption className="mt-1 text-[0.625rem] text-[var(--text-muted)]">
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
              <figcaption className="mt-1 text-[0.625rem] text-[var(--text-muted)]">
                Result
              </figcaption>
            </figure>
          )}
        </div>

        {/* 右区：当时的创作上下文（分区块） */}
        <ContextBlocks model={model} />
      </div>

      {/* 底部动作区插槽：completed/failed 渲染默认主动作（plan-04）与默认
          secondaryActions 保存链路（plan-05）；processing 不渲染 */}
      {model.status !== "processing" && (
        <footer
          data-testid="iteration-detail-actions"
          aria-label="Iteration detail actions"
          className="flex min-h-[3.25rem] shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-static)] p-3"
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
              className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
            >
              <AppIcon icon={CornerUpLeft} size={14} />
              {continueDirectionLabel}
            </button>
          )}
        </footer>
      )}

      {/* plan-04: 守卫返回 confirm 时的替换确认对话框（取消零变更 / 确认切换） */}
      <ReplaceConfirmDialog
        open={pendingReplace !== null}
        currentPrompt={pendingReplace?.currentPrompt ?? ""}
        targetPrompt={pendingReplace?.target.promptSnapshot ?? ""}
        onCancel={cancelReplace}
        onConfirm={confirmReplace}
      />

      {/* plan-05: 保存为 Style Memory 对话框（预填该次迭代快照；成功后写入
          详情缓存局部切换已保存态，失败保留已填内容沿用既有错误文案） */}
      <SaveStyleMemoryDialog
        open={isSaveDialogOpen}
        initialContent={detail.promptSnapshot}
        initialVariables={detail.variables}
        sourceAssetId={detail.sourceAssetId ?? ""}
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
      className="surface-panel flex h-full flex-col gap-3 rounded-lg p-4"
    >
      <div className="h-8 w-full animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-2">
        <div className="aspect-[4/3] animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
        <div className="aspect-[4/3] animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
      </div>
      <div className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="h-16 w-full animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
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
      className="surface-panel flex h-full flex-col gap-3 rounded-lg p-4"
    >
      <p className="label-tech text-[var(--text-muted)]">Iteration detail</p>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
        Could not open this iteration
      </h3>
      <p className="text-xs leading-5 text-[var(--text-secondary)]">
        {reason}The detail for this iteration could not load, and the list,
        search, and filters stay exactly as they are. Retry to load the detail
        again, or close it to return to the list.
      </p>
      <div className="mt-auto flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary rounded-md px-3 py-1.5 text-xs font-medium"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="btn-primary rounded-md px-3 py-1.5 text-xs font-medium"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
