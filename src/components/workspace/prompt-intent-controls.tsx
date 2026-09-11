"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import type {
  PromptDetailLevel,
  PromptEditorMode,
  PromptIntent,
} from "@/types/models";

/**
 * plan-04（架构 §6.2 / AC-02）：Prompt 两轴控制与编辑方式入口。
 * - 顶层：创作意图（贴近复刻 / 同风格创作）与表达程度（快速 / 平衡 / 详细）；
 * - 次级：三种编辑方式（variables / text / structured）；
 * - 手动改写全文（customPromptDirty）后切换 intent/detail 先确认：
 *   取消零写入且焦点回触发控件，确认才应用 pending selection（架构 §3.2）；
 * - armed 期间 intent/detail 只读并说明「自动任务将使用已确认设置」。
 */

interface PendingSelection {
  axis: "intent" | "detail" | "editor";
  preview?:{before:string;after:string;scope?:string};
  next?:{intent?:PromptIntent;detailLevel?:PromptDetailLevel;editorMode?:PromptEditorMode};
}

export interface PromptIntentControlsProps {
  previewChange?:(next:{intent?:PromptIntent;detailLevel?:PromptDetailLevel;editorMode?:PromptEditorMode})=>{before:string;after:string;scope?:string};
  intent: PromptIntent;
  detailLevel: PromptDetailLevel;
  editorMode: PromptEditorMode;
  /** 手动全文尚未被确认替换时，切换两轴必须先确认（架构 §6.2.6） */
  customPromptDirty: boolean;
  /** 分析中：控件区保持渲染但禁用（用例文档 plan-04 契约） */
  disabled?: boolean;
  /** 快速复刻 armed：已确认设置只读（架构 §3.2 armed 行） */
  locked?: boolean;
  /** structured 只读入口需要完整 V2 Recipe；缺失时禁用该入口 */
  structuredAvailable?: boolean;
  onIntentChange: (intent: PromptIntent) => void;
  onDetailChange: (detail: PromptDetailLevel) => void;
  onEditorModeChange: (mode: PromptEditorMode) => void;
}

const INTENT_OPTIONS: Array<{
  value: PromptIntent;
  testId: string;
  label: string;
  hint: string;
}> = [
  {
    value: "reconstruction",
    testId: "intent-option-reconstruction",
    label: "Close reconstruction",
    hint: "Reuse the original content",
  },
  {
    value: "same_style",
    testId: "intent-option-same-style",
    label: "Same-style creation",
    hint: "New content in the same style",
  },
];

const DETAIL_OPTIONS: Array<{
  value: PromptDetailLevel;
  testId: string;
  label: string;
  hint: string;
}> = [
  {
    value: "concise",
    testId: "detail-option-concise",
    label: "Concise",
    hint: "Compact clauses only",
  },
  {
    value: "standard",
    testId: "detail-option-standard",
    label: "Balanced",
    hint: "Balanced density",
  },
  {
    value: "professional",
    testId: "detail-option-professional",
    label: "Detailed",
    hint: "Every supported observation",
  },
];

const EDITOR_MODE_OPTIONS: Array<{
  value: PromptEditorMode;
  testId: string;
  label: string;
}> = [
  { value: "variables", testId: "editor-mode-option-variables", label: "Variables" },
  { value: "text", testId: "editor-mode-option-text", label: "Full text" },
  { value: "structured", testId: "editor-mode-option-structured", label: "Structured data" },
];

