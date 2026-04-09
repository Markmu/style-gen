import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-20 pb-16 md:pt-28 md:pb-24 bg-[radial-gradient(ellipse_at_top,_var(--gradient-primary,_#6d28d9)_0%,_var(--surface-base)_70%)]">
      <div className="mx-auto max-w-6xl md:flex md:items-start md:gap-16">
        {/* Left: Text */}
        <div className="max-w-xl">
          <span className="mb-4 inline-block rounded-full border border-[var(--border)]/15 bg-[var(--surface-mid)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            AI 视觉风格分析工具
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] md:text-6xl lg:text-7xl">
            参考图风格再创作
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
            上传参考图，AI 自动提取视觉配方，生成可编辑的 Prompt，一键创建同风格新图
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/workspace"
              className="btn-primary rounded-xl px-8 py-3 text-base font-semibold text-white"
            >
              开始创作
            </Link>
            <Link
              href="#features"
              className="rounded-xl border border-[var(--border)]/15 px-6 py-3 text-base font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)]"
            >
              查看示例
            </Link>
          </div>
        </div>

        {/* Right: Visual Recipe Preview */}
        <div className="mt-12 md:mt-0 md:w-[420px] lg:w-[460px]">
          <div className="rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
            <span className="label-tech text-[var(--accent-primary)]">
              AI 提取的视觉配方
            </span>

            <div className="mt-4 space-y-3">
              {/* Color palette */}
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                  色彩
                </span>
                <div className="flex gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-[#c17b5a]" />
                  <span className="h-5 w-5 rounded-full bg-[#d4a574]" />
                  <span className="h-5 w-5 rounded-full bg-[#8b6f4e]" />
                  <span className="h-5 w-5 rounded-full bg-[#e8c9a0]" />
                  <span className="h-5 w-5 rounded-full bg-[#2c1810]" />
                </div>
              </div>

              {/* Recipe fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">构图</span>
                  <p className="text-[var(--text-primary)]">三分法，主体偏右</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">光照</span>
                  <p className="text-[var(--text-primary)]">暖色调侧光，柔焦</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">质感</span>
                  <p className="text-[var(--text-primary)]">胶片颗粒感</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--text-secondary)]">情绪</span>
                  <p className="text-[var(--text-primary)]">温暖、怀旧、宁静</p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["暖色调", "复古胶片", "柔焦", "人像", "黄金时刻"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
