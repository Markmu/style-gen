"use client";

interface TextModeEditorProps {
  promptText: string;
  onChange: (value: string) => void;
}

export function TextModeEditor({ promptText, onChange }: TextModeEditorProps) {
  return (
    <label className="flex min-h-0 flex-1 flex-col gap-2">
      <span className="text-sm font-medium text-[var(--text-secondary)]">
        完整生成提示
      </span>
      <textarea
        aria-label="完整生成提示"
        value={promptText}
        onChange={(event) => onChange(event.target.value)}
        className="input-precision min-h-[320px] flex-1 resize-none rounded-t-lg px-3 py-3 text-sm leading-6"
        placeholder="分析完成后会生成完整提示，也可以直接在这里编辑。"
      />
    </label>
  );
}
