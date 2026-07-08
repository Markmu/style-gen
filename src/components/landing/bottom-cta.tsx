import Link from "next/link";

export function BottomCta() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="glass-panel mx-auto flex max-w-4xl flex-col gap-6 rounded-lg p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="max-w-xl">
          <p className="label-tech text-[var(--accent-primary)]">
            Keep the context moving
          </p>
          <h2 className="mt-3 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            Start with a reference, or reopen a saved direction.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            The workspace keeps reference, evidence, prompt, render readiness,
            and Style Memory actions in the same product language.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
          <Link
            href="/workspace"
            className="btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold"
          >
            <span className="icon text-[1.125rem]" aria-hidden="true">
              add_photo_alternate
            </span>
            Start from reference
          </Link>
          <Link
            href="/workspace/templates"
            className="btn-secondary inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold"
          >
            <span className="icon text-[1.125rem]" aria-hidden="true">
              library_books
            </span>
            Open saved directions
          </Link>
        </div>
      </div>
    </section>
  );
}
