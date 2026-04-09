import Link from "next/link";

const workflow = [
  {
    step: "01",
    title: "上传参考图",
    description: "选择一张你喜欢的图片作为风格参考",
  },
  {
    step: "02",
    title: "AI 提取视觉配方",
    description: "深度分析色彩、构图、光照、质感等视觉特征",
  },
  {
    step: "03",
    title: "生成同风格新图",
    description: "基于提取的配方，用文字描述生成新图片",
  },
] as const;

export function ValueSection() {
  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
          三步完成风格再创作
        </h2>
        <p className="mt-4 max-w-lg text-base text-[var(--text-secondary)]">
          简单高效，让 AI 帮你提取和应用任何视觉风格
        </p>

        <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-10">
          {workflow.map((item) => (
            <div
              key={item.step}
              className="rounded-xl p-5 transition-all duration-300 hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-bright)] ring-1 ring-[var(--border)]"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-bold text-white">
                {item.step}
              </span>
              <h3 className="mt-4 text-base font-bold text-[var(--text-primary)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {item.description}
              </p>
              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-[var(--border)]/30 to-transparent" />
            </div>
          ))}
        </div>

        <div className="mt-14">
          <Link
            href="/workspace"
            className="btn-primary rounded-xl px-8 py-3 text-base font-semibold text-white"
          >
            立即体验
          </Link>
        </div>
      </div>
    </section>
  );
}
