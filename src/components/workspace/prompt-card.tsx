"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { FileText, Info, Maximize, Minimize } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ExpandablePanel } from "@/components/ui/expandable-panel";
import type { WorkspaceError, WorkspaceState } from "@/hooks/use-workspace-state";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import { StructuredPromptEditor } from "@/components/workspace/structured-prompt-editor";
import { PromptIntentControls } from "@/components/workspace/prompt-intent-controls";
import {
  KeepChangeSummary,
  type KeepChangeChangeItem,
  type KeepChangeKeepItem,
  type KeepChangeLocateTarget,
} from "@/components/workspace/keep-change-summary";
import type {
  AnalysisTemplateStatus,
  PromptDetailLevel,
  PromptEditorMode,
  PromptIntent,
  StoredVisualRecipe,
  TemplateVariable,
  V2PromptWorkspaceState,
} from "@/types/models";
import { isVisualRecipeV2Success } from "@/lib/visual-recipe";
import type { EvidenceFacetId } from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";

const NEGATIVE_PROMPT_VARIABLE_NAME = "negative_prompt";

/** plan-04：两轴控制区的受控状态（页面派生，PromptCard 只负责挂载） */
export interface PromptCardControlsState {
  intent: PromptIntent;
  detailLevel: PromptDetailLevel;
  editorMode: PromptEditorMode;
  customPromptDirty: boolean;
  /** 分析中：控件区保持渲染但禁用 */
  disabled: boolean;
  /** 快速复刻 armed：已确认设置只读 */
  locked: boolean;
  /** structured 只读入口需要完整 V2 Recipe */
  structuredAvailable: boolean;
}

/** plan-04：「保留 / 改变」摘要数据（页面从真实规则与变量派生） */
export interface PromptCardKeepChangeState {
  keepItems: KeepChangeKeepItem[];
  changeItems: KeepChangeChangeItem[];
  highlightedTargetId: string | null;
  announcement: string | null;
}

/**
 * plan-07（架构 §6.2 实现原则 / §8.2 L1）：自定义全文应用调整未命中 range
 * 时的明确说明——规则照常停用，但全文中未找到可删除的表达，全文逐字保留。
 */
export interface PromptAdjustmentMissNote {
  invariantId: string;
  invariantValue: string;
}

interface PromptCardProps {
  state: WorkspaceState;
  promptText: string;
  negativePromptText?: string;
  templateContent?: string | null;
  templateVariables?: TemplateVariable[];
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
  error?: WorkspaceError | null;
  onResolvedPromptChange?: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onNegativePromptChange?: (value: string) => void;
  onSaveTemplate?: (content: string) => void;
  onBackToEdit?: () => void;
  renderDock?: ReactNode;
  recipe?: StoredVisualRecipe | null;
  v2PromptState?: V2PromptWorkspaceState | null;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedFacetId?: EvidenceFacetId | null;
  onV2PromptStateChange?: (
    update: (current: V2PromptWorkspaceState) => V2PromptWorkspaceState,
  ) => void;
  /** plan-04：两轴控制状态；null 时不渲染控制区（空工作区/预览模式） */
  promptControlsState?: PromptCardControlsState | null;
  onIntentChange?: (intent: PromptIntent) => void;
  onDetailChange?: (detail: PromptDetailLevel) => void;
  onEditorModeChange?: (mode: PromptEditorMode) => void;
  /** plan-04：当前最终 Prompt（resolved）的单一展示点 */
  compiledPromptText?: string | null;
  /** plan-04：摘要数据；null 时不渲染摘要 */
  keepChange?: PromptCardKeepChangeState | null;
  onKeepChangeLocate?: (target: KeepChangeLocateTarget) => void;
  /** plan-07：L1 未命中说明（disable 未命中 range 时不静默、不声称已删除） */
  adjustmentMissNote?: PromptAdjustmentMissNote | null;
  /** plan-04：plan-01 编译文档（same_style 含 {{变量}} 标记），供结构化编辑器消费 */
  compiledTemplate?: string | null;
  /** plan-04：手动改写全文（V2 写 customPrompt；旧全文路径写页面草稿） */
  onCustomPromptChange?: (value: string) => void;
  /** plan-04：旧全文路径的手动改写标记（customPromptDirty） */
  onManualTextChange?: (value: string) => void;
}

