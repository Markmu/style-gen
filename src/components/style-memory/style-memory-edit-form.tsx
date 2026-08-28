"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, ShieldCheck, X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { invalidateStyleMemoryLists } from "@/components/style-memory/style-memory-delete-dialog";
import { ruleSetsChanged } from "@/lib/style-memory-rules";
import type {
  StyleMemoryDetail,
  TemplateVariable,
  UpdateStyleMemoryRequest,
} from "@/types/models";

/**
 * plan-05（架构 §6.4 / PRD §3.2 编辑线框）：Style Memory 五字段编辑表单。
 *
 * - 字段：名称（1–50）、说明（≤500）、变量默认值（逐变量，名称不可改）、
 *   核心保留规则（逐条可编辑/增删，≤12）、排除约束（同）。
 * - 回退提示：输入变化时用 plan-01 `ruleSetsChanged`（客户端同口径）与已加载
 *   原值比较；任一规则集合实质变化 → 即时提示「保存后状态将变为：pending verification」；
 *   仅元数据变化 → 提示「保持 user verified」。
 * - 提交 PUT /api/templates/[id]（五字段）；409 显示服务端文案并保留表单；
 *   成功后关闭并触发回读刷新（ADR-1：状态以响应为准，禁乐观更新）。
 * - 名称错误时机：中性帮助文案常驻，提交或失焦后才显示错误（PRD 规则 14）。
 */

const NAME_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 500;
const RULE_ITEM_MAX_LENGTH = 200;
const RULES_MAX_COUNT = 12;

export interface StyleMemoryEditFormProps {
  detail: StyleMemoryDetail;
  open: boolean;
  onClose: () => void;
  /** 保存成功后回读详情（消费方触发 GET 刷新） */
  onSaved: () => void | Promise<void>;
}

interface RuleListFieldProps {
  legend: string;
  hint: string;
  rules: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  removeLabel: (index: number) => string;
}

function RuleListField({
  legend,
  hint,
  rules,
  onChange,
  addLabel,
  removeLabel,
}: RuleListFieldProps) {
  return (
    <fieldset className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <legend className="text-xs font-semibold text-[var(--text-primary)]">
          {legend}
        </legend>
        <span className="font-mono text-[0.625rem] text-[var(--text-muted)]">
          {rules.length}/{RULES_MAX_COUNT}
        </span>
      </div>
      <p className="mt-1 text-[0.6875rem] leading-4 text-[var(--text-muted)]">{hint}</p>
      <div className="mt-2 space-y-1.5">
        {rules.map((rule, index) => (
          <div key={`${legend}-${index}`} className="flex items-center gap-1.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">{`${legend} ${index + 1}`}</span>
              <input
                type="text"
                value={rule}
                maxLength={RULE_ITEM_MAX_LENGTH}
                onChange={(event) => {
                  const next = [...rules];
                  next[index] = event.currentTarget.value;
                  onChange(next);
                }}
                className="h-9 w-full min-w-0 rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] px-2.5 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(rules.filter((_, i) => i !== index))}
              aria-label={removeLabel(index + 1)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--color-error)]"
            >
              <AppIcon icon={X} size={14} />
            </button>
          </div>
        ))}
      </div>
      {rules.length < RULES_MAX_COUNT ? (
        <button
          type="button"
          onClick={() => onChange([...rules, ""])}
          className="btn-secondary mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium"
        >
          <AppIcon icon={Plus} size={13} />
          {addLabel}
        </button>
      ) : null}
    </fieldset>
  );
}

