import Link from "next/link";

export function Hero() {
  return (
    <section
      className="relative flex flex-col items-center px-4 pt-20 pb-16 text-center md:pt-28 md:pb-24"
      style={{
        background:
          "radial-gradient(ellipse_at_top, var(--gradient-primary) 0%, transparent 70%)",
      }}
    >
      {/* 徽章标签 */}
      <span className="mb-4 inline-block rounded-full border border-[var(--border)]/15 bg-[var(--surface-mid)] px-3 py-1 text-xs text-[var(--text-secondary)]">
        AI 视觉风格分析工具
      </span>

      {/* 图标区域 */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]/20">
        <span className="icon text-[32px] text-[var(--accent-primary)]">auto_awesome</span>
      </div>

      {/* 主标题 */}
      <h1 className="bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] bg-clip-text text-4xl font-extrabold tracking-tight text-transparent md:text-6xl">
        参考图风格再创作
      </h1>

      {/* 副标题 */}
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
        上传参考图，AI 自动提取视觉配方，<br className="hidden md:inline" />
        生成可编辑的 Prompt，一键创建同风格新图
      </p>

      {/* 双 CTA 按钮 */}
      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/workspace"
          className="btn-glow rounded-xl px-8 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
        >
          开始创作
        </Link>
        <Link
          href="/#features"
          className="rounded-xl border border-[var(--border)]/15 px-6 py-3 text-base font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)]"
        >
          查看示例
        </Link>
      </div>
    </section>
  );
}
