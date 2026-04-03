import Link from "next/link";

export function BottomCta() {
  return (
    <section className="bg-[var(--surface-mid)] px-4 py-16 md:py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="text-3xl font-bold text-[var(--text-primary)]">
          准备好开始了吗？
        </h2>
        <Link
          href="/workspace"
          className="btn-primary mt-8 rounded-xl px-8 py-3 text-base font-semibold text-white"
        >
          开始创作
        </Link>
      </div>
    </section>
  );
}
