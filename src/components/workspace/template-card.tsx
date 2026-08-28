"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  Eye,
  ImageOff,
} from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { StyleMemoryListItem } from "@/types/models";
import { deriveStyleMemoryCardViewModel } from "@/lib/style-memory-view-model";

interface TemplateCardProps {
  template: StyleMemoryListItem;
  onUse: (id: string) => void | Promise<void>;
  /** plan-05: `/workspace/templates?focus=<id>` 定位命中时的高亮态 */
  focused?: boolean;
}

/**
 * plan-04 Style Memory 卡片（PRD §3.1 线框）：
 * 状态徽标（文字 + 视觉标识）→ 预览（已验证：代表结果 + 参考图标注；
 * pending 卡：来源图或“无预览”）→ 真实规则摘要 → 变量数 · 最近使用 → View details / Use。
 * 卡片只保留“View details / Use”；复制、删除等治理动作集中在详情页（PRD 决策）。
 */
export function TemplateCard({ template, onUse, focused = false }: TemplateCardProps) {
  const memory = deriveStyleMemoryCardViewModel(template);
  const [representativeFailed, setRepresentativeFailed] = useState(false);

  // 降级（架构 §8.2 L1）：代表结果图加载失败 → 回退来源图并说明，状态徽标不变
  const showRepresentativeFallback =
    memory.preview.kind === "representative" && representativeFailed;
  const mainImageUrl = showRepresentativeFallback
    ? memory.preview.referenceImageUrl
    : memory.preview.mainImageUrl;
  const mainAlt = showRepresentativeFallback
    ? `Source reference for ${memory.name}`
    : memory.preview.mainAlt;
  const showReferenceThumb =
    memory.preview.kind === "representative" &&
    !representativeFailed &&
    Boolean(memory.preview.referenceImageUrl);

  const handleUse = () => {
    void onUse(memory.id);
  };

  return (
    <article
      data-testid="style-memory-card"
      data-verification-status={memory.verificationStatus}
      data-focused={focused ? "true" : undefined}
      className={`style-memory-card group relative flex flex-col rounded-2xl border transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none ${
        focused
          ? "ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--surface-page)] border-[var(--accent-primary)] shadow-md"
          : "hover:border-[var(--border-interactive)]"
      }`}
    >
      {/* 预览区：verified → 代表结果主预览 + “参考图”小图；pending → 来源图或“无预览” */}
      <div className="style-memory-source media-lens relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-[var(--surface-media)]">
        {mainImageUrl ? (
          <>
            <Image
              src={mainImageUrl}
              alt={mainAlt}
              fill
              onError={
                memory.preview.kind === "representative"
                  ? () => setRepresentativeFailed(true)
                  : undefined
              }
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:transition-none"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 via-black/10 to-transparent pointer-events-none" />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center bg-gradient-to-b from-[var(--surface-control)]/40 to-[var(--surface-low)]/80">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-static)]/60 bg-[var(--surface-panel)]/80 shadow-sm backdrop-blur-sm">
              <AppIcon icon={ImageOff} size={22} className="text-[var(--text-muted)]" />
            </div>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              No preview
            </span>
            <p className="max-w-[14rem] text-xs leading-relaxed text-[var(--text-secondary)]">
              No source reference or representative result is linked to this
              memory yet.
            </p>
          </div>
        )}

        {/* 状态徽标：文字 + 图标（不只依赖颜色，PRD 规则 3） */}
        <span
          className={`absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold shadow-sm backdrop-blur-md ${
            memory.statusBadge.isVerified
              ? "border-[var(--border-static)]/60 bg-[var(--surface-floating)]/95 text-[var(--text-primary)]"
              : "border-[var(--border-static)]/60 bg-[var(--surface-floating)]/90 text-[var(--text-secondary)]"
          }`}
        >
          <AppIcon
            icon={memory.statusBadge.isVerified ? BadgeCheck : Clock3}
            size={12}
            className={
              memory.statusBadge.isVerified
                ? "text-[var(--accent-primary)]"
                : "text-[var(--text-muted)]"
            }
          />
          {memory.statusBadge.label}
        </span>

        {/* 已验证：来源图小图 + “参考图”标注 */}
        {showReferenceThumb && memory.preview.referenceImageUrl && (
          <figure className="absolute bottom-2.5 right-2.5 z-10">
            <div className="relative h-12 w-[4.25rem] overflow-hidden rounded-lg border border-[var(--border-static)]/70 bg-[var(--surface-floating)]/95 shadow-md backdrop-blur-md">
              <Image
                src={memory.preview.referenceImageUrl}
                alt={`Source reference for ${memory.name}`}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            </div>
            <figcaption className="mt-1 rounded-full bg-[var(--surface-floating)]/95 px-1.5 py-0.5 text-center text-[0.625rem] font-medium text-[var(--text-secondary)] shadow-sm backdrop-blur-md">
              Reference
            </figcaption>
          </figure>
        )}

        {/* 降级说明：代表结果图失效时保留徽标、回退来源图并明确原因 */}
        {showRepresentativeFallback && (
          <span className="absolute bottom-2.5 left-3 z-10 rounded-md bg-[var(--surface-floating)]/95 px-2 py-1 text-[0.6875rem] font-medium text-[var(--text-secondary)] shadow-sm backdrop-blur-md">
            Representative result unavailable
          </span>
        )}
      </div>

      {/* 卡片内容：名称 → 真实规则摘要 → 变量数 · 最近使用 → 动作 */}
      <div className="flex flex-1 flex-col gap-3 p-4.5">
        <div className="space-y-1.5">
          <h3 className="line-clamp-1 text-base font-semibold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-primary)]">
            {memory.name}
          </h3>
          <p
            className="line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-[var(--text-secondary)]"
            title={memory.rulesSummary}
          >
            {memory.rulesSummary}
          </p>
        </div>

        <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[0.6875rem] text-[var(--text-muted)]">
          <span>{memory.variableLabel}</span>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span>{memory.lastUsedLabel}</span>
        </p>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <Link
            href={memory.actions.viewDetailHref}
            className="btn-secondary inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium shadow-sm transition-all hover:border-[var(--border-interactive)] active:scale-[0.98]"
          >
            <AppIcon icon={Eye} size={14} />
            <span>{memory.actions.viewDetailLabel}</span>
          </Link>
          <button
            type="button"
            onClick={handleUse}
            className="btn-primary inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
          >
            <span>{memory.actions.useLabel}</span>
            <AppIcon icon={ArrowUpRight} size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
