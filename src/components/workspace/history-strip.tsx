"use client";

import Image from "next/image";

export interface HistoryStripItem {
  id: string;
  resultFileUrl: string;
  createdAt: string;
}

interface HistoryStripProps {
  historyItems: HistoryStripItem[];
  status?: "idle" | "loading" | "error";
  errorMessage?: string | null;
  errorStatus?: number;
  onSelect: (id: string) => void;
  onViewAll: () => void;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved render";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function HistoryStrip({
  historyItems,
  status = "idle",
  errorMessage,
  errorStatus,
  onSelect,
  onViewAll,
}: HistoryStripProps) {
  const visibleItems = historyItems.slice(0, 20);
  const hasItems = visibleItems.length > 0;
  const isLoading = status === "loading";
  const hasError = status === "error";
  const compareDisabledReasonId = "history-compare-disabled-reason";
  const compareDisabledReason = hasError
    ? "Compare is paused until Iteration Memory can reconnect."
    : "Compare unlocks after the first render is saved to Iteration Memory.";
  const statusCopy =
    errorStatus === 401
      ? {
          title: "Sign in to view Iteration Memory.",
          description:
            "Your current workspace context stays preserved; sign in, then return to compare, restore, and reuse renders.",
        }
      : {
          title: errorMessage ?? "History temporarily unavailable.",
          description:
            "Your current workspace context stays preserved; retry history later or keep editing this direction.",
        };

  return (
    <section
      data-testid="history-strip"
      className="glass-panel h-full min-w-0 rounded-xl px-4 py-3"
      aria-label="Recent iterations"
    >
      <div className="flex h-full min-w-0 items-center gap-4">
        <div className="flex w-[190px] shrink-0 items-center gap-3">
          <span className="icon text-[18px] text-[var(--accent-primary)]" aria-hidden="true">
            history_toggle_off
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
              Recent iterations
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              Iteration Memory: compare, restore, and reuse
            </p>
          </div>
        </div>

        <div
          data-testid="history-strip-items"
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1"
        >
          {hasError ? (
            <div
              role="status"
              className="min-w-0 rounded-xl bg-[var(--color-warning-soft)] px-4 py-3 text-xs text-[var(--text-secondary)]"
            >
              <p className="font-semibold text-[var(--text-primary)]">{statusCopy.title}</p>
              <p className="mt-1 leading-5">{statusCopy.description}</p>
              <p id={compareDisabledReasonId} className="sr-only">
                {compareDisabledReason}
              </p>
            </div>
          ) : isLoading ? (
            <div
              role="status"
              className="flex min-w-0 items-center gap-2 rounded-xl bg-[var(--surface-low)]/72 px-4 py-3 text-xs text-[var(--text-secondary)]"
            >
              <span className="icon text-[16px] text-[var(--accent-primary)]" aria-hidden="true">
                progress_activity
              </span>
              Loading Iteration Memory.
            </div>
          ) : hasItems ? (
            visibleItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="interactive-lift group relative flex h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-control)] p-1 ring-1 ring-[var(--border-static)]"
                aria-label="Open history item"
              >
                <span className="media-lens relative block h-full w-full rounded-lg">
                  <Image
                    src={item.resultFileUrl}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-150 group-hover:scale-[1.03]"
                    sizes="56px"
                    unoptimized
                  />
                </span>
                <span className="absolute left-1.5 top-1.5 rounded-md bg-[var(--surface-bright)]/88 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] backdrop-blur-xl">
                  {index + 1}
                </span>
                <span className="absolute bottom-1.5 right-1.5 rounded-md bg-[var(--surface-bright)]/88 px-1 py-0.5 text-[9px] font-medium text-[var(--text-secondary)] backdrop-blur-xl">
                  {formatHistoryDate(item.createdAt)}
                </span>
              </button>
            ))
          ) : (
            <div className="min-w-0 rounded-xl bg-[var(--surface-low)]/72 px-4 py-3 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <span className="icon text-[16px] text-[var(--accent-primary)]" aria-hidden="true">
                  auto_awesome
                </span>
                <span>Renders will appear here as visual evidence.</span>
              </div>
              <p className="mt-1 leading-5">
                Compare, restore, and reuse unlock after the first generated result.
              </p>
              <p id={compareDisabledReasonId} className="sr-only">
                {compareDisabledReason}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!hasItems}
          onClick={() => {
            if (hasItems) onSelect(visibleItems[0].id);
          }}
          aria-describedby={!hasItems ? compareDisabledReasonId : undefined}
          title={hasItems ? "Compare latest iteration" : compareDisabledReason}
          className="btn-secondary hidden shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50 md:inline-flex"
        >
          <span className="icon text-[15px]" aria-hidden="true">compare_arrows</span>
          Compare
        </button>
        <button
          type="button"
          onClick={onViewAll}
          className="btn-secondary shrink-0 rounded-lg px-3 py-1.5 text-xs"
        >
          View all
        </button>
      </div>
    </section>
  );
}
