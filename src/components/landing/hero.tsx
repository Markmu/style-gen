import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-16 pb-24 md:pt-20 md:pb-28">
      <div className="mx-auto grid max-w-6xl items-start gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
        <div className="max-w-xl">
          <span className="label-tech mb-4 inline-block rounded-full bg-[var(--surface-low)] px-3 py-1 text-[var(--accent-primary)]">
            Surface - State - Action
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-6xl lg:text-7xl">
            参考图风格再创作
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
            上传一张参考图，获得可编辑的视觉配方、Prompt 和同风格生成入口。
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/workspace"
              className="btn-primary rounded-lg px-8 py-3 text-base font-semibold text-white"
            >
              开始创作
            </Link>
            <Link
              href="/workspace/templates"
              className="btn-secondary rounded-lg px-6 py-3 text-base font-medium"
            >
              模板库
            </Link>
          </div>
        </div>

        <div className="glass-panel rounded-lg p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="media-lens min-h-52 rounded-lg p-4">
              <p className="label-tech text-[var(--text-muted)]">Reference</p>
              <div className="mt-5 aspect-[4/5] rounded-lg bg-[linear-gradient(145deg,#f9d5c0,#bfd9ff_52%,#fff8ea)] p-3">
                <div className="h-full rounded-md bg-[rgba(255,255,255,0.38)] p-3">
                  <div className="h-20 rounded-full bg-[#f4a88f]" />
                  <div className="mt-4 h-12 rounded-md bg-[#2b4f7f]/70" />
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                参考图保留在画布中心。
              </p>
            </div>

            <div className="surface-panel rounded-lg p-4">
              <p className="label-tech text-[var(--accent-primary)]">Recipe</p>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)]">色彩</span>
                  <div className="flex gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-[#f4a88f]" />
                    <span className="h-5 w-5 rounded-full bg-[#bfd9ff]" />
                    <span className="h-5 w-5 rounded-full bg-[#2b4f7f]" />
                  </div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">构图</span>
                  <p className="mt-1 text-[var(--text-primary)]">主体偏右，留白稳定。</p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Prompt</span>
                  <p className="mt-1 text-[var(--text-primary)]">soft editorial portrait, glass light</p>
                </div>
              </div>
            </div>

            <div className="media-lens min-h-52 rounded-lg p-4">
              <p className="label-tech text-[var(--color-success)]">Render</p>
              <div className="mt-5 aspect-[4/5] rounded-lg bg-[linear-gradient(145deg,#eef7ff,#ffffff_48%,#d7ecff)] p-3">
                <div className="h-full rounded-md bg-[rgba(0,80,203,0.08)] p-3">
                  <div className="ml-auto h-24 w-24 rounded-full bg-[#bfd9ff]" />
                  <div className="mt-8 h-10 rounded-md bg-[#f4a88f]/80" />
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                生成结果进入可继续编辑状态。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
