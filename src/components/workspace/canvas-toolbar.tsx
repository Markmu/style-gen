"use client";

interface CanvasToolbarProps {
  resultImageUrl: string;
  referenceImageUrl: string;
  activeView: "result" | "comparison";
  onViewChange: (view: "result" | "comparison") => void;
}

export function CanvasToolbar({
  resultImageUrl,
  activeView,
  onViewChange,
}: CanvasToolbarProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-base)]/80 px-3 py-2 backdrop-blur-sm">
      {/* Result按钮 */}
      <button
        type="button"
        onClick={() => onViewChange("result")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          activeView === "result"
            ? "bg-[var(--accent-primary)] text-white"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
        }`}
      >
        Result
      </button>

      {/* Compare按钮 */}
      <button
        type="button"
        onClick={() => onViewChange("comparison")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          activeView === "comparison"
            ? "bg-[var(--accent-primary)] text-white"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
        }`}
      >
        Compare
      </button>

      {/* 分隔线 */}
      <div className="mx-1 h-4 w-px bg-[var(--border)]" />

      {/* Download按钮 */}
      <a
        href={resultImageUrl}
        download
        className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)]"
      >
        Download
      </a>
    </div>
  );
}
