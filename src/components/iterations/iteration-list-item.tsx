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
        className={`interactive-lift flex w-full items-center gap-4 rounded-lg p-3 text-left transition-colors ${
          selected
            ? "surface-panel ring-1 ring-[var(--accent-primary)]"
            : "surface-panel hover:bg-[var(--surface-floating)]"
        }`}
      >
        <span className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--surface-low)]">
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
              className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
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
              className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
              data-iteration-face="processing"
            >
              <AppIcon
                icon={Clock3}
                size={16}
                className="text-[var(--status-accent-text)]"
              />
              <span className="text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
                {statusFaceTitle.processing}
              </span>
            </span>
          ) : (
            <span
              className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
              data-iteration-face="failed"
            >
              <AppIcon
                icon={AlertTriangle}
                size={16}
                className="text-[var(--status-danger-text)]"
              />
              <span className="text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
                {statusFaceTitle.failed}
              </span>
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
            {model.promptSummary || "Untitled iteration"}
          </span>
          <span className="mt-1 block text-[0.6875rem] text-[var(--text-muted)]">
            {model.createdAtLabel}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
              model.statusTone === "success"
                ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
                : model.statusTone === "danger"
                  ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]"
                  : "bg-[var(--status-accent-bg)] text-[var(--status-accent-text)]"
            }`}
          >
            {model.statusLabel}
          </span>
          {model.status === "completed" && previewFailed && (
            <span className="sr-only" data-copy-key={degradedCopy.key}>
              {degradedCopy.what} {degradedCopy.preserved} {degradedCopy.next}
            </span>
          )}
          <span className="font-mono text-[0.75rem] text-[var(--text-secondary)]">
            {model.settingsSummary}
          </span>
        </span>
      </button>
    </li>
  );
}
