"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ComparisonView } from "@/components/workspace/comparison-view";
import { MAX_REPLACEMENT_LENGTH } from "@/lib/prompt-adjustments";
import {
  STYLE_DIMENSIONS,
  type AdjustmentAction,
  type CompiledPrompt,
  type InvariantAdjustment,
  type IterationDetail,
  type StyleDimension,
  type VisualRecipeV2Success,
} from "@/types/models";

/**
 * plan-05（ADR-7 / 架构 §6.5 / AC-05）：内联 focus-managed 比较区（非模态）。
 *
 * - 打开时加载所选 Iteration 详情并聚焦标题（不 trap）；取消/关闭零写入，
 *   焦点返回由页面送回比较触发器；应用后聚焦更新的摘要项。
 * - 展示该结果的历史 Prompt 快照，但明确「正在调整当前草稿」——历史只作证据
 *   上下文，调整永远写入当前草稿（架构 §3.2 对旧结果应用调整）。
 * - 维度来自当前 Recipe 的 observations ∪ invariants；「其他」直接聚焦全文
 *   编辑，不创建 adjustment。
 * - 选维度后聚合该维度真实 observations、全部真实 invariants 与 Prompt 表达；
 *   恰一条 invariant 时可见地预选，多条时未选具体规则前四类动作 disabled，
 *   零条只显示「该维度暂无可调整规则」（不伪造 invariant/adjustment）。
 * - 状态通知使用 polite live region，不移动正在编辑的焦点。
 */

const DIMENSION_LABELS: Record<StyleDimension, string> = {
  composition: "构图",
  camera: "镜头",
  color: "色彩",
  lighting: "光线",
  visualMedium: "媒介",
  formLanguage: "形式",
  materialTexture: "材质",
  atmosphere: "氛围",
  rendering: "渲染",
};

const ADJUSTMENT_ACTIONS: Array<{
  action: AdjustmentAction;
  testId: string;
  label: string;
}> = [
  { action: "strengthen", testId: "adjustment-action-strengthen", label: "加强保留" },
  { action: "relax", testId: "adjustment-action-relax", label: "放宽" },
  { action: "replace", testId: "adjustment-action-replace", label: "替换" },
  { action: "disable", testId: "adjustment-action-disable", label: "不再保留" },
];

export interface ResultComparisonPanelProps {
  iterationId: string;
  detail: IterationDetail | null;
  detailStatus: "idle" | "loading" | "ready" | "error";
  detailErrorMessage?: string | null;
  /** 当前 Recipe（维度/observations/invariants 的 SSOT；缺失时仅保留「其他」） */
  recipe: VisualRecipeV2Success | null;
  /** 当前草稿的编译文档（Prompt 表达/来源切片） */
  compiledPrompt: CompiledPrompt | null;
  onRetryDetail: () => void;
  onOpenIteration: (iterationId: string) => void;
  /** 应用调整：按 invariantId 覆盖当前草稿的 adjustment，不自动生成 */
  onApplyAdjustment: (adjustment: InvariantAdjustment) => void;
  /** 取消/关闭：零写入，页面负责把焦点送回比较触发器 */
  onCancel: () => void;
  /** 「其他」维度：切全文编辑并聚焦（页面完成视图切换与聚焦） */
  onSelectOtherDimension: () => void;
}

