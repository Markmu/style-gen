"use client";

interface PromptEditorProps {
  promptText: string;
  negativePromptText: string;
  onPromptChange: (text: string) => void;
  onNegativePromptChange: (text: string) => void;
  disabled?: boolean;
}

export function PromptEditor({
  promptText,
  negativePromptText,
  onPromptChange,
  onNegativePromptChange,
  disabled = false,
}: PromptEditorProps) {
  return (
    <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
      <h3 className="text-base font-bold text-[var(--text-primary)]">Prompt 编辑</h3>

      <div className="space-y-2">
        <label
          htmlFor="prompt-text"
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          Prompt
        </label>
        <textarea
          id="prompt-text"
          value={promptText}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={disabled}
          rows={6}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-low)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="AI 生成的 Prompt 将在此处显示，你可以自由编辑..."
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="negative-prompt-text"
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          Negative Prompt
        </label>
        <textarea
          id="negative-prompt-text"
          value={negativePromptText}
          onChange={(e) => onNegativePromptChange(e.target.value)}
          disabled={disabled}
          rows={3}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-low)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 transition-colors focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="负面提示词..."
        />
      </div>
    </div>
  );
}
