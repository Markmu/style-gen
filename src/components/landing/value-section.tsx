const capabilities = [
  {
    title: "Evidence",
    facet: "color",
    description:
      "Color, composition, lighting, texture, and mood become visible signals instead of hidden prompt guesswork.",
  },
  {
    title: "Readiness",
    facet: "lighting",
    description:
      "Variables, style signals, prompt edits, and service status stay in one scan path before generation starts.",
  },
  {
    title: "Style Memory",
    facet: "mood",
    description:
      "Save source-backed directions and return to them when a prompt structure is worth reusing.",
  },
] as const;

export function ValueSection() {
  return (
    <section className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)] md:text-5xl">
          The workbench keeps AI decisions inspectable
        </h2>
        <p className="mt-5 max-w-[58ch] text-base leading-7 text-[var(--text-secondary)]">
          See what the model observed, what remains editable, and what is ready
          before committing to a render.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:grid-rows-2">
          {capabilities.map((item, index) => (
            <article
              key={item.title}
              className={`landing-capability flex flex-col justify-between rounded-xl p-6 md:p-8 ${
                index === 0 ? "md:row-span-2 md:min-h-[28rem]" : "md:min-h-[13.5rem]"
              }`}
              data-facet={item.facet}
            >
              <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] md:text-2xl">
                {item.title}
              </h3>
              <p className="mt-10 max-w-[42ch] text-sm leading-6 text-[var(--text-secondary)] md:text-base md:leading-7">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
