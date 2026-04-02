"use client";

export function EmptyAnalysis() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--surface-mid)] px-6 py-16 text-center ring-1 ring-[var(--border)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-bright)]">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--text-secondary)]"
        >
          <path d="M12 3v2m0 14v2M5.636 5.636l1.414 1.414m9.9 9.9l1.414 1.414M3 12h2m14 0h2M5.636 18.364l1.414-1.414m9.9-9.9l1.414-1.414" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">风格分析</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        上传参考图后，AI 会自动分析视觉风格
        <br />
        并生成可编辑的 Prompt
      </p>
    </div>
  );
}
