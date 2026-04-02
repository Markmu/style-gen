const features = [
  {
    icon: "visibility",
    title: "视觉分析",
    description: "AI 深度解析参考图的色彩、构图、光照、质感等视觉特征",
  },
  {
    icon: "deployed_code",
    title: "结构化配方",
    description: "将视觉特征转化为可编辑的结构化 Prompt 模板",
  },
  {
    icon: "sync",
    title: "一键生成",
    description: "基于提取的视觉配方，快速生成同风格的新图片",
  },
] as const;

export function ValueSection() {
  return (
    <section id="features" className="px-4 py-16 md:py-24">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.icon}
            className="flex flex-col items-center rounded-xl bg-[var(--surface-mid)] px-6 py-8 text-center ring-1 ring-[var(--border)] transition-all duration-300 hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-bright)]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-primary)]/10">
              <span className="icon text-[var(--accent-primary)]">{feature.icon}</span>
            </div>
            <h3 className="mb-2 text-base font-bold text-[var(--text-primary)]">
              {feature.title}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {feature.description}
            </p>
            {/* 底部装饰条 */}
            <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-[var(--border)]/30 to-transparent" />
          </div>
        ))}
      </div>
    </section>
  );
}
