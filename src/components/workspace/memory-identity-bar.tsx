"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock3, EyeOff, X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { WorkspaceMemoryIdentity } from "@/hooks/use-workspace-state";

/**
 * plan-07（架构 §6.5 / PRD 规则 21）：工作台 Style Memory 身份条。
 *
 * - 位于工作台顶栏/AI 状态条下方的条状区，持续可见直至移除/替换来源。
 * - 展示 USING STYLE MEMORY 标签、名称、验证状态徽标与「Restored N retained rules」；
 *   缺失变量清单来自就绪结论单一来源（ADR-7：由页面传入 readiness 派生值），
 *   以「X fields left to fill: …」如实呈现。
 * - 动作：「查看」跳详情；「移除」清 currentTemplateId 与身份，工作区内容保留
 *   （容器 tabIndex=-1，确认导航后首屏焦点落点，AC-08）。
 */

export interface MemoryIdentityBarProps {
  identity: WorkspaceMemoryIdentity;
  /** 仍缺失的必填变量展示名清单（来自 deriveRenderReadiness 同一结论对象） */
  missingVariableNames: string[];
  onRemove: () => void;
}

export function MemoryIdentityBar({
  identity,
  missingVariableNames,
  onRemove,
}: MemoryIdentityBarProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLElement | null>(null);
  const didFocusRef = useRef(false);

  // AC-08：预检确认导航后首屏焦点落身份条（挂载即聚焦一次）
  useEffect(() => {
    if (didFocusRef.current) return;
    didFocusRef.current = true;
    containerRef.current?.focus();
  }, []);

  const verified = identity.verificationStatus === "user_verified";

  return (
    <section
      ref={containerRef}
      data-testid="memory-identity-bar"
      tabIndex={-1}
      aria-label="Style Memory currently in use"
      className="mx-4 flex shrink-0 items-center gap-3 rounded-xl border border-[var(--border-static)]/60 bg-[var(--surface-floating)]/80 p-2.5 outline-none focus-visible:shadow-[var(--focus-ring)] sm:mx-6 lg:mx-8"
    >
      <span className="shrink-0 font-mono text-[0.625rem] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        Using Style Memory
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {identity.name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-static)]/60 bg-[var(--surface-control)]/70 px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--text-secondary)]">
          <AppIcon
            icon={verified ? BadgeCheck : Clock3}
            size={11}
            className={verified ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"}
          />
          {verified ? "User verified" : "Pending verification"}
        </span>
        <span className="shrink-0 text-xs leading-5 text-[var(--text-secondary)]">
          Restored {identity.retainedRuleCount} retained rules
        </span>
        {missingVariableNames.length > 0 && (
          <span
            role="status"
            className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs leading-5 font-medium text-[var(--color-warning)]"
          >
            <AppIcon icon={EyeOff} size={12} className="shrink-0" />
            <span className="truncate">
              {missingVariableNames.length} fields left to fill:{" "}
              {missingVariableNames.join(", ")}
            </span>
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => router.push(`/workspace/templates/${identity.id}`)}
          className="btn-secondary inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          title="Remove this Style Memory identity (workspace content is kept)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <AppIcon icon={X} size={14} />
        </button>
      </div>
    </section>
  );
}
