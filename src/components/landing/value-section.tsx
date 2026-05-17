const workflow = [
  {
    step: "01",
    title: "Upload Reference",
    description: "Choose an image you want to use as a style reference",
  },
  {
    step: "02",
    title: "AI Extracts the Visual Recipe",
    description: "Analyze color, composition, lighting, texture, and other visual traits",
  },
  {
    step: "03",
    title: "Generate a New Image in the Same Style",
    description: "Use the extracted recipe and your text intent to generate a new image",
  },
] as const;

export function ValueSection() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
          Recreate a Style in Three Steps
        </h2>
        <p className="mt-4 max-w-lg text-base text-[var(--text-secondary)]">
          A focused workflow for extracting and applying any visual style with AI
        </p>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {workflow.map((item) => (
            <div
              key={item.step}
              className="surface-panel interactive-lift rounded-lg p-5"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-primary-soft)] text-xs font-bold text-[var(--accent-primary)]">
                {item.step}
              </span>
              <h3 className="mt-4 text-base font-bold text-[var(--text-primary)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