export function PromptIntentControls({
  intent,
  detailLevel,
  editorMode,
  customPromptDirty,
  disabled = false,
  locked = false,
  structuredAvailable = true,
  previewChange,
  onIntentChange,
  onDetailChange,
  onEditorModeChange,
}: PromptIntentControlsProps) {
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const {containerRef:dialogRef}=useFocusTrap({active:!!pending,onEscape:()=>handleCancel()});
  // pending 的应用动作与值一同保存，避免闭包读到旧 props。
  const pendingApplyRef = useRef<(() => void) | null>(null);

  const requestAxisChange = (
    axis: "intent" | "detail" | "editor",
    trigger: HTMLElement,
    apply: () => void,
    isNoop: boolean,
    next:{intent?:PromptIntent;detailLevel?:PromptDetailLevel;editorMode?:PromptEditorMode},
  ) => {
    if (isNoop) return;
    if (!customPromptDirty) {
      apply();
      return;
    }
    // 手动改写保护（架构 §3.2）：先保存 pending selection，确认才替换。
    triggerElementRef.current = trigger;
    pendingApplyRef.current = apply;
    setPending({ axis,preview:previewChange?.(next),next });
  };

  const handleIntentClick = (next: PromptIntent, trigger: HTMLElement) => {
    requestAxisChange("intent", trigger, () => onIntentChange(next), next === intent,{intent:next});
  };

  const handleDetailClick = (next: PromptDetailLevel, trigger: HTMLElement) => {
    requestAxisChange(
      "detail",
      trigger,
      () => onDetailChange(next),
      next === detailLevel,
      {detailLevel:next},
    );
  };

  const currentPreview=pending?.next?previewChange?.(pending.next):undefined;
  const previewChanged=!!pending?.preview&&JSON.stringify(currentPreview)!==JSON.stringify(pending.preview);
  const handleAccept = () => {
    if(previewChanged)return;
    const apply = pendingApplyRef.current;
    setPending(null);
    pendingApplyRef.current = null;
    triggerElementRef.current = null;
    apply?.();
  };

  const handleCancel = () => {
    setPending(null);
    pendingApplyRef.current = null;
    // 取消零写入：pending selection 清除，焦点回触发切换的控件。
    const trigger = triggerElementRef.current;
    triggerElementRef.current = null;
    trigger?.focus();
  };

  const axisDisabled = disabled || locked;

  return (
    <section
      data-testid="prompt-intent-controls"
      data-intent={intent}
      data-detail={detailLevel}
      data-editor-mode={editorMode}
      aria-label="Prompt controls"
      className="@container shrink-0 rounded-xl bg-[var(--surface-low)]/56 p-1.5 ring-1 ring-[var(--border-static)]"
    >
      <div className="grid gap-1.5">
        <ControlGroup label="Intent">
          {INTENT_OPTIONS.map((option) => (
            <ControlToggle
              key={option.value}
              testId={option.testId}
              label={option.label}
              hint={option.hint}
              pressed={intent === option.value}
              disabled={axisDisabled}
              onClick={(element) => handleIntentClick(option.value, element)}
            />
          ))}
        </ControlGroup>
        <ControlGroup label="Detail">
          {DETAIL_OPTIONS.map((option) => (
            <ControlToggle
              key={option.value}
              testId={option.testId}
              label={option.label}
              hint={option.hint}
              pressed={detailLevel === option.value}
              disabled={axisDisabled}
              onClick={(element) => handleDetailClick(option.value, element)}
            />
          ))}
        </ControlGroup>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-[var(--border-static)] pt-1">
        <span className="label-tech mr-1 text-[var(--text-muted)]"> Edit mode </span>
        {EDITOR_MODE_OPTIONS.map((option) => {
          const optionDisabled = option.value === "structured" && !structuredAvailable;
          const button = (
            <button
              key={option.value}
              type="button"
              data-testid={option.testId}
              aria-pressed={editorMode === option.value}
              disabled={optionDisabled}
              title={
                optionDisabled ? "Structured view needs a complete V2 analysis" : undefined
              }
              onClick={event => option.value==='variables'&&customPromptDirty?requestAxisChange('editor',event.currentTarget,()=>onEditorModeChange(option.value),false,{editorMode:option.value}):onEditorModeChange(option.value)}
              className={`h-6 rounded-lg px-2 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                editorMode === option.value
                  ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
                  : "bg-[var(--surface-bright)]/70 text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
              } ${optionDisabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {option.label}
            </button>
          );
          return option.value === "structured" ? (
            <details key={option.value} className="relative ml-auto" open={editorMode === "structured" || undefined}>
              <summary className="cursor-pointer px-2 text-[0.6875rem] text-[var(--text-secondary)]">Advanced</summary>
              <div className="mt-1">{button}</div>
            </details>
          ) : button;
        })}
      </div>

      {locked && (
        <p
          data-testid="prompt-controls-locked-note"
          className="mt-1 rounded-lg bg-[var(--surface-bright)]/72 px-2 py-1 text-[0.6875rem] leading-4 text-[var(--text-secondary)]"
        >
           The automatic render uses confirmed settings. Exit quick recreate to edit intent and detail. </p>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_oklch,var(--surface-page)_72%,transparent)] p-4">
          <div
            ref={dialogRef}
            tabIndex={-1}
            data-testid="prompt-switch-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-switch-confirm-title"
            className="w-full max-w-md rounded-2xl bg-[var(--surface-floating)] p-4 shadow-[var(--shadow-ambient)] ring-1 ring-[var(--border-static)]"
          >
            <h3
              id="prompt-switch-confirm-title"
              className="text-sm font-bold text-[var(--text-primary)]"
            >
               Replace your edited Prompt? </h3>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              You edited the full prompt by hand. Confirming the switch replaces
              it with the newly compiled prompt; cancelling keeps your text
              unchanged.
            </p>
            {pending.preview&&<div className="mt-3 grid max-h-64 gap-3 overflow-y-auto text-xs"><div><p>Before</p><pre className="whitespace-pre-wrap break-words">{pending.preview.before}</pre></div><div><p>After</p><pre className="whitespace-pre-wrap break-words">{pending.preview.after}</pre></div></div>}
            {previewChanged&&<p role="alert">The draft changed. Cancel and review the replacement again.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                data-testid="prompt-switch-confirm-cancel"
                onClick={handleCancel}
                className="btn-secondary h-8 rounded-lg px-3 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="prompt-switch-confirm-accept"
                disabled={previewChanged}
                onClick={handleAccept}
                className="btn-primary h-8 rounded-lg px-3 text-xs font-semibold"
              >
                Replace and switch
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface ControlGroupProps {
  label: string;
  children: ReactNode;
}

function ControlGroup({ label, children }: ControlGroupProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 @max-[18rem]:flex-col @max-[18rem]:items-stretch @max-[18rem]:gap-1">
      <p className="label-tech w-10 shrink-0 px-1 text-[var(--text-muted)]">{label}</p>
      <div className="flex min-w-0 flex-1 gap-1">{children}</div>
    </div>
  );
}

interface ControlToggleProps {
  testId: string;
  label: string;
  hint: string;
  pressed: boolean;
  disabled: boolean;
  onClick: (trigger: HTMLElement) => void;
}

function ControlToggle({
  testId,
  label,
  hint,
  pressed,
  disabled,
  onClick,
}: ControlToggleProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      disabled={disabled}
      title={hint}
      onClick={(event) => onClick(event.currentTarget)}
      className={`min-w-0 flex-1 rounded-lg px-2 py-1 text-center text-[0.6875rem] leading-4 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
        pressed
          ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
          : "bg-[var(--surface-bright)]/70 text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {label}
    </button>
  );
}