export function PromptCard({
  state,
  promptText,
  negativePromptText = "",
  templateContent = null,
  templateVariables = [],
  templateStatus = null,
  templateReason = null,
  templateKey = null,
  error = null,
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onNegativePromptChange,
  onSaveTemplate,
  onBackToEdit,
  renderDock,
  recipe = null,
  v2PromptState = null,
  provenanceSpans = [],
  selectedFacetId = null,
  onV2PromptStateChange,
  promptControlsState = null,
  onIntentChange,
  onDetailChange,
  onEditorModeChange,
  compiledPromptText = null,
  keepChange = null,
  onKeepChangeLocate,
  adjustmentMissNote = null,
  compiledTemplate = null,
  onCustomPromptChange,
  onManualTextChange,
}: PromptCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const titleId = useId();
  const prompt = promptText.trim();
  const isLoading = state === "analyzing";
  const analysisError = error && error.stage !== "generation" ? error : null;
  const [saveTemplateContent, setSaveTemplateContent] = useState(
    templateContent || promptText,
  );
  const lastSaveResetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const resetKey = templateKey ?? templateContent ?? null;
    if (resetKey === lastSaveResetKeyRef.current) return;
    lastSaveResetKeyRef.current = resetKey;
    setSaveTemplateContent(templateContent || promptText);
  }, [promptText, templateContent, templateKey]);

  const handleSaveContentChange = useCallback((value: string) => {
    setSaveTemplateContent(value);
  }, []);

  const auxiliaryVariables = useMemo<TemplateVariable[]>(
    () => [
      {
        name: NEGATIVE_PROMPT_VARIABLE_NAME,
        defaultValue: negativePromptText,
        label: "Negative constraints",
      },
    ],
    [negativePromptText],
  );

  const auxiliaryVariableValues = useMemo(
    () => ({
      [NEGATIVE_PROMPT_VARIABLE_NAME]: negativePromptText,
    }),
    [negativePromptText],
  );
  const structuredRecipe = isVisualRecipeV2Success(recipe) ? recipe : null;
  const selectedProvenanceSpan =
    provenanceSpans.find((span) => span.facetId === selectedFacetId) ?? null;
  const canSaveStyleMemory =
    prompt && onSaveTemplate && state !== "history_restored";
  const showRenderDock = Boolean(renderDock) && !isExpanded;

  const handleAuxiliaryVariableChange = useCallback(
    (name: string, value: string) => {
      if (name === NEGATIVE_PROMPT_VARIABLE_NAME) {
        onNegativePromptChange?.(value);
      }
    },
    [onNegativePromptChange],
  );

  return (
    <ExpandablePanel
      expanded={isExpanded}
      labelledBy={titleId}
      testId="prompt-expandable-panel"
      onClose={() => setIsExpanded(false)}
    >
      <article
        data-testid="prompt-card"
        className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-y-auto rounded-2xl p-4"
      >
      {/* plan-05：控制条常驻后收紧标题下边距，把纵向空间让给编辑区/Render Dock */}
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Prompt + Render
            <AppIcon icon={Info} size={16} className="text-[var(--text-muted)]" />
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Prompt and generation controls
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canSaveStyleMemory && (
            <button
              type="button"
              onClick={() => onSaveTemplate(saveTemplateContent || promptText)}
              className="btn-secondary h-8 rounded-lg px-2.5 text-xs font-medium"
            >
              Save as Style Memory
            </button>
          )}
          <button
            type="button"
            data-expand-toggle="true"
            aria-label={
              isExpanded
                ? "Close expanded Prompt editor"
                : "Expand Prompt editor"
            }
            title={
              isExpanded
                ? "Close expanded Prompt editor"
                : "Expand Prompt editor"
            }
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg"
          >
            <AppIcon
              icon={isExpanded ? Minimize : Maximize}
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>

      <div
        className={
          isExpanded
            ? "min-h-0 flex-1 overflow-hidden"
            : // plan-07（Task 4 / 1280×720 功能可用视口）：控制区常驻后，窄高视口
              // 下编辑区与 Render Dock 争抢纵向空间。内容区保持可滚动且带高度
              // 下限，保证意图/表达/编辑模式控件始终可达（不结构性折叠），
              // 剩余空间不足时由 article 级滚动承接（TC-7.2/TC-7.5 契约）。
              "min-h-[22rem] flex-1 overflow-y-auto"
        }
      >
        {isLoading ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            {/* plan-04：分析中控制区保持渲染（禁用态），armed 锁定说明照常可见 */}
            {promptControlsState && onIntentChange && onDetailChange && onEditorModeChange && (
              <PromptIntentControls
                intent={promptControlsState.intent}
                detailLevel={promptControlsState.detailLevel}
                editorMode={promptControlsState.editorMode}
                customPromptDirty={promptControlsState.customPromptDirty}
                disabled={promptControlsState.disabled}
                locked={promptControlsState.locked}
                structuredAvailable={promptControlsState.structuredAvailable}
                onIntentChange={onIntentChange}
                onDetailChange={onDetailChange}
                onEditorModeChange={onEditorModeChange}
              />
            )}
            <div className="min-h-0 flex-1">
              <PromptSkeleton />
            </div>
          </div>
        ) : prompt || structuredRecipe ? (
          <div
            className={
              showRenderDock
                ? "flex h-full min-h-0 flex-col gap-2"
                : isExpanded
                  ? "flex h-full min-h-0 flex-col gap-2"
                : "flex min-h-full flex-col gap-3"
            }
          >
            {promptControlsState && onIntentChange && onDetailChange && onEditorModeChange && (
              <PromptIntentControls
                intent={promptControlsState.intent}
                detailLevel={promptControlsState.detailLevel}
                editorMode={promptControlsState.editorMode}
                customPromptDirty={promptControlsState.customPromptDirty}
                disabled={promptControlsState.disabled}
                locked={promptControlsState.locked}
                structuredAvailable={promptControlsState.structuredAvailable}
                onIntentChange={onIntentChange}
                onDetailChange={onDetailChange}
                onEditorModeChange={onEditorModeChange}
              />
            )}

            {keepChange && onKeepChangeLocate && (
              <KeepChangeSummary
                intent={promptControlsState?.intent ?? "same_style"}
                keepItems={keepChange.keepItems}
                changeItems={keepChange.changeItems}
                highlightedTargetId={keepChange.highlightedTargetId}
                announcement={keepChange.announcement}
                onLocate={onKeepChangeLocate}
              />
            )}

            {/* plan-07（架构 §6.2 实现原则 / §8.2 L1）：disable 未命中全文 range
                时的明确说明——不静默、不声称已删除；规则已停用、全文逐字保留 */}
            {adjustmentMissNote && (
              <p
                data-testid="prompt-adjustment-miss-note"
                data-invariant-id={adjustmentMissNote.invariantId}
                role="status"
                className="shrink-0 rounded-xl bg-[var(--surface-bright)]/60 px-2.5 py-2 text-xs leading-5 text-[var(--text-secondary)] ring-1 ring-[var(--border-interactive)]"
              >
                已停用规则「{adjustmentMissNote.invariantValue}」，但在当前全文
                中未找到可删除的表达：全文逐字保留，未做删除或追加。可继续手动
                编辑全文，或切回变量模式让规则直接参与编译。
              </p>
            )}

            {compiledPromptText !== null &&
              (!promptControlsState ||
                promptControlsState.editorMode === "variables") && (
              <div className="shrink-0 rounded-xl bg-[var(--surface-low)]/56 px-2 py-1.5 ring-1 ring-[var(--border-static)]">
                <p className="label-tech mb-0.5 text-[var(--text-muted)]">
                  最终 Prompt
                </p>
                <p
                  data-testid="compiled-prompt-text"
                  className="line-clamp-2 whitespace-pre-wrap break-words font-mono text-[0.6875rem] leading-4 text-[var(--text-secondary)]"
                >
                  {compiledPromptText}
                </p>
              </div>
            )}

            <div
              data-testid="prompt-editor-frame"
              className={
                showRenderDock
                  ? // plan-04/plan-05：控制区占用纵向空间时编辑区必须能在剩余空间内
                    // 收缩——固定大下限会让编辑框越过内容区下界压进 Render Dock
                    // （TC-8.2/TC-8.3 视觉契约：无重叠优先，编辑内容在框内滚动）。
                    // 保留 4rem 可见下限：更小视口（720p 高度）下编辑器仍可交互。
                    // 无控制区的预览/旧形态保留原下限（该分支从未触发重叠）。
                    promptControlsState
                    ? "min-h-[8rem] flex-1 overflow-hidden"
                    : "min-h-[14rem] flex-1 overflow-hidden"
                  : isExpanded
                    ? "h-full min-h-0 flex-1 overflow-hidden"
                  : "min-h-[22.5rem]"
              }
            >
              {structuredRecipe && v2PromptState && onV2PromptStateChange ? (
                <StructuredPromptEditor
                  recipe={structuredRecipe}
                  state={v2PromptState}
                  compact={showRenderDock}
                  negativePromptText={negativePromptText}
                  provenanceSpans={provenanceSpans}
                  selectedProvenanceSpan={selectedProvenanceSpan}
                  onStateChange={onV2PromptStateChange}
                  onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                  onTemplateVariablesChange={onTemplateVariablesChange}
                  onNegativePromptChange={onNegativePromptChange}
                  onSaveContentChange={handleSaveContentChange}
                  editorMode={promptControlsState?.editorMode}
                  onEditorModeChange={
                    promptControlsState ? onEditorModeChange : undefined
                  }
                  compiledTemplate={compiledTemplate}
                  finalPromptText={compiledPromptText}
                  onCustomPromptChange={onCustomPromptChange}
                />
              ) : (
                <UnifiedPromptEditor
                initialPromptText={promptText}
                initialTemplateContent={templateContent}
                initialTemplateVariables={templateVariables}
                auxiliaryVariables={auxiliaryVariables}
                auxiliaryVariableValues={auxiliaryVariableValues}
                templateStatus={templateStatus}
                templateReason={templateReason}
                templateKey={templateKey}
                compact={showRenderDock}
                provenanceSpans={provenanceSpans}
                selectedProvenanceSpan={selectedProvenanceSpan}
                onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                onTemplateContentChange={onTemplateContentChange}
                onTemplateVariablesChange={onTemplateVariablesChange}
                onAuxiliaryVariableChange={handleAuxiliaryVariableChange}
                onSaveContentChange={handleSaveContentChange}
                controlledMode={
                  promptControlsState &&
                  (promptControlsState.editorMode === "text" ||
                    promptControlsState.editorMode === "variables")
                    ? promptControlsState.editorMode
                    : undefined
                }
                onModeChange={
                  promptControlsState
                    ? (mode) => onEditorModeChange?.(mode)
                    : undefined
                }
                onManualTextChange={onManualTextChange}
              />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="flex min-h-[16.25rem] flex-1 flex-col justify-center rounded-xl bg-[var(--surface-low)] p-6">
              <AppIcon icon={FileText} size={24} className="mb-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Prompt will appear here
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {analysisError
                  ? "Prompt context preserved. Back to Edit keeps your workspace ready while you retry analysis or replace the reference."
                  : "Analyze a reference image to prepare generation text, style locks, variables, and negative constraints."}
              </p>
              {analysisError && (
                <button
                  type="button"
                  onClick={onBackToEdit}
                  className="btn-secondary mt-4 w-fit rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Back to Edit
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {showRenderDock && (
        <div data-testid="prompt-render-dock-slot" className="mt-2 shrink-0">
          {renderDock}
        </div>
      )}
      </article>
    </ExpandablePanel>
  );
}

function PromptSkeleton() {
  return (
    <div className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4" aria-label="Prompt loading">
      <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-full animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-11/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--surface-bright)]" />
    </div>
  );
}
