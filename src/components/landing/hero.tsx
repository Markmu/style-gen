import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  Layers3,
} from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";

const evidenceFacets = [
  { label: "Color", detail: "warm coral, air blue", facet: "color" },
  { label: "Composition", detail: "right-weighted subject", facet: "composition" },
  { label: "Lighting", detail: "soft glass daylight", facet: "lighting" },
  { label: "Texture", detail: "matte paper grain", facet: "texture" },
  { label: "Mood", detail: "calm editorial focus", facet: "mood" },
] as const;

export function Hero() {
  return (
    <section className="landing-hero relative overflow-hidden px-4 pb-16 pt-10 md:pb-20 md:pt-16">
      <div className="mx-auto grid max-w-[90rem] items-center gap-10 lg:grid-cols-[minmax(31rem,0.9fr)_minmax(38rem,1.1fr)] lg:gap-14">
        <div className="max-w-[41rem]">
          <span className="label-tech mb-5 inline-block text-[var(--accent-primary)]">
            Evidence-led image making
          </span>
          <h1
            aria-label="Reference -> Evidence -> Render"
            className="text-[3.35rem] font-semibold leading-[0.94] tracking-[-0.065em] text-[var(--text-primary)] sm:text-[3.75rem] lg:text-[4rem]"
          >
            <span className="block">Reference {"->"}</span>
            <span className="block"> Evidence {"->"} Render</span>
          </h1>
          <p className="mt-6 max-w-[48ch] text-base leading-7 text-[var(--text-secondary)] md:text-lg">
            Upload a reference. Inspect the evidence. Edit what matters, then
            render a new image without losing context.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#upload-reference"
              className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-6 py-3 text-sm font-semibold"
            >
              <AppIcon icon={ArrowDown} />
              Upload reference
            </Link>
            <Link
              href="/workspace/templates"
              className="btn-secondary inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-6 py-3 text-sm font-semibold"
            >
              <AppIcon icon={Layers3} />
              Browse Style Memory
            </Link>
          </div>
        </div>

        <div
          className="landing-workbench-preview relative"
          aria-label="Reference Evidence Render preview"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(13rem,0.72fr)_minmax(0,1fr)] items-stretch gap-2 sm:gap-3">
            <figure className="landing-media-frame relative min-h-[24rem] overflow-hidden rounded-xl sm:min-h-[31rem]">
              <Image
                src="/landing/reference-still-life.webp"
                alt="Coral glass vessel and folded blue paper used as the reference image"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 25vw, 36vw"
              />
              <figcaption className="landing-media-caption">Reference</figcaption>
            </figure>

            <div className="surface-panel flex flex-col rounded-xl p-3 sm:p-4">
              <div>
                <p className="label-tech text-[var(--accent-primary)]">Evidence</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  Observable style signals, attached to the prompt.
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {evidenceFacets.map((item) => (
                  <div
                    className="evidence-chip w-full flex-col items-start rounded-lg px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                    data-facet={item.facet}
                    key={item.label}
                  >
                    <span>{item.label}</span>
                    <span className="text-[0.68rem] font-medium leading-4 sm:text-right">
                      {item.detail}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-4">
                <p className="label-tech text-[var(--text-muted)]">Prompt draft</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-primary)]">
                  Soft editorial still life, glass daylight, mineral surface,
                  coral and cobalt balance.
                </p>
              </div>
            </div>

            <figure className="landing-media-frame relative min-h-[24rem] overflow-hidden rounded-xl sm:min-h-[31rem]">
              <Image
                src="/landing/render-still-life.webp"
                alt="Blue glass ring and coral textile rendered with the reference style"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 25vw, 36vw"
              />
              <figcaption className="landing-media-caption">Render</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
