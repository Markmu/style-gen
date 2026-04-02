"use client";

type RetryType = "analysis" | "generation";

interface RetryButtonProps {
  /** 重试类型：分析 or 生成 */
  type: RetryType;
  /** 重试回调 */
  onRetry: () => void;
  /** 是否禁用（如降级状态下） */
  disabled?: boolean;
  /** 禁用时的提示文案 */
  disabledReason?: string;
}

export function RetryButton({
  type,
  onRetry,
  disabled = false,
  disabledReason,
}: RetryButtonProps) {
  const label = type === "analysis" ? "重新分析" : "重新生成";

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          disabled
            ? "cursor-not-allowed bg-[var(--surface-bright)] text-[var(--text-secondary)]"
            : "bg-[var(--accent-primary)] text-white hover:opacity-90"
        }`}
      >
        {label}
      </button>
      {disabled && disabledReason && (
        <p className="text-xs text-[var(--text-secondary)]">{disabledReason}</p>
      )}
    </div>
  );
}
