import Link from "next/link";

export function BottomCta() {
  return (
    <section className="bg-[var(--surface-mid)] px-4 py-16 md:py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <span className="icon mb-4 text-4xl text-[var(--accent-primary)]">
          auto_awesome
        </span>
        <h2 className="text-3xl font-bold text-[var(--text-primary)]">
          准备好开始了吗？
        </h2>
        <p className="mt-4 text-base text-[var(--text-secondary)]">
          上传一张参考图，让 AI 为你提取独特的视觉风格
        </p>
        <Link
          href="/workspace"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-8 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90"
        >
          <span className="icon text-xl">rocket_launch</span>
          开始创作
        </Link>
      </div>
    </section>
  );
}
