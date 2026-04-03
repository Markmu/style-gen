export function EmptyAnalysis() {
  return (
    <div className="space-y-5">
      {/* 引导文字 */}
      <p className="text-sm text-[var(--text-secondary)]">
        上传参考图，AI 自动分析色彩、构图、光照等视觉特征，生成可编辑的 Prompt
      </p>

      {/* 示例流程预览 */}
      <div className="space-y-3 rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
        <span className="label-tech text-[var(--text-secondary)]">
          上传后将看到
        </span>

        {/* 示例配方 */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div>
              <span className="text-[var(--text-secondary)]">构图</span>
              <p className="text-[var(--text-primary)]">三分法，主体偏右</p>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">光照</span>
              <p className="text-[var(--text-primary)]">侧光，暖调</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {["暖色调", "人像", "胶片感"].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--surface-bright)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border)]/50 pt-3">
          <p className="text-xs text-[var(--text-secondary)]">
            展开详情查看完整的构图、色彩、质感分析，可自由编辑 Prompt
          </p>
        </div>
      </div>
    </div>
  );
}
