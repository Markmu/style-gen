import Link from "next/link";

export function BottomCta() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="text-3xl font-bold text-[var(--text-primary)]">
          准备好从参考图开始了吗？
        </h2>
        <Link
          href="/workspace"
          className="btn-primary mt-8 rounded-lg px-8 py-3 text-base font-semibold text-white"
        >
          开始创作
        </Link>
      </div>
    </section>
  );
}
