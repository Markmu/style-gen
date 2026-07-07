const capabilities = [
  {
    title: "Evidence",
    facet: "color",
    eyebrow: "AI style reading",
    description:
      "Color, composition, lighting, texture, and mood become visible signals instead of hidden prompt guesswork.",
  },
  {
    title: "Readiness",
    facet: "lighting",
    eyebrow: "Before render",
    description:
      "Variables, style signals, prompt edits, and service status stay in one scan path before generation starts.",
  },
  {
    title: "Style Memory",
    facet: "mood",
    eyebrow: "Reuse direction",
    description:
      "Save source-backed directions and return to them when a prompt structure is worth reusing.",
  },
] as const;

export function ValueSection() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
          The workbench keeps AI decisions inspectable
        </h2>
        <p className="mt-4 max-w-lg text-base text-[var(--text-secondary)]">
          Landing, Workspace, and Style Memory now use the same evidence,
          readiness, and recovery language.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {capabilities.map((item) => (
            <div
              key={item.title}
              className="surface-panel interactive-lift flex min-h-52 flex-col rounded-lg p-5"
            >
              <span
                className="evidence-chip w-fit"
                data-facet={item.facet}
              >
                {item.eyebrow}
              </span>
              <h3 className="mt-4 text-base font-bold text-[var(--text-primary)]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {item.description}
              </p>
              <div className="mt-auto pt-5">
                <span className="status-tone-dot inline-flex h-2.5 w-2.5" data-tone="accent" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
