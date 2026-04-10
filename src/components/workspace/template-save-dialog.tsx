"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { PromptTemplate } from "@/types/models";
import { extractVariables } from "@/lib/template-parser";

interface TemplateSaveDialogProps {
  open: boolean;
  initialContent: string;
  sourceAnalysisTaskId?: string;
  onSave: (template: PromptTemplate) => void;
  onClose: () => void;
}

/** 变量名合法格式：[a-zA-Z_]\w* */
const VARIABLE_NAME_RE = /^[a-zA-Z_]\w*$/;

const MAX_CONTENT_LENGTH = 10_000;

export function TemplateSaveDialog({
  open,
  initialContent,
  sourceAnalysisTaskId,
  onSave,
  onClose,
}: TemplateSaveDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 变量插入工具栏状态
  const [showVarInput, setShowVarInput] = useState(false);
  const [varNameInput, setVarNameInput] = useState("");
  const [varNameError, setVarNameError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 同步 initialContent 变更（编辑器内容更新时）
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

  const variables = extractVariables(content);

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

  /** 确认变量名并插入 */
  const handleConfirmVariable = useCallback(() => {
    const trimmed = varNameInput.trim();
    if (!trimmed) {
      setVarNameError("请输入变量名");
      return;
    }
    if (!VARIABLE_NAME_RE.test(trimmed)) {
      setVarNameError("变量名格式不正确，需以字母或下划线开头");
      return;
    }
    insertVariable(trimmed);
  }, [varNameInput, insertVariable]);

  /** 保存模板 */
  const handleSave = async () => {
    // 校验
    if (!name.trim()) {
      setError("请输入模板名称");
      return;
    }
    if (!content.trim()) {
      setError("Prompt 内容不能为空");
      return;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      setError(`Prompt 内容过长（最大 ${MAX_CONTENT_LENGTH} 字符）`);
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
          sourceAnalysisTaskId: sourceAnalysisTaskId ?? undefined,
        }),
      });

      if (res.status === 201) {
        const template = (await res.json()) as PromptTemplate;
        console.log("[template_saved]", template.id, template.name);
        onSave(template);
        onClose();
      } else if (res.status === 409) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "已存在同名模板");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "保存失败，请重试");
      }
    } catch {
      setError("网络异常，请检查连接后重试");
    } finally {
      setIsSaving(false);
    }
  };

  // 键盘事件：Escape 关闭
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* 对话框主体 */}
      <div
        className="flex w-full max-w-lg flex-col gap-5 rounded-xl bg-[var(--surface-mid)] p-6 ring-1 ring-[var(--border)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="保存为模板"
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            保存为模板
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            aria-label="关闭"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 模板名称 */}
        <div className="space-y-1.5">
          <label
            htmlFor="template-name"
            className="block text-sm font-medium text-[var(--text-secondary)]"
          >
            模板名称
          </label>
          <input
            id="template-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="例如：赛博朋克风格"
            maxLength={50}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-bright)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
          />
        </div>

        {/* Prompt 内容 + 变量插入工具栏 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="template-content"
              className="block text-sm font-medium text-[var(--text-secondary)]"
            >
              Prompt 内容
            </label>
            {!showVarInput ? (
              <button
                type="button"
                onClick={() => setShowVarInput(true)}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
              >
                {"{{}} 插入变量"}
              </button>
            ) : (
              /* 内联变量名输入 */
              <div className="flex items-center gap-1.5">
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
                  placeholder="变量名"
                  autoFocus
                  className="w-24 rounded border border-[var(--border)] bg-[var(--surface-bright)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
                <span className="text-xs text-[var(--text-secondary)]">{"}}"}</span>
                <button
                  type="button"
                  onClick={handleConfirmVariable}
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)]/10"
                >
                  确认
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVarInput(false);
                    setVarNameInput("");
                    setVarNameError(null);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  取消
                </button>
              </div>
            )}
          </div>
          {varNameError && (
            <p className="text-xs text-red-400">{varNameError}</p>
          )}
          <textarea
            ref={textareaRef}
            id="template-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            maxLength={MAX_CONTENT_LENGTH}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-low)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            placeholder="输入或编辑 Prompt 模板内容..."
          />
          <p className="text-right text-xs text-[var(--text-secondary)]/60">
            {content.length} / {MAX_CONTENT_LENGTH.toLocaleString()}
          </p>
        </div>

        {/* 变量预览 */}
        {variables.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              已识别变量 ({variables.length})
            </p>
            <ul className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <li
                  key={v.name}
                  className="rounded-md bg-[var(--surface-bright)] px-2 py-0.5 text-xs font-mono text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20"
                >
                  {`{{${v.name}}}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "保存中..." : "保存模板"}
          </button>
        </div>
      </div>
    </div>
  );
}
