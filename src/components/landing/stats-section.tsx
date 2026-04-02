export function StatsSection() {
  const stats = [
    { value: "10,000+", label: "已生成图片" },
    { value: "5,000+", label: "活跃用户" },
    { value: "98%", label: "用户满意度" },
  ];

  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-12 md:flex-row">
        {/* 左侧文案 */}
        <div className="flex-1 text-center md:text-left">
          <h2 className="text-3xl font-bold text-[var(--text-primary)]">
            已帮助 10,000+ 设计师快速提取视觉风格
          </h2>
          <p className="mt-4 text-base text-[var(--text-secondary)]">
            从产品设计到创意表达，让风格提取变得简单高效
          </p>
        </div>

        {/* 右侧数据卡 */}
        <div className="grid w-full flex-1 grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-1">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]"
            >
              <p className="text-2xl font-bold text-[var(--accent-primary)]">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
