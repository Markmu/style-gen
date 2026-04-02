"use client";

export function EmptyAnalysis() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--surface-mid)] px-6 py-16 text-center ring-1 ring-[var(--border)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-bright)]">
        <span className="icon text-[var(--text-secondary)]">image_search</span>
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">风格分析</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        上传参考图，AI 会自动分析视觉风格并生成可编辑的 Prompt
      </p>
      <p className="mt-4 text-xs leading-relaxed text-[var(--text-secondary)]/70">
        三步开始创作：上传参考图 → 查看分析结果 → 编辑生成新图片
      </p>
    </div>
  );
}
