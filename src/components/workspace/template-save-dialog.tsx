"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { PromptTemplate, TemplateVariable } from "@/types/models";
import { mergeTemplateVariables } from "@/lib/template-parser";

interface TemplateSaveDialogProps {
  open: boolean;
  initialContent: string;
  initialVariables?: TemplateVariable[];
  sourceAnalysisTaskId?: string;
  sourceAssetId?: string | null;
  sourceImageUrl?: string | null;
  onSave: (template: PromptTemplate) => void;
  onClose: () => void;
}

/** Variable name合法格式：[a-zA-Z_]\w* */
const VARIABLE_NAME_RE = /^[a-zA-Z_]\w*$/;

const MAX_CONTENT_LENGTH = 10_000;

export function TemplateSaveDialog({
  open,
  initialContent,
  initialVariables = [],
  sourceAnalysisTaskId,
  sourceAssetId,
  sourceImageUrl,
  onSave,
  onClose,
}: TemplateSaveDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variables插入工具栏状态
  const [showVarInput, setShowVarInput] = useState(false);
  const [varNameInput, setVarNameInput] = useState("");
  const [varNameError, setVarNameError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 同步 initialContent 变更（Edit器内容更新时）
  useEffect(() => {
    if (open) {
      setContent(initialContent);
      setName("");
      setError(null);
      setShowVarInput(false);
      setVarNameInput("");
      setVarNameError(null);
    }
  }, [open, initialContent]);

  const variables = mergeTemplateVariables(content, initialVariables);

  /** 在 textarea 当前光标位置插入 {{varName}} */
  const insertVariable = useCallback(
    (varName: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart ?? content.length;
      const end = textarea.selectionEnd ?? content.length;
      const marker = `{{${varName}}}`;
      const newContent =
        content.slice(0, start) + marker + content.slice(end);

      setContent(newContent);
      setVarNameInput("");
      setShowVarInput(false);
      setVarNameError(null);

      // 恢复焦点并设置光标到插入文本之后
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + marker.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [content],
  );

  /** ConfirmVariable name并插入 */
  const handleConfirmVariable = useCallback(() => {
    const trimmed = varNameInput.trim();
    if (!trimmed) {
      setVarNameError("Enter a variable name");
      return;
    }
    if (!VARIABLE_NAME_RE.test(trimmed)) {
      setVarNameError("Variable names must start with a letter or underscore");
      return;
    }
    insertVariable(trimmed);
  }, [varNameInput, insertVariable]);

  /** Save Template */
  const handleSave = async () => {
    // 校验
    if (!name.trim()) {
      setError("Enter a template name");
      return;
    }
    if (!content.trim()) {
      setError("Prompt content cannot be empty");
      return;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      setError(`Prompt content is too long (max ${MAX_CONTENT_LENGTH} characters)`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          content,
          variables,
          sourceAnalysisTaskId: sourceAnalysisTaskId ?? undefined,
          sourceAssetId: sourceAssetId ?? undefined,
          sourceImageUrl: sourceImageUrl ?? undefined,
        }),
      });

      if (res.status === 201) {
        const template = (await res.json()) as PromptTemplate;
        console.log("[template_saved]", template.id, template.name);
        onSave(template);
        onClose();
      } else if (res.status === 409) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "A template with this name already exists");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Save failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // 键盘事件：Escape Close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,28,30,0.32)] p-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* 对话框Subject */}
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-[var(--surface-bright)] ring-1 ring-[var(--border-static)] shadow-[var(--shadow-ambient)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Save as Template"
      >
        {/* 标题栏 */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-6">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Save as Template
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Template Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="template-name"
              className="block text-sm font-medium text-[var(--text-secondary)]"
            >
              Template Name
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Example: Cyberpunk style"
              maxLength={50}
              className="input-precision w-full rounded-t-md px-3 py-2 text-sm"
            />
          </div>

          {/* Prompt Content + Variables插入工具栏 */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="template-content"
                className="block text-sm font-medium text-[var(--text-secondary)]"
              >
                Prompt Content
              </label>
              {!showVarInput ? (
                <button
                  type="button"
                  onClick={() => setShowVarInput(true)}
                  className="h-8 rounded-md border border-[var(--border-interactive)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-low)] hover:text-[var(--accent-primary)]"
                >
                  {"{{}} Insert Variable"}
                </button>
              ) : (
                /* 内联Variable name输入 */
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[var(--text-secondary)]">{"{{"}</span>
                  <input
                    type="text"
                    value={varNameInput}
                    onChange={(e) => {
                      setVarNameInput(e.target.value);
                      setVarNameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleConfirmVariable();
                      } else if (e.key === "Escape") {
                        setShowVarInput(false);
                        setVarNameInput("");
                        setVarNameError(null);
                      }
                    }}
                    placeholder="Variable name"
                    autoFocus
                    className="input-precision h-8 w-28 rounded-t-md px-2 text-xs"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">{"}}"}</span>
                  <button
                    type="button"
                    onClick={handleConfirmVariable}
                    className="h-8 rounded-md px-2 text-xs font-medium text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary-soft)]"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowVarInput(false);
                      setVarNameInput("");
                      setVarNameError(null);
                    }}
                    className="h-8 rounded-md px-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {varNameError && (
              <p className="text-xs text-[var(--color-error)]">{varNameError}</p>
            )}
            <textarea
              ref={textareaRef}
              id="template-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              maxLength={MAX_CONTENT_LENGTH}
              className="input-precision min-h-[220px] w-full resize-y rounded-t-lg px-3 py-3 text-sm leading-6"
              placeholder="Enter or edit prompt template content..."
            />
            <p className="text-right text-xs text-[var(--text-secondary)]/60">
              {content.length} / {MAX_CONTENT_LENGTH.toLocaleString()}
            </p>
          </div>

          {/* Variables预览 */}
          {variables.length > 0 && (
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  Detected Variables ({variables.length})
                </h4>
              </div>
              <div
                data-testid="template-save-variable-grid"
                className="grid gap-3 sm:grid-cols-2"
              >
                {variables.map((variable) => (
                  <label key={variable.name} className="block space-y-1.5">
                    <span className="flex items-center gap-2">
                      <span className="label-tech text-[var(--text-muted)]">
                        {variable.label || variable.name}
                      </span>
                      {variable.sourceField && (
                        <span className="rounded-full bg-[var(--surface-low)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                          {variable.sourceField}
                        </span>
                      )}
                    </span>
                    <input
                      aria-label={`Detected variable ${variable.name}`}
                      readOnly
                      value={variable.defaultValue || "Empty default"}
                      className="input-precision w-full rounded-t-md px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <p className="rounded-lg bg-[var(--color-error-soft)] px-3 py-2 text-sm text-[var(--color-error)]">
              {error}
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex shrink-0 items-center justify-end gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
