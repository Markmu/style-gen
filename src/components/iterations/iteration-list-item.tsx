"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, Clock3, ImageIcon } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { getIterationDegradedCopy, ITERATION_DEGRADED_COPY_KEYS, toIterationListItemModel } from "@/lib/iterations/view-model";
import type { IterationListItem } from "@/types/models";

/**
 * plan-02: Iteration Memory 三态条目。
 *
 * completed → 真实结果预览（resultFileUrl，加载失败降级为占位 + 说明）；
 * processing / failed → 状态面（文字 + 状态图形），禁止示例图或空白框冒充。
 */
export interface IterationListItemRowProps {
  item: IterationListItem;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function IterationListItemRow({
  item,
  selected = false,
  onSelect,
}: IterationListItemRowProps) {
  const model = toIterationListItemModel(item);
  const [previewFailed, setPreviewFailed] = useState(false);
  const showRealPreview = model.hasResultPreview && !previewFailed;
  const degradedCopy = getIterationDegradedCopy(
    ITERATION_DEGRADED_COPY_KEYS.resultPreviewUnavailable,
  );

  return (
    <li className="min-w-0 border-t border-[var(--border-static)] first:border-t-0">
      <button
        type="button"
        data-testid="iteration-list-item"
        data-status={model.status}
        data-selected={selected || undefined}
        aria-pressed={selected}
        onClick={() => onSelect?.(model.id)}
        className={`group iteration-item-card ${
          selected ? "is-selected" : ""
        }`}
      >
        <span className="iteration-media-lens">
          {showRealPreview && model.resultFileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={model.resultFileUrl}
              alt={`Result preview: ${model.promptSummary}`}
              loading="lazy"
              onError={() => setPreviewFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : model.status === "completed" ? (
            <span
              className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--surface-low)] px-2 text-center"
              data-degraded="result-preview"
            >
              <AppIcon
                icon={ImageIcon}
                size={16}
                className="text-[var(--text-muted)]"
              />
              <span className="text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
                Preview unavailable
              </span>
            </span>
          ) : model.status === "processing" ? (
            <span
              className="flex h-full w-full items-center justify-center bg-[var(--status-accent-bg)]/50 px-2 text-center"
              data-iteration-face="processing"
            >
              <span className="relative flex items-center justify-center">
                <span className="absolute h-6 w-6 animate-ping rounded-full bg-[var(--accent-primary)]/30 motion-reduce:animate-none" />
                <AppIcon
                  icon={Clock3}
                  size={18}
                  className="relative text-[var(--status-accent-text)]"
                />
              </span>
              <span className="sr-only">Generation in progress</span>
            </span>
          ) : (
            <span
              className="flex h-full w-full items-center justify-center bg-[var(--status-danger-bg)]/40 px-2 text-center"
              data-iteration-face="failed"
            >
              <AppIcon
                icon={AlertTriangle}
                size={18}
                className="text-[var(--status-danger-text)]"
              />
              <span className="sr-only">Generation failed</span>
            </span>
          )}
        </span>

        <span className="iteration-item-copy min-w-0">
          <span
            data-testid="iteration-item-summary"
            className="iteration-item-summary block text-[0.8125rem] font-semibold leading-5 tracking-[-0.01em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-primary)]"
          >
            {model.promptSummary || "Untitled iteration"}
          </span>
          <span className="iteration-item-created mt-1.5 flex min-w-0 items-center gap-2 text-[0.6875rem] text-[var(--text-muted)]">
            <span className="truncate">{model.createdAtLabel}</span>
            <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[var(--border-static)]" />
            <span className="iteration-settings-badge shrink-0 font-mono text-[0.65625rem] text-[var(--text-secondary)]">
              {model.settingsSummary}
            </span>
          </span>
        </span>{" "}

        <span className="iteration-item-meta flex shrink-0 items-center gap-1.5">
          <span
            className={`iteration-status-label text-[0.65625rem] font-semibold transition-colors ${
              model.statusTone === "success"
                ? "text-[var(--status-success-text)]"
                : model.statusTone === "danger"
                  ? "text-[var(--status-danger-text)]"
                  : "text-[var(--status-accent-text)]"
            }`}
          >
            {model.statusLabel}
          </span>
          {model.status === "completed" && previewFailed && (
            <span className="sr-only" data-copy-key={degradedCopy.key}>
              {degradedCopy.what} {degradedCopy.preserved} {degradedCopy.next}
            </span>
          )}
          <AppIcon
            icon={ChevronRight}
            size={14}
            className="text-[var(--text-muted)] transition-transform duration-150 group-hover:translate-x-px group-hover:text-[var(--accent-primary)] motion-reduce:transition-none"
          />
        </span>
      </button>
    </li>
  );
}
