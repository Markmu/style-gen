import Link from "next/link";

const evidenceFacets = [
  { label: "Color", detail: "warm coral, air blue", facet: "color" },
  { label: "Composition", detail: "right-weighted subject", facet: "composition" },
  { label: "Lighting", detail: "soft glass daylight", facet: "lighting" },
  { label: "Texture", detail: "matte paper grain", facet: "texture" },
  { label: "Mood", detail: "calm editorial focus", facet: "mood" },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-14 md:pb-24 md:pt-20">
      <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(30rem,1fr)]">
        <div className="max-w-2xl">
          <span className="label-tech mb-4 inline-block rounded-full bg-[var(--surface-low)] px-3 py-1 text-[var(--accent-primary)]">
            AI evidence workbench
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-6xl lg:text-7xl">
            Reference {"->"} Evidence {"->"} Render
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
            Upload a reference image and let AI read the color, composition,
            lighting, texture, and mood as evidence. Keep that evidence visible
            while you edit the prompt and prepare a new render.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/workspace"
              className="btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-base font-semibold"
            >
              <span className="icon text-[1.125rem]" aria-hidden="true">
                add_photo_alternate
              </span>
              Start from reference
            </Link>
            <Link
              href="/workspace/templates"
              className="btn-secondary inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-base font-medium"
            >
              <span className="icon text-[1.125rem]" aria-hidden="true">
                library_books
              </span>
              Browse Style Memory
            </Link>
          </div>

          <div className="mt-8 grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
            <div className="readiness-row" data-state="ready">
              <span className="icon text-base" aria-hidden="true">
                visibility
              </span>
              <span>AI keeps the reference on canvas.</span>
            </div>
            <div className="readiness-row" data-state="processing">
              <span className="icon text-base" aria-hidden="true">
                auto_awesome
              </span>
              <span>Evidence stays attached to the prompt.</span>
            </div>
            <div className="readiness-row" data-state="waiting">
              <span className="icon text-base" aria-hidden="true">
                tune
              </span>
              <span>Readiness shows what is missing before render.</span>
            </div>
          </div>
        </div>

        <div
          className="glass-panel rounded-lg p-4 sm:p-5"
          aria-label="Reference Evidence Render preview"
        >
          <div className="grid gap-4 md:grid-cols-[0.95fr_1.12fr_0.95fr]">
            <div className="media-lens flex min-h-64 flex-col rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="label-tech text-[var(--text-muted)]">Reference</p>
                <span className="status-tone-dot h-2.5 w-2.5" data-tone="accent" />
              </div>
              <div className="mt-5 aspect-[4/5] overflow-hidden rounded-lg bg-[linear-gradient(145deg,#f9d5c0,#bfd9ff_52%,#fff8ea)] p-3">
                <div className="flex h-full flex-col justify-between rounded-md bg-[rgba(255,255,255,0.42)] p-3">
                  <div className="mx-auto aspect-square w-[74%] rounded-full bg-[#f4a88f]" />
                  <div className="h-[28%] rounded-md bg-[#2b4f7f]/70" />
                </div>
              </div>
              <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
                Source image remains visible while AI reads style signals.
              </p>
            </div>

            <div className="ai-panel surface-panel rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="label-tech text-[var(--accent-primary)]">Evidence</p>
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  prompt-linked
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {evidenceFacets.map((item) => (
                  <div
                    className="evidence-chip w-full justify-between rounded-lg px-3 py-2"
                    data-facet={item.facet}
                    key={item.label}
                  >
                    <span>{item.label}</span>
                    <span className="font-medium">{item.detail}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg bg-[var(--surface-control)] p-3">
                <p className="label-tech text-[var(--text-muted)]">Prompt draft</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                  soft editorial object study, warm coral accent, airy blue
                  field, glass daylight, matte texture
                </p>
              </div>
            </div>

            <div className="media-lens flex min-h-64 flex-col rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="label-tech text-[var(--status-success-text)]">Render</p>
                <span className="status-tone-dot h-2.5 w-2.5" data-tone="success" />
              </div>
              <div className="mt-5 aspect-[4/5] overflow-hidden rounded-lg bg-[linear-gradient(145deg,#eef7ff,#ffffff_48%,#d7ecff)] p-3">
                <div className="flex h-full flex-col justify-between rounded-md bg-[rgba(0,80,203,0.08)] p-3">
                  <div className="mx-auto aspect-square w-[70%] rounded-full bg-[#bfd9ff]" />
                  <div className="mx-auto h-[18%] w-[78%] rounded-md bg-[#f4a88f]/80" />
                </div>
              </div>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                <div className="readiness-row" data-state="ready">
                  <span className="icon text-base" aria-hidden="true">
                    check_circle
                  </span>
                  <span>Variables and service are ready.</span>
                </div>
                <p className="leading-5">
                  Generate, compare, then save the direction as Style Memory.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
