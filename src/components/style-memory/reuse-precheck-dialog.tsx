"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock3, TriangleAlert } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_VERSION,
  type WorkspaceMemoryIdentity,
} from "@/hooks/use-workspace-state";
import type { StyleMemoryDetail, TemplateVariable } from "@/types/models";

/**
 * plan-07（架构 §6.5 / ADR-5 / ADR-7）：复用预检弹层。
 *
 * - 列表卡片「使用」与详情「使用这条 Memory」两个入口共用；挂载时
 *   GET /api/templates/[id] 取详情，失败可重试/取消，绝不进入工作区。
 * - 「将保留」：retainedRules 全量只读清单。
 * - 「开始前替换」：必填变量 = `trim(defaultValue) === ''`，逐个必填输入；
 *   其余折叠为「其他变量（N 项）」，展开后预填 defaultValue 可编辑。
 * - 工作区影响三分支（§6.5-2 原文口径）：读 sessionStorage 快照现值判定，
 *   不改写快照——取消/Escape/背景关闭均零写盘。
 * - 确认：把预检填写值合入快照（version 沿用 v4 字段超集），随后导航
 *   `/workspace?templateId={id}` 交给工作台既有消费路径握手。
 */

export interface ReusePrecheckDialogProps {
  open: boolean;
  memoryId: string | null;
  onClose: () => void;
  /** 确认后回调（导航由弹层执行；供入口埋点/测试扩展） */
  onConfirm?: (memoryId: string) => void;
}

/** 预检弹层加载的详情形态（对齐 StyleMemoryDetail 需要的字段） */
type PrecheckDetail = Pick<
  StyleMemoryDetail,
  | "id"
  | "name"
  | "verificationStatus"
  | "retainedRules"
  | "variables"
  | "content"
  | "sourceAssetId"
  | "sourceImageUrl"
> & {
  representativeResult?: { iterationId: string; imageUrl: string | null; createdAt: string } | null;
};

interface CurrentWorkspaceSnapshotShape {
  currentTemplateId?: string | null;
  referenceImageUrl?: string | null;
  promptText?: string | null;
  analysisTaskId?: string | null;
  assetId?: string | null;
}

function readCurrentSnapshot(): CurrentWorkspaceSnapshotShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentWorkspaceSnapshotShape) : null;
  } catch {
    return null;
  }
}

/**
 * 详情载荷防御归一化（AC-09 口径）：旧资产 / 历史消费方可能返回缺省集合的
 * 形态；预检对必用集合做读时防御，避免渲染期 undefined 崩溃，缺失口径与
 * 服务端 DTO 默认值一致（空清单 → 「未登记」文案）。
 */
function normalizePrecheckDetail(data: PrecheckDetail): PrecheckDetail {
  return {
    ...data,
    name: typeof data.name === "string" ? data.name : "",
    verificationStatus:
      data.verificationStatus === "user_verified"
        ? "user_verified"
        : "pending_verification",
    retainedRules: Array.isArray(data.retainedRules) ? data.retainedRules : [],
    variables: Array.isArray(data.variables) ? data.variables : [],
    content: typeof data.content === "string" ? data.content : "",
  };
}

export type WorkspaceImpactKind = "empty" | "same" | "different";

/**
 * 工作区影响判定（架构 §6.5-2 三分支）：
 * 快照不存在或 referenceImageUrl 与 promptText 均空 → 空；
 * currentTemplateId === memory.id → 已在使用；否则 → 不同的未完成内容。
 */
export function deriveReuseWorkspaceImpact(
  memoryId: string,
  snapshot: CurrentWorkspaceSnapshotShape | null,
): WorkspaceImpactKind {
  const hasUnfinishedContent = Boolean(
    snapshot?.referenceImageUrl?.trim() || snapshot?.promptText?.trim(),
  );
  if (!snapshot || !hasUnfinishedContent) return "empty";
  if (snapshot.currentTemplateId === memoryId) return "same";
  return "different";
}

const WORKSPACE_IMPACT_COPY: Record<WorkspaceImpactKind, string> = {
  empty: "Your workspace is empty, so nothing will be replaced.",
  same: "You are already using this memory.",
  different: "Your workspace has different unfinished work — it will be replaced when you continue.",
};

