import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex flex-col items-center px-4 pt-20 pb-16 text-center md:pt-28 md:pb-24">
      {/* 主标题 */}
      <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-6xl">
        参考图风格再创作
      </h1>

      {/* 副标题 */}
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
        上传参考图，AI 自动提取视觉配方，生成可编辑的 Prompt，一键创建同风格新图
      </p>

      {/* 单一主 CTA */}
      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/workspace"
          className="btn-primary rounded-xl px-8 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
        >
          开始创作
        </Link>
      </div>
    </section>
  );
}
