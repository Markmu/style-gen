import Link from "next/link";

export function StatsSection() {
  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-4xl md:flex md:items-center md:gap-12">
        {/* Left: Copy */}
        <div className="mb-10 md:mb-0 md:flex-1">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            已帮助 10,000+ 设计师快速提取视觉风格
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--text-secondary)]">
            只需上传一张参考图，AI 自动完成风格分析、Prompt
            提取和同风格图像生成，大幅缩短创作流程。
          </p>
        </div>

        {/* Right: Data cards */}
        <div className="grid grid-cols-2 gap-4 md:w-[280px]">
          <div className="rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
            <p className="text-2xl font-bold text-[var(--accent-primary)]">
              10,000+
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              已生成图片
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
            <p className="text-2xl font-bold text-[var(--accent-primary)]">
              50+
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              风格标签
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
            <p className="text-2xl font-bold text-[var(--accent-primary)]">
              &lt;3s
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              平均分析耗时
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
            <p className="text-2xl font-bold text-[var(--accent-primary)]">
              98%
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              用户满意度
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
