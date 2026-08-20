"use client";

import { useState } from "react";
import { AlertTriangle, Clock3, ImageIcon } from "lucide-react";
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

const statusFaceTitle: Partial<Record<IterationListItem["status"], string>> = {
  processing: "Generation in progress",
  failed: "Generation failed",
};

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
    <li className="min-w-0">
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
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
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
              className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--status-accent-bg)]/50 px-2 text-center"
              data-iteration-face="processing"
            >
              <span className="relative flex items-center justify-center">
                <span className="absolute h-5 w-5 animate-ping rounded-full bg-[var(--accent-primary)]/30 motion-reduce:animate-none" />
                <AppIcon
                  icon={Clock3}
                  size={16}
                  className="relative text-[var(--status-accent-text)]"
                />
              </span>
              <span className="text-[0.6875rem] font-medium leading-4 text-[var(--text-secondary)]">
                {statusFaceTitle.processing}
              </span>
            </span>
          ) : (
            <span
              className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--status-danger-bg)]/40 px-2 text-center"
              data-iteration-face="failed"
            >
              <AppIcon
                icon={AlertTriangle}
                size={16}
                className="text-[var(--status-danger-text)]"
              />
              <span className="text-[0.6875rem] font-medium leading-4 text-[var(--text-secondary)]">
                {statusFaceTitle.failed}
              </span>
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1 space-y-1">
          <span className="block truncate text-sm font-medium tracking-[-0.01em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-primary)]">
            {model.promptSummary || "Untitled iteration"}
          </span>
          <span className="flex items-center gap-2 text-[0.6875rem] text-[var(--text-muted)]">
            <span>{model.createdAtLabel}</span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide transition-colors ${
              model.statusTone === "success"
                ? "border-[var(--color-success)]/30 bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
                : model.statusTone === "danger"
                  ? "border-[var(--color-error)]/30 bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
                  : "border-[var(--accent-primary)]/30 bg-[var(--status-accent-bg)] text-[var(--status-accent-text)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full shadow-sm ${
                model.statusTone === "success"
                  ? "bg-[var(--color-success)]"
                  : model.statusTone === "danger"
                    ? "bg-[var(--color-error)]"
                    : "bg-[var(--accent-primary)]"
              }`}
              aria-hidden="true"
            />
            {model.statusLabel}
          </span>
          {model.status === "completed" && previewFailed && (
            <span className="sr-only" data-copy-key={degradedCopy.key}>
              {degradedCopy.what} {degradedCopy.preserved} {degradedCopy.next}
            </span>
          )}
          <span className="rounded-md border border-[var(--border-static)] bg-[var(--surface-control)]/80 px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--text-secondary)] shadow-xs">
            {model.settingsSummary}
          </span>
        </span>
      </button>
    </li>
  );
}