export function StyleMemoryEditForm({
  detail,
  open,
  onClose,
  onSaved,
}: StyleMemoryEditFormProps) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description ?? "");
  const [variableDefaults, setVariableDefaults] = useState<string[]>(() =>
    detail.variables.map((variable) => variable.defaultValue),
  );
  const [retainedRules, setRetainedRules] = useState<string[]>(() => [
    ...detail.retainedRules,
  ]);
  const [negativeConstraints, setNegativeConstraints] = useState<string[]>(() => [
    ...detail.negativeConstraints,
  ]);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);

  // 每次打开以最新已加载数据重置表单（编辑期间数据被并发修改时以回读值为准）
  useEffect(() => {
    if (!open) return;
    setName(detail.name);
    setDescription(detail.description ?? "");
    setVariableDefaults(detail.variables.map((variable) => variable.defaultValue));
    setRetainedRules([...detail.retainedRules]);
    setNegativeConstraints([...detail.negativeConstraints]);
    setNameTouched(false);
    setSubmitAttempted(false);
    setSubmitting(false);
    setServerError(null);
  }, [open, detail]);

  // 回退提示（plan-01 同口径客户端判定，架构 §6.4）
  const rulesChanged =
    ruleSetsChanged(detail.retainedRules, retainedRules) ||
    ruleSetsChanged(detail.negativeConstraints, negativeConstraints);
  const showRollbackHint =
    detail.verificationStatus === "user_verified" && rulesChanged;
  const showKeepVerifiedHint =
    detail.verificationStatus === "user_verified" && !rulesChanged;

  const trimmedName = name.trim();
  const nameError =
    (nameTouched || submitAttempted) &&
    (trimmedName.length < 1 || name.length > NAME_MAX_LENGTH)
      ? "Name must be 1-50 characters."
      : null;

  const requestBody = useMemo<UpdateStyleMemoryRequest>(
    () => ({
      name: trimmedName,
      description: description.trim() ? description : null,
      variables: detail.variables.map((variable, index) => ({
        ...variable,
        defaultValue: variableDefaults[index] ?? "",
      })) as TemplateVariable[],
      retainedRules,
      negativeConstraints,
    }),
    [trimmedName, description, detail.variables, variableDefaults, retainedRules, negativeConstraints],
  );

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (trimmedName.length < 1 || name.length > NAME_MAX_LENGTH) {
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/templates/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        let body: { error?: string } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          // 保留默认错误信息
        }
        setServerError(
          body.error ?? "Save failed. Please try again later; your form content is preserved.",
        );
        return;
      }
      onClose();
      // 名称/规则等变化需反映到列表（60s staleTime 缓存）+ 详情回读刷新
      await invalidateStyleMemoryLists(queryClient);
      await onSaved();
    } catch {
      setServerError("Network error — save failed. Your form content is preserved; you can retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      label="Edit Style Memory"
      labelledBy={titleId}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-[var(--border-static)] px-5 py-4 pr-16">
          <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">
            Edit Style Memory
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            Changing the name, description, or variable defaults does not affect
            verification status; changing retained rules or constraints requires
            re-verification.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4.5 overflow-y-auto px-5 py-4">
          {/* 名称 */}
          <div>
            <label htmlFor="style-memory-edit-name" className="text-xs font-semibold text-[var(--text-primary)]">
              Name
            </label>
            <p className="mt-1 text-[0.6875rem] leading-4 text-[var(--text-muted)]">
              1-50 characters; saving fails if another Style Memory uses the same name.
            </p>
            <input
              id="style-memory-edit-name"
              type="text"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => setName(event.currentTarget.value)}
              onBlur={() => setNameTouched(true)}
              aria-invalid={nameError ? true : undefined}
              className="mt-1.5 h-9 w-full rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] px-2.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
            {nameError ? (
              <p role="alert" className="mt-1 text-[0.6875rem] font-medium text-[var(--color-error)]">
                {nameError}
              </p>
            ) : null}
          </div>

          {/* 说明 */}
          <div>
            <label htmlFor="style-memory-edit-description" className="text-xs font-semibold text-[var(--text-primary)]">
              Description
            </label>
            <p className="mt-1 text-[0.6875rem] leading-4 text-[var(--text-muted)]">
              What this memory is for or where it came from; up to {DESCRIPTION_MAX_LENGTH} characters.
            </p>
            <textarea
              id="style-memory-edit-description"
              value={description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={2}
              onChange={(event) => setDescription(event.currentTarget.value)}
              className="mt-1.5 w-full rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] px-2.5 py-2 text-xs leading-5 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </div>

          {/* 变量默认值（名称不可改） */}
          {detail.variables.length > 0 ? (
            <fieldset>
              <legend className="text-xs font-semibold text-[var(--text-primary)]">
                Variable defaults
              </legend>
              <p className="mt-1 text-[0.6875rem] leading-4 text-[var(--text-muted)]">
                Only default values can be changed; variable names come from the full prompt and cannot be renamed here.
              </p>
              <div className="mt-2 space-y-1.5">
                {detail.variables.map((variable, index) => (
                  <div key={variable.name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate font-mono text-[0.6875rem] text-[var(--text-secondary)]">
                      {variable.label ?? variable.name}
                    </span>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">{`Default value for ${variable.label ?? variable.name}`}</span>
                      <input
                        type="text"
                        value={variableDefaults[index] ?? ""}
                        maxLength={500}
                        onChange={(event) => {
                          const next = [...variableDefaults];
                          next[index] = event.currentTarget.value;
                          setVariableDefaults(next);
                        }}
                        className="h-9 w-full min-w-0 rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] px-2.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}

          {/* 核心保留规则 */}
          <RuleListField
            legend="Retained rules"
            hint="Edit one per line; a substantive change to the set (add/remove/replace) triggers re-verification, while reordering does not."
            rules={retainedRules}
            onChange={setRetainedRules}
            addLabel="Add rule"
            removeLabel={(index) => `Remove rule ${index}`}
          />

          {/* 排除约束 */}
          <RuleListField
            legend="Constraints"
            hint="Content to avoid when reusing; a substantive change to the set also triggers re-verification."
            rules={negativeConstraints}
            onChange={setNegativeConstraints}
            addLabel="Add constraint"
            removeLabel={(index) => `Remove constraint ${index}`}
          />

          {/* 回退提示（plan-01 同口径） */}
          {showRollbackHint ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl border border-[var(--status-warning-text)]/40 bg-[var(--status-warning-bg)] px-3.5 py-2.5 text-xs leading-5 text-[var(--text-primary)]"
            >
              <AppIcon
                icon={AlertTriangle}
                size={14}
                className="mt-0.5 shrink-0 text-[var(--status-warning-text)]"
              />
              Retained rules or constraints will change substantively. After
              saving, the status becomes Pending verification — select a
              representative result again to complete verification.
            </p>
          ) : null}
          {showKeepVerifiedHint ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/60 px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)]"
            >
              <AppIcon
                icon={ShieldCheck}
                size={14}
                className="mt-0.5 shrink-0 text-[var(--status-success-text)]"
              />
              Only the name, description, or variable defaults changed — the
              status stays User verified after saving.
            </p>
          ) : null}

          {serverError ? (
            <p role="alert" className="rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--color-error)]">
              {serverError}
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
            ref={submitButtonRef}
            type="submit"
            disabled={submitting}
            className="btn-primary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-semibold"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
