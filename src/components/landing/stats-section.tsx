import { getStatusCopy } from "@/lib/ui/status-copy";

const statusItems = [
  getStatusCopy("processing", { title: "分析中" }),
  getStatusCopy("success", { title: "生成完成" }),
  getStatusCopy("failedRecoverable", { title: "失败可恢复" }),
];

export function StatsSection() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl md:flex md:items-center md:gap-12">
        <div className="mb-10 md:mb-0 md:flex-1">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            状态始终可判断
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--text-secondary)]">
            首页预览、工作台反馈和模板库空态共用同一套状态语气。
          </p>
        </div>

        <div className="grid gap-3 md:w-[360px]">
          {statusItems.map((item) => (
            <div className="surface-panel rounded-lg p-4" key={item.status}>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {item.title}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
