import { getStatusCopy } from "@/lib/ui/status-copy";

const statusItems = [
  getStatusCopy("processing", { title: "Analyzing" }),
  getStatusCopy("success", { title: "Generation Complete" }),
  getStatusCopy("failedRecoverable", { title: "Recoverable Failure" }),
];

export function StatsSection() {
  return (
    <section className="px-4 pb-24 pt-10 md:pb-32 md:pt-16">
      <div className="mx-auto max-w-6xl md:grid md:grid-cols-[0.82fr_1.18fr] md:items-start md:gap-20">
        <div className="mb-10 md:mb-0 md:flex-1">
          <h2 className="max-w-[12ch] text-3xl font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)] md:text-5xl">
            Every state stays clear
          </h2>
          <p className="mt-5 max-w-[36ch] text-base leading-7 text-[var(--text-secondary)]">
            Processing, success, and recovery use the same direct language across
            the product.
          </p>
        </div>

        <div className="grid gap-2">
          {statusItems.map((item) => (
            <article className="landing-status-row rounded-xl px-5 py-5 md:px-6" key={item.status}>
              <p className="text-base font-semibold text-[var(--text-primary)]">
                {item.title}
              </p>
              <p className="mt-2 max-w-[62ch] text-sm leading-6 text-[var(--text-secondary)]">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
