"use client";

interface TextModeEditorProps {
  promptText: string;
  onChange: (value: string) => void;
}

export function TextModeEditor({ promptText, onChange }: TextModeEditorProps) {
  return (
    <label className="flex min-h-0 flex-1 flex-col">
      <textarea
        aria-label="Full Generation Prompt"
        value={promptText}
        onChange={(event) => onChange(event.target.value)}
        className="input-precision min-h-[320px] flex-1 resize-none rounded-t-lg px-3 py-3 text-sm leading-6"
        placeholder="A full prompt appears after analysis, and you can edit it here directly."
      />
    </label>
  );
}