/** 确认时的快照合入与导航组装（ADR-5：一次性握手，确认即落盘） */
function buildReuseSnapshotPayload(detail: PrecheckDetail, values: Record<string, string>) {
  const current = readCurrentSnapshot();
  const mergedVariables: TemplateVariable[] = detail.variables.map((variable) => ({
    ...variable,
    defaultValue:
      values[variable.name] !== undefined && values[variable.name].length > 0
        ? values[variable.name]
        : variable.defaultValue,
  }));

  return {
    version: WORKSPACE_STORAGE_VERSION,
    // 复用语义：工作区切换为该 Memory 的来源参考图；来源缺失时保留现状
    assetId: detail.sourceAssetId ?? current?.assetId ?? null,
    referenceImageUrl: detail.sourceImageUrl ?? current?.referenceImageUrl ?? null,
    // plan-07 决策：保留既有分析上下文（若有）——它是生成准备结论中
    // “存在生成上下文”的既有依据；直入无上下文场景由页面桥接补齐
    analysisTaskId: current?.analysisTaskId ?? null,
    recipe: null,
    promptText: detail.content,
    negativePromptText: "",
    analysisTemplateContent: detail.content,
    analysisTemplateVariables: mergedVariables,
    analysisTemplateStatus: mergedVariables.length > 0 ? ("ready" as const) : null,
    analysisTemplateReason: null,
    generationTaskId: null,
    v2PromptState: null,
    currentIterationId: null,
    currentTemplateId: detail.id,
    previousResultUrl: null,
    restoredParams: null,
    pendingIterationRestore: null,
    memoryIdentity: {
      id: detail.id,
      name: detail.name,
      verificationStatus: detail.verificationStatus,
      retainedRuleCount: detail.retainedRules.length,
    } satisfies WorkspaceMemoryIdentity,
  };
}

function StatusBadge({ verified }: { verified: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-static)]/60 bg-[var(--surface-floating)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--text-primary)] shadow-xs">
      <AppIcon
        icon={verified ? BadgeCheck : Clock3}
        size={12}
        className={verified ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"}
      />
      {verified ? "User verified" : "Pending verification"}
    </span>
  );
}

