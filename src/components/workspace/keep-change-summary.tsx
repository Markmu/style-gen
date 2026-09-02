"use client";

import type { PromptIntent } from "@/types/models";

/**
 * plan-04（架构 §6.2.5 / AC-05）：可追溯「保留 / 改变」摘要。
 * - 保留项仅来自当前 enabled 且未被 disable 的真实 invariants；
 * - 改变项仅来自 content variables 当前值与默认值的比较；
 * - 来源缺失时不伪造描述，显示可恢复空态；
 * - reconstruction 持续显示「同时参考原内容与风格」说明；
 * - 定位动作交由页面完成（保留→真实规则，改变→变量编辑器）；
 * - 调整应用后的更新用 polite live region 通知，不夺走正在编辑的焦点。
 */

export interface KeepChangeKeepItem {
  invariantId: string;
  value: string;
  dimension: string;
}

export interface KeepChangeChangeItem {
  variableName: string;
  label: string;
  value: string;
  defaultValue: string;
}

export type KeepChangeLocateTarget =
  | { kind: "keep"; invariantId: string }
  | { kind: "change"; variableName: string };

export interface KeepChangeSummaryProps {
  intent: PromptIntent;
  keepItems: KeepChangeKeepItem[];
  changeItems: KeepChangeChangeItem[];
  /** 调整/定位后需要突出的摘要项（data-target-id 匹配；plan-05 调整回路消费） */
  highlightedTargetId?: string | null;
  /** polite live region 文案；null 时不播报 */
  announcement?: string | null;
  onLocate: (target: KeepChangeLocateTarget) => void;
}

export function KeepChangeSummary({
  intent,
  keepItems,
  changeItems,
  highlightedTargetId = null,
  announcement = null,
  onLocate,
}: KeepChangeSummaryProps) {
  const hasItems = keepItems.length > 0 || changeItems.length > 0;

  return (
    <section
      data-testid="keep-change-summary"
      data-intent={intent}
      aria-label="Keep and change summary"
      className="shrink-0 rounded-xl bg-[var(--surface-low)]/56 p-2.5 ring-1 ring-[var(--border-static)]"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="label-tech text-[var(--text-muted)]">保留 / 改变</p>
        <span className="text-[0.65rem] text-[var(--text-muted)]">
          {keepItems.length} kept / {changeItems.length} changed
        </span>
      </div>

      {intent === "reconstruction" && (
        <p
          data-testid="keep-change-intent-note"
          className="mt-1.5 px-1 text-xs leading-5 text-[var(--text-secondary)]"
        >
          贴近复刻会同时参考原内容与风格：内容来自参考图观察，规则仍逐条保留。
        </p>
      )}

      {hasItems ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {keepItems.map((item) => (
            <li key={`keep-${item.invariantId}`}>
              <button
                type="button"
                data-testid="keep-change-item"
                data-kind="keep"
                data-target-id={item.invariantId}
                data-dimension={item.dimension}
                title={`Locate rule: ${item.value}`}
                onClick={() => onLocate({ kind: "keep", invariantId: item.invariantId })}
                className={`max-w-full truncate rounded-lg px-2 py-1 text-left text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                  highlightedTargetId === item.invariantId
                    ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
                    : "bg-[var(--surface-bright)]/72 text-[var(--text-secondary)] hover:bg-[var(--surface-bright)]"
                }`}
              >
                {item.value}
              </button>
            </li>
          ))}
          {changeItems.map((item) => (
            <li key={`change-${item.variableName}`}>
              <button
                type="button"
                data-testid="keep-change-item"
                data-kind="change"
                data-target-id={item.variableName}
                title={`Locate variable: ${item.label} = ${item.value}`}
                onClick={() =>
                  onLocate({ kind: "change", variableName: item.variableName })
                }
                className={`max-w-full truncate rounded-lg px-2 py-1 text-left text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                  highlightedTargetId === item.variableName
                    ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]"
                    : "bg-[var(--surface-low)] text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] hover:bg-[var(--surface-bright)]"
                }`}
              >
                {item.label}: {item.defaultValue} → {item.value}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid="keep-change-empty"
          className="mt-1.5 rounded-lg bg-[var(--surface-bright)]/60 px-2.5 py-2 text-xs leading-5 text-[var(--text-secondary)]"
        >
          本次分析没有可追踪的保留规则。在 Style Intelligence 中启用规则后，这里会逐条显示什么被保留、什么被改变。
        </p>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement ?? ""}
      </span>
    </section>
  );
}
