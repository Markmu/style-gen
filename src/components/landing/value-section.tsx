import Link from "next/link";

const workflow = [
  {
    step: "01",
    title: "上传参考图",
    description: "选择一张你喜欢的图片作为风格参考",
    icon: "upload",
  },
  {
    step: "02",
    title: "AI 提取视觉配方",
    description: "深度分析色彩、构图、光照、质感等视觉特征",
    icon: "auto_awesome",
  },
  {
    step: "03",
    title: "生成同风格新图",
    description: "基于提取的配方，用文字描述生成新图片",
    icon: "image",
  },
] as const;

export function ValueSection() {
  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            三步完成风格再创作
          </h2>
          <p className="mt-4 text-base text-[var(--text-secondary)]">
            简单高效，让 AI 帮你提取和应用任何视觉风格
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {workflow.map((item) => (
            <div
              key={item.step}
              className="relative flex flex-col rounded-xl bg-[var(--surface-mid)] px-6 py-8 ring-1 ring-[var(--border)] transition-all duration-300 hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-bright)]"
            >
              {/* 步骤编号 */}
              <div className="mb-4 text-4xl font-bold text-[var(--accent-primary)]/20">
                {item.step}
              </div>

              {/* 图标 */}
              <span className="icon mb-4 text-2xl text-[var(--accent-primary)]">
                {item.icon}
              </span>

              {/* 标题 */}
              <h3 className="mb-2 text-base font-bold text-[var(--text-primary)]">
                {item.title}
              </h3>

              {/* 描述 */}
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* 底部 CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-8 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
          >
            <span className="icon text-xl">play_arrow</span>
            立即体验
          </Link>
        </div>
      </div>
    </section>
  );
}
