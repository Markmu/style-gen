"use client";

interface TextModeEditorProps {
  promptText: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function TextModeEditor({
  promptText,
  onChange,
  compact = false,
}: TextModeEditorProps) {
  return (
    <label className="flex min-h-0 flex-1 flex-col">
      <textarea
        aria-label="Full Generation Prompt"
        value={promptText}
        onChange={(event) => onChange(event.target.value)}
        className={`input-precision flex-1 resize-none rounded-t-lg px-3 text-sm leading-6 ${
          compact ? "min-h-0 py-1.5" : "min-h-[20rem] py-3"
        }`}
        placeholder="A full prompt appears after analysis, and you can edit it here directly."
      />
    </label>
  );
}