export function ResultComparisonPanel({
  iterationId,
  detail,
  detailStatus,
  detailErrorMessage,
  recipe,
  compiledPrompt,
  onRetryDetail,
  onOpenIteration,
  onApplyAdjustment,
  onCancel,
  onSelectOtherDimension,
}: ResultComparisonPanelProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [selectedDimension, setSelectedDimension] =
    useState<StyleDimension | null>(null);
  const [otherDimensionSelected, setOtherDimensionSelected] = useState(false);
  const [selectedInvariantId, setSelectedInvariantId] = useState<string | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<AdjustmentAction | null>(
    null,
  );
  const [replacementValue, setReplacementValue] = useState("");
  const [announcement, setAnnouncement] = useState("比较已打开。调整只会写入当前草稿。");

  // 打开（挂载）即聚焦标题：内联 focus-managed region，不 trap（ADR-7）
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // 比较对象变化：清空瞬时选择（selectedTargetInvariantId 不进入快照，§6.5.5）
  useEffect(() => {
    setSelectedDimension(null);
    setSelectedInvariantId(null);
    setPendingAction(null);
    setReplacementValue("");
  }, [iterationId]);

  /** 可选维度：observations ∪ invariants 并集（Recipe 原序，架构 §6.5.2） */
  const availableDimensions = useMemo<StyleDimension[]>(() => {
    if (!recipe) return [];
    return STYLE_DIMENSIONS.filter(
      (dimension) =>
        recipe.styleProfile[dimension].length > 0 ||
        recipe.styleInvariants.some((item) => item.dimension === dimension),
    );
  }, [recipe]);

  const dimensionInvariants = useMemo(() => {
    if (!recipe || !selectedDimension) return [];
    return recipe.styleInvariants.filter(
      (item) => item.dimension === selectedDimension,
    );
  }, [recipe, selectedDimension]);

  const dimensionObservations = useMemo(() => {
    if (!recipe || !selectedDimension) return [];
    return recipe.styleProfile[selectedDimension];
  }, [recipe, selectedDimension]);

  /** 该维度在当前草稿中的 Prompt 表达（真实 segments 切片，不自动偏差结论） */
  const dimensionPromptExpressions = useMemo(() => {
    if (!compiledPrompt || !selectedDimension) return [];
    const seen = new Set<string>();
    const expressions: string[] = [];
    for (const segment of compiledPrompt.segments) {
      if (segment.dimension !== selectedDimension) continue;
      const text = compiledPrompt.text
        .slice(segment.startIndex, segment.endIndex)
        .trim();
      if (!text) continue;
      const key = text.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      expressions.push(text);
    }
    return expressions;
  }, [compiledPrompt, selectedDimension]);

  const trimmedReplacement = replacementValue.trim();
  const actionsDisabled = !selectedInvariantId;
  const replacementInvalid =
    !trimmedReplacement || trimmedReplacement.length > MAX_REPLACEMENT_LENGTH;
  const applyDisabled =
    actionsDisabled || !pendingAction || (pendingAction === "replace" && replacementInvalid);

  const handleDimensionSelect = (dimension: StyleDimension) => {
    setSelectedDimension(dimension);
    setOtherDimensionSelected(false);
    setPendingAction(null);
    setReplacementValue("");
    const invariants = recipe
      ? recipe.styleInvariants.filter((item) => item.dimension === dimension)
      : [];
    // 恰一条时可见地预选；多条时不隐藏预选事实（§6.5.3）
    setSelectedInvariantId(invariants.length === 1 ? invariants[0].id : null);
    setAnnouncement(
      invariants.length === 0
        ? `已选择维度「${DIMENSION_LABELS[dimension]}」，该维度暂无可调整规则。`
        : invariants.length === 1
          ? `已选择维度「${DIMENSION_LABELS[dimension]}」，唯一规则已选中。`
          : `已选择维度「${DIMENSION_LABELS[dimension]}」，请选择要调整的具体规则。`,
    );
  };

  const handleApply = () => {
    if (!selectedInvariantId || !pendingAction) return;
    const adjustment: InvariantAdjustment =
      pendingAction === "replace"
        ? {
            invariantId: selectedInvariantId,
            action: "replace",
            replacementValue: trimmedReplacement,
          }
        : { invariantId: selectedInvariantId, action: pendingAction };
    onApplyAdjustment(adjustment);
  };

  return (
    <section
      data-testid="result-comparison-panel"
      aria-label="参考比较与局部调整"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      className="mx-4 mb-2 max-h-[46vh] shrink-0 overflow-y-auto rounded-xl bg-[var(--surface-low)]/56 p-3 ring-1 ring-[var(--border-static)] sm:mx-6 lg:mx-8"
    >
      <div className="flex items-start justify-between gap-3 px-1">
        <h3
          ref={titleRef}
          data-testid="comparison-panel-title"
          tabIndex={-1}
          className="text-sm font-bold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          参考比较
        </h3>
        <button
          type="button"
          data-testid="comparison-adjustment-cancel"
          onClick={onCancel}
          className="btn-secondary h-7 shrink-0 rounded-lg px-2.5 text-xs font-medium"
        >
          取消比较
        </button>
      </div>

      <span
        data-testid="comparison-live-region"
        aria-live="polite"
        className="sr-only"
      >
        {announcement}
      </span>

      {detailStatus === "error" ? (
        <div
          data-testid="comparison-detail-error"
          className="mt-2 rounded-lg bg-[var(--surface-bright)]/72 px-2.5 py-2 ring-1 ring-[var(--border-interactive)]"
        >
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            比较详情加载失败{detailErrorMessage ? `：${detailErrorMessage}` : ""}。
            结果区与当前草稿保持不变。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="comparison-detail-retry"
              onClick={onRetryDetail}
              className="btn-secondary h-7 rounded-lg px-2.5 text-xs font-medium"
            >
              重试
            </button>
            <button
              type="button"
              data-testid="comparison-detail-open-iteration"
              onClick={() => onOpenIteration(iterationId)}
              className="btn-secondary h-7 rounded-lg px-2.5 text-xs font-medium"
            >
              打开完整 Iteration
            </button>
          </div>
        </div>
      ) : detailStatus === "loading" || detailStatus === "idle" || !detail ? (
        <p role="status" className="mt-2 px-1 text-xs leading-5 text-[var(--text-muted)]">
          正在加载所选结果…
        </p>
      ) : (
        <div className="mt-2 grid gap-2.5 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <ComparisonView
              referenceImageUrl={detail.sourceImageUrl}
              resultImageUrl={detail.resultFileUrl}
              aspectRatio={detail.params?.aspectRatio}
            />
            <div className="rounded-xl bg-[var(--surface-bright)]/56 p-2.5 ring-1 ring-[var(--border-static)]">
              <p className="label-tech mb-1 text-[var(--text-muted)]">
                该结果的历史 Prompt
              </p>
              <p
                data-testid="comparison-historical-prompt"
                className="whitespace-pre-wrap break-words font-mono text-[0.6875rem] leading-4 text-[var(--text-secondary)]"
              >
                {detail.promptSnapshot}
              </p>
              <p
                data-testid="comparison-historical-context"
                className="mt-2 text-[0.6875rem] leading-4 text-[var(--text-muted)]"
              >
                正在调整当前草稿：以上是所选结果生成时的表达快照，仅作历史上下文；
                应用调整只更新当前草稿并重新编译，不会改动这条历史结果。
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="rounded-xl bg-[var(--surface-bright)]/56 p-2.5 ring-1 ring-[var(--border-static)]">
              <p className="label-tech mb-1 text-[var(--text-muted)]">
                选择偏差维度
              </p>
              <div className="flex flex-wrap gap-1">
                {availableDimensions.map((dimension) => (
                  <button
                    key={dimension}
                    type="button"
                    data-testid="comparison-dimension-option"
                    data-dimension={dimension}
                    aria-pressed={selectedDimension === dimension}
                    onClick={() => handleDimensionSelect(dimension)}
                    className={`h-6 rounded-lg px-2 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                      selectedDimension === dimension
                        ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
                        : "bg-[var(--surface-low)] text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
                    }`}
                  >
                    {DIMENSION_LABELS[dimension]}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="comparison-dimension-other"
                  aria-pressed={otherDimensionSelected}
                  onClick={() => {
                    setOtherDimensionSelected(true);
                    setSelectedDimension(null);
                    setSelectedInvariantId(null);
                    setPendingAction(null);
                    setAnnouncement("已选择「其他」，进入全文编辑。");
                    onSelectOtherDimension();
                  }}
                  className="h-6 rounded-lg bg-[var(--surface-low)] px-2 text-[0.6875rem] font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                >
                  其他 / 全文编辑
                </button>
              </div>
            </div>

            {selectedDimension && (
              <div className="rounded-xl bg-[var(--surface-bright)]/56 p-2.5 ring-1 ring-[var(--border-static)]">
                <p className="label-tech mb-1 text-[var(--text-muted)]">
                  真实证据（不自动给出偏差结论）
                </p>
                <ul className="flex flex-wrap gap-1">
                  {dimensionObservations.map((observation) => (
                    <li
                      key={observation.id}
                      data-testid="comparison-observation-item"
                      data-observation-id={observation.id}
                      className="rounded-lg bg-[var(--surface-low)] px-2 py-0.5 text-[0.6875rem] text-[var(--text-secondary)]"
                      title={`置信度 ${observation.confidence}`}
                    >
                      {observation.value}
                    </li>
                  ))}
                </ul>

                {dimensionPromptExpressions.length > 0 && (
                  <div className="mt-2">
                    <p className="label-tech mb-1 text-[var(--text-muted)]">
                      当前草稿中的 Prompt 表达
                    </p>
                    <ul
                      data-testid="comparison-prompt-segments"
                      className="flex flex-wrap gap-1"
                    >
                      {dimensionPromptExpressions.map((expression) => (
                        <li
                          key={expression}
                          className="rounded-lg bg-[var(--surface-low)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--text-secondary)]"
                        >
                          {expression}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl bg-[var(--surface-bright)]/56 p-2.5 ring-1 ring-[var(--border-static)]">
              <p className="label-tech mb-1 text-[var(--text-muted)]">
                调整目标规则
              </p>
              {selectedDimension ? (
                dimensionInvariants.length === 0 ? (
                  <p
                    data-testid="comparison-invariant-empty"
                    className="text-xs leading-5 text-[var(--text-secondary)]"
                  >
                    该维度暂无可调整规则。可改选「其他 / 全文编辑」直接改写全文。
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {dimensionInvariants.map((invariant) => (
                      <button
                        key={invariant.id}
                        type="button"
                        data-testid="comparison-invariant-option"
                        data-invariant-id={invariant.id}
                        aria-pressed={selectedInvariantId === invariant.id}
                        onClick={() => {
                          setSelectedInvariantId(invariant.id);
                          setAnnouncement(`已选择规则「${invariant.value}」。`);
                        }}
                        className={`max-w-full truncate rounded-lg px-2 py-1 text-left text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                          selectedInvariantId === invariant.id
                            ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
                            : "bg-[var(--surface-low)] text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
                        }`}
                      >
                        {invariant.value}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-xs leading-5 text-[var(--text-muted)]">
                  先选择一个维度，或使用「其他 / 全文编辑」。
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--border-static)] pt-2">
                {ADJUSTMENT_ACTIONS.map((option) => (
                  <button
                    key={option.action}
                    type="button"
                    data-testid={option.testId}
                    aria-pressed={pendingAction === option.action}
                    disabled={actionsDisabled}
                    title={
                      actionsDisabled ? "先选择要调整的具体规则" : option.label
                    }
                    onClick={() => {
                      setPendingAction(option.action);
                      setAnnouncement(`已选择动作「${option.label}」，应用后写入当前草稿。`);
                    }}
                    className={`h-6 rounded-lg px-2 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                      pendingAction === option.action
                        ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
                        : "bg-[var(--surface-low)] text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
                    } ${actionsDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {pendingAction === "replace" && (
                <div className="mt-1.5">
                  <label
                    htmlFor="adjustment-replacement-input"
                    className="mb-0.5 block text-[0.6875rem] text-[var(--text-secondary)]"
                  >
                    替换值（trim 后非空，最多 {MAX_REPLACEMENT_LENGTH} 字）
                  </label>
                  <input
                    id="adjustment-replacement-input"
                    data-testid="adjustment-replacement-input"
                    type="text"
                    value={replacementValue}
                    maxLength={MAX_REPLACEMENT_LENGTH}
                    onChange={(event) => setReplacementValue(event.target.value)}
                    disabled={actionsDisabled}
                    className="input-precision h-7 w-full rounded-lg px-2 text-xs"
                  />
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  data-testid="comparison-adjustment-apply"
                  disabled={applyDisabled}
                  title={applyDisabled ? "选择规则与动作后可应用" : "应用到当前草稿"}
                  onClick={handleApply}
                  className={`btn-primary h-7 rounded-lg px-2.5 text-xs font-semibold ${
                    applyDisabled ? "cursor-not-allowed opacity-50" : ""
                  }`}
                >
                  应用到当前草稿
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
