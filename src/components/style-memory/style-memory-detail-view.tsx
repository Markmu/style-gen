"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock3,
  ImageOff,
  Maximize2,
  Minimize2,
  ShieldQuestion,
} from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type { StyleMemoryDetail } from "@/types/models";

/**
 * plan-05（架构 §6.2 / PRD §3.1 线框）：Style Memory 详情四分区视图。
 *
 * - 验证依据：参考图与代表结果并排 + 来源 Iteration 打开链路（focus 定位）
 * - 保留的风格：风格指纹标签 + 核心保留规则清单（勾选样式 = 已确认）
 * - 可替换内容：变量默认值逐项展示（空默认值标「必填」）
 * - 排除约束与增强方向
 * - 完整提示收进高级信息折叠区（复用 ExpandablePanel，默认收起）
 * - 使用情况：最近使用 + 派生次数
 *
 * 缺失分区标注（AC-09）：任一分区数据缺失（旧资产）时原位显示「待补充 /
 * 来源缺失」说明，不虚构、不用其他数据顶替。
 */

export interface StyleMemoryDetailViewProps {
  detail: StyleMemoryDetail;
  /** 打开代表结果选择器（待验证引导 / 已验证替换共用） */
  onSelectRepresentative: () => void;
}

/** 使用情况时间：本地无关的 `YYYY-MM-DD HH:mm`（含年份，供「最近使用」展示） */
function formatUsageDateTime(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(
    time.getHours(),
  )}:${pad(time.getMinutes())}`;
}

function MissingNote({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/50 px-3.5 py-3 text-xs leading-5 text-[var(--text-secondary)]">
      {children}
    </p>
  );
}

function SectionCard({
  testId,
  title,
  description,
  children,
  className = "",
}: {
  testId: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className={`surface-panel rounded-2xl border border-[var(--border-static)] bg-[var(--surface-panel)] p-4.5 shadow-xs ${className}`}
    >
      <h2 className="text-sm font-bold tracking-[-0.01em] text-[var(--text-primary)]">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          {description}
        </p>
      ) : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

export function StyleMemoryDetailView({
  detail,
  onSelectRepresentative,
}: StyleMemoryDetailViewProps) {
  const advancedTitleId = useId();
  const advancedContentId = useId();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  const hasSourceImage = Boolean(detail.sourceImageUrl);
  const representative = detail.representativeResult;
  const hasRepresentative = representative !== null;
  const hasSourceIteration =
    detail.sourceGenerationTask !== null || detail.sourceGenerationTaskId !== null;
  const sourceIterationId =
    detail.sourceGenerationTask?.id ?? detail.sourceGenerationTaskId;

  return (
    <div className="space-y-5">
      {/* ── 验证依据 ── */}
      <SectionCard
        testId="style-memory-detail-evidence"
        title="验证依据"
        description="这条 Memory 的结论由以下真实产物支撑。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 参考图 */}
          <figure className="min-w-0">
            {hasSourceImage && detail.sourceImageUrl ? (
              <ReferenceImageBlock imageUrl={detail.sourceImageUrl} name={detail.name} />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/60">
                <span className="flex flex-col items-center gap-2 px-4 text-center">
                  <AppIcon icon={ImageOff} size={20} className="text-[var(--text-muted)]" />
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    来源缺失：未记录参考图
                  </span>
                  <span className="text-[0.6875rem] leading-4 text-[var(--text-muted)]">
                    这条 Memory 保存时没有关联参考图（待补充）。
                  </span>
                </span>
              </div>
            )}
            <figcaption className="mt-1.5 text-center text-[0.6875rem] font-medium text-[var(--text-secondary)]">
              参考图
            </figcaption>
          </figure>

          {/* 代表结果 */}
          <figure className="min-w-0">
            {hasRepresentative && representative ? (
              representative.imageUrl ? (
                <RepresentativeImageBlock
                  imageUrl={representative.imageUrl}
                  name={detail.name}
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/60">
                  <span className="px-4 text-center text-xs text-[var(--text-secondary)]">
                    代表结果图暂不可用
                  </span>
                </div>
              )
            ) : (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/50 px-4 text-center">
                <AppIcon
                  icon={ShieldQuestion}
                  size={20}
                  className="text-[var(--text-muted)]"
                />
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  尚无代表结果
                </span>
                <p className="text-[0.6875rem] leading-4 text-[var(--text-muted)]">
                  从相关的已完成 Iteration 选择代表结果
                </p>
                <button
                  type="button"
                  onClick={onSelectRepresentative}
                  className="btn-secondary inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium shadow-sm transition-all hover:border-[var(--border-interactive)] active:scale-[0.98]"
                >
                  选择代表结果
                </button>
              </div>
            )}
            {hasRepresentative ? (
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <figcaption className="text-[0.6875rem] font-medium text-[var(--text-secondary)]">
                  代表结果
                </figcaption>
                <button
                  type="button"
                  onClick={onSelectRepresentative}
                  className="inline-flex items-center gap-1 rounded-md text-[0.6875rem] font-medium text-[var(--accent-primary)] transition-colors hover:underline"
                >
                  替换代表结果
                  <AppIcon icon={ArrowUpRight} size={11} />
                </button>
              </div>
            ) : null}
          </figure>
        </div>

        {/* 来源 Iteration 打开链路（focus 定位，plan-05 Task 8） */}
        <div className="mt-3.5 border-t border-[var(--border-static)] pt-3">
          {hasSourceIteration && sourceIterationId ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">来源 Iteration</span>
              <span>这条 Memory 的规则与结论来自该次生成。</span>
              <Link
                href={`/workspace/iterations?focus=${sourceIterationId}`}
                className="inline-flex items-center gap-1 font-medium text-[var(--accent-primary)] transition-colors hover:underline"
              >
                打开
                <AppIcon icon={ArrowUpRight} size={12} />
              </Link>
            </p>
          ) : (
            <MissingNote>来源缺失：这条 Memory 没有记录来源 Iteration（待补充）。</MissingNote>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── 保留的风格 ── */}
        <SectionCard
          testId="style-memory-detail-style"
          title="保留的风格"
          description="复用时需要延续的风格指纹与核心规则。"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                风格指纹
              </h3>
              {detail.styleTokens.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detail.styleTokens.map((token) => (
                    <span
                      key={token}
                      className="inline-flex items-center rounded-full border border-[var(--border-static)]/60 bg-[var(--surface-control)]/70 px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      {token}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2">
                  <MissingNote>待补充：这条 Memory 保存时未记录风格指纹。</MissingNote>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                核心保留规则
              </h3>
              {detail.retainedRules.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {detail.retainedRules.map((rule) => (
                    <li
                      key={rule}
                      className="flex items-start gap-2 text-xs leading-5 text-[var(--text-primary)]"
                    >
                      <AppIcon
                        icon={Check}
                        size={13}
                        className="mt-0.5 shrink-0 text-[var(--status-success-text)]"
                      />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <MissingNote>待补充：尚未记录核心保留规则。</MissingNote>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── 可替换内容 ── */}
        <SectionCard
          testId="style-memory-detail-variables"
          title="可替换内容"
          description="复用时按变量替换的内容与默认值；空默认值在生成前需要填写。"
        >
          {detail.variables.length > 0 ? (
            <ul className="divide-y divide-[var(--border-static)]">
              {detail.variables.map((variable) => (
                <li
                  key={variable.name}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      {variable.label ?? variable.name}
                    </p>
                    <p className="font-mono text-[0.6875rem] text-[var(--text-muted)]">
                      {`{{${variable.name}}}`}
                    </p>
                  </div>
                  {variable.defaultValue ? (
                    <span className="max-w-[60%] truncate rounded-lg border border-[var(--border-static)]/60 bg-[var(--surface-control)]/60 px-2.5 py-1 text-xs text-[var(--text-primary)]">
                      {variable.defaultValue}
                    </span>
                  ) : (
                    <span className="rounded-full border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--accent-primary)]">
                      必填
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <MissingNote>待补充：这条 Memory 没有可替换变量。</MissingNote>
          )}
        </SectionCard>
      </div>

      {/* ── 排除约束与增强方向 ── */}
      <SectionCard
        testId="style-memory-detail-constraints"
        title="排除约束与增强方向"
        description="复用时应当避免的内容，以及可以进一步强化的方向。"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              排除约束
            </h3>
            {detail.negativeConstraints.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {detail.negativeConstraints.map((constraint) => (
                  <li
                    key={constraint}
                    className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]"
                  >
                    <span aria-hidden="true" className="mt-0.5 font-mono text-[var(--color-error)]">
                      ×
                    </span>
                    <span>{constraint}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2">
                <MissingNote>待补充：尚未记录排除约束。</MissingNote>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              增强方向
            </h3>
            {detail.enhancementHints.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.enhancementHints.map((hint) => (
                  <span
                    key={hint}
                    className="inline-flex items-center rounded-full border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--accent-primary)]"
                  >
                    {hint}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2">
                <MissingNote>待补充：保存时未记录增强方向。</MissingNote>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── 完整提示（高级信息折叠区，默认收起；原位展开，不遮挡页面头操作） ── */}
      <section
        aria-labelledby={advancedTitleId}
        className="surface-panel rounded-2xl border border-[var(--border-static)] bg-[var(--surface-panel)] shadow-xs"
      >
        <div className="flex items-start justify-between gap-3 p-4.5">
          <div className="min-w-0">
            <h2
              id={advancedTitleId}
              className="text-sm font-bold tracking-[-0.01em] text-[var(--text-primary)]"
            >
              高级信息：完整提示
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              含变量占位符的完整提示文本，默认收起；展开仅用于查看与核对。
            </p>
          </div>
          <button
            type="button"
            aria-expanded={advancedExpanded}
            aria-controls={advancedContentId}
            onClick={() => setAdvancedExpanded((expanded) => !expanded)}
            className="btn-secondary inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium shadow-sm transition-all hover:border-[var(--border-interactive)]"
          >
            <AppIcon
              icon={advancedExpanded ? Minimize2 : Maximize2}
              size={13}
              strokeWidth={1.5}
            />
            {advancedExpanded ? "收起完整提示" : "展开完整提示"}
          </button>
        </div>
        {advancedExpanded ? (
          <div id={advancedContentId} className="px-4.5 pb-4.5">
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/50 p-3.5 font-mono text-xs leading-6 text-[var(--text-primary)]">
              {detail.content}
            </pre>
          </div>
        ) : null}
      </section>

      {/* ── 使用情况 ── */}
      <SectionCard
        testId="style-memory-detail-usage"
        title="使用情况"
        description="这条 Memory 被复用与派生的真实记录。"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <AppIcon
              icon={detail.usage.lastUsedAt ? Clock3 : Clock3}
              size={13}
              className="text-[var(--text-muted)]"
            />
            {detail.usage.lastUsedAt ? (
              <span>
                最近使用：
                <span className="font-mono font-medium text-[var(--text-primary)]">
                  {formatUsageDateTime(detail.usage.lastUsedAt)}
                </span>
              </span>
            ) : (
              <span>最近使用：尚未使用</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AppIcon icon={BadgeCheck} size={13} className="text-[var(--text-muted)]" />
            <span className="font-mono font-medium text-[var(--text-primary)]">
              派生 {detail.usage.derivedIterationCount} 次
            </span>
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

function ReferenceImageBlock({ imageUrl, name }: { imageUrl: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/60">
        <span className="px-4 text-center text-xs text-[var(--text-secondary)]">
          参考图暂不可用
        </span>
      </div>
    );
  }
  return (
    <div className="media-lens relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--surface-media)]">
      <Image
        src={imageUrl}
        alt={`${name} 的参考图`}
        fill
        onError={() => setFailed(true)}
        className="object-cover"
        sizes="(min-width: 640px) 40vw, 100vw"
        unoptimized
      />
    </div>
  );
}

function RepresentativeImageBlock({
  imageUrl,
  name,
}: {
  imageUrl: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border-static)] bg-[var(--surface-low)]/60">
        <span className="px-4 text-center text-xs text-[var(--text-secondary)]">
          代表结果图暂不可用
        </span>
      </div>
    );
  }
  return (
    <div className="media-lens relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--surface-media)]">
      <Image
        src={imageUrl}
        alt={`${name} 的代表结果`}
        fill
        onError={() => setFailed(true)}
        className="object-cover"
        sizes="(min-width: 640px) 40vw, 100vw"
        unoptimized
      />
    </div>
  );
}