export function ReusePrecheckDialog({
  open,
  memoryId,
  onClose,
  onConfirm,
}: ReusePrecheckDialogProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<PrecheckDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showOtherVariables, setShowOtherVariables] = useState(false);
  const [impactKind, setImpactKind] = useState<WorkspaceImpactKind>("empty");
  // 防竞态：并发/重复加载（StrictMode 双 effect、快速开关、慢响应乱序回包）
  // 时只接受最新一次加载的完成态——迟到的旧回包不得重置用户已填写的变量值
  const loadSequenceRef = useRef(0);

  const loadDetail = useCallback(async () => {
    if (!open || !memoryId) return;
    const sequence = ++loadSequenceRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/templates/${memoryId}`);
      if (!res.ok) throw new Error("Failed to load Style Memory details");
      const data = (await res.json()) as PrecheckDetail;
      if (sequence !== loadSequenceRef.current) return;
      setDetail(normalizePrecheckDetail(data));
      setValues({});
      setShowOtherVariables(false);
      setImpactKind(deriveReuseWorkspaceImpact(memoryId, readCurrentSnapshot()));
    } catch {
      if (sequence !== loadSequenceRef.current) return;
      setLoadError("Precheck details could not be loaded. Retry or cancel — your current workspace is unaffected.");
    } finally {
      if (sequence === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [memoryId, open]);

  useEffect(() => {
    if (open) {
      setDetail(null);
      void loadDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memoryId]);

  const requiredVariables = useMemo(
    () => (detail?.variables ?? []).filter((v) => !String(v.defaultValue ?? "").trim()),
    [detail],
  );
  const otherVariables = useMemo(
    () => (detail?.variables ?? []).filter((v) => String(v.defaultValue ?? "").trim().length > 0),
    [detail],
  );
  const missingNames = requiredVariables.filter(
    (v) => !(values[v.name] ?? "").trim(),
  );
  const canEnterWorkspace = Boolean(detail) && missingNames.length === 0;

  const handleConfirm = useCallback(() => {
    if (!detail || !canEnterWorkspace) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify(buildReuseSnapshotPayload(detail, values)),
      );
      // 架构 §8.5：style_memory_reused 前端结构化日志（预检确认无服务端写点）
      console.info(
        JSON.stringify({
          event: "style_memory_reused",
          templateId: detail.id,
          ts: new Date().toISOString(),
        }),
      );
    }
    onConfirm?.(detail.id);
    router.push(`/workspace?templateId=${detail.id}`);
  }, [canEnterWorkspace, detail, onConfirm, router, values]);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      label="Precheck before use: retained style rules, required variables, and workspace impact"
      testId="reuse-precheck-dialog"
    >
      {/* 头部标题（labelledBy 锚点） */}
      <h2 id="reuse-precheck-title" className="sr-only">
        Precheck before use
      </h2>

      {isLoading && (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-[var(--text-secondary)]">Loading precheck details…</p>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="flex min-h-56 flex-col items-start justify-center gap-4 p-6">
          <p
            role="alert"
            className="flex items-start gap-2 text-sm leading-6 text-[var(--color-error)]"
          >
            <AppIcon icon={TriangleAlert} size={16} className="mt-0.5 shrink-0" />
            {loadError}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadDetail()}
              className="btn-secondary rounded-lg px-4 py-2 text-xs font-medium"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isLoading && !loadError && detail && (
        <div className="flex min-h-0 flex-col">
          {/* 头部：名称 + 徽标 + 已验证代表结果缩略 */}
          <div className="shrink-0 border-b border-[var(--border-static)]/60 p-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                  {detail.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Confirm the retained rules and what needs replacing before
                  entering the workspace.
                </p>
              </div>
              <StatusBadge verified={detail.verificationStatus === "user_verified"} />
              {detail.verificationStatus === "user_verified" &&
                detail.representativeResult?.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.representativeResult.imageUrl}
                    alt={`${detail.name} representative result thumbnail`}
                    className="hidden h-14 w-20 shrink-0 rounded-lg object-cover ring-1 ring-[var(--border-static)] sm:block"
                  />
                )}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            {/* 将保留 */}
            <section aria-label="What carries over">
              <h4 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                What carries over
              </h4>
              {detail.retainedRules.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {detail.retainedRules.map((rule) => (
                    <li
                      key={rule}
                      className="rounded-lg bg-[var(--surface-low)]/72 px-3 py-1.5 text-sm leading-6 text-[var(--text-primary)]"
                    >
                      {rule}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  This memory has no retained rules recorded — it enters the
                  workspace with its prompt content only.
                </p>
              )}
            </section>

            {/* 开始前替换 */}
            <section aria-label="Replace before you start">
              <h4 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Replace before you start
              </h4>
              {requiredVariables.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  No required variables — you can enter the workspace directly.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {requiredVariables.map((variable) => {
                    const labelText = variable.label ?? variable.name;
                    return (
                      <label key={variable.name} className="grid gap-1.5">
                        <span className="px-0.5 text-xs font-medium text-[var(--text-secondary)]">
                          {labelText}
                        </span>
                        <input
                          type="text"
                          aria-label={labelText}
                          value={values[variable.name] ?? ""}
                          onChange={(event) => {
                            // 先取值再更新：React 会复用合成事件的 currentTarget，
                            // 延迟执行的 updater 中它已置空
                            const nextValue = event.currentTarget.value;
                            setValues((prev) => ({
                              ...prev,
                              [variable.name]: nextValue,
                            }));
                          }}
                          className="min-h-9 w-full rounded-lg bg-[var(--surface-control)]/80 px-3 text-sm text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-static)] focus-visible:ring-[var(--accent-primary)]"
                          placeholder={`Enter ${labelText}`}
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {otherVariables.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowOtherVariables((expanded) => !expanded)}
                    aria-expanded={showOtherVariables}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-static)]/60 bg-[var(--surface-control)]/60 px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    Other variables ({otherVariables.length})
                  </button>
                  {showOtherVariables && (
                    <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {otherVariables.map((variable) => {
                        const labelText = variable.label ?? variable.name;
                        return (
                          <label key={variable.name} className="grid gap-1.5">
                            <span className="px-0.5 text-xs font-medium text-[var(--text-secondary)]">
                              {labelText}
                            </span>
                            <input
                              type="text"
                              aria-label={labelText}
                              value={
                                values[variable.name] ?? variable.defaultValue ?? ""
                              }
                              onChange={(event) => {
                                // 同上：currentTarget 在延迟 updater 中已置空
                                const nextValue = event.currentTarget.value;
                                setValues((prev) => ({
                                  ...prev,
                                  [variable.name]: nextValue,
                                }));
                              }}
                              className="min-h-9 w-full rounded-lg bg-[var(--surface-control)]/80 px-3 text-sm text-[var(--text-primary)] outline-none ring-1 ring-[var(--border-static)] focus-visible:ring-[var(--accent-primary)]"
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 工作区影响判定（架构 §6.5-2 三分支，只读展示） */}
            <section aria-label="Impact on your current workspace">
              <h4 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Impact on your current workspace
              </h4>
              <p
                data-testid="precheck-workspace-impact"
                className="mt-2 rounded-lg border border-[var(--border-static)]/60 bg-[var(--surface-low)]/60 px-3 py-2 text-sm leading-6 text-[var(--text-primary)]"
              >
                {WORKSPACE_IMPACT_COPY[impactKind]}
              </p>
            </section>
          </div>

          {/* 门控提示 + 动作区 */}
          <footer className="shrink-0 space-y-3 border-t border-[var(--border-static)]/60 p-5 pt-4 sm:p-6 sm:pt-4">
            {missingNames.length > 0 && (
              <p role="status" className="text-xs leading-5 text-[var(--color-error)]">
                {missingNames.length} fields left to fill:{" "}
                {missingNames.map((v) => v.label ?? v.name).join(", ")}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canEnterWorkspace}
                title={
                  canEnterWorkspace
                    ? "Apply this memory and enter the workspace"
                    : `${missingNames.length} fields left to fill: ${missingNames
                        .map((v) => v.label ?? v.name)
                        .join(", ")}`
                }
                className={`inline-flex min-h-11 items-center rounded-xl px-5 text-xs font-semibold transition-colors ${
                  canEnterWorkspace
                    ? "btn-primary"
                    : "cursor-not-allowed bg-[var(--surface-control)] text-[var(--text-muted)] ring-1 ring-[var(--border-static)]"
                }`}
              >
                Enter workspace
              </button>
            </div>
          </footer>
        </div>
      )}
    </ModalDialog>
  );
}
