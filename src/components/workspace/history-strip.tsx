"use client";

import Image from "next/image";

export interface HistoryStripItem {
  id: string;
  resultFileUrl: string;
  createdAt: string;
}

interface HistoryStripProps {
  historyItems: HistoryStripItem[];
  onSelect: (id: string) => void;
  onViewAll: () => void;
}

export function HistoryStrip({
  historyItems,
  onSelect,
  onViewAll,
}: HistoryStripProps) {
  const visibleItems = historyItems.slice(0, 20);

  return (
    <section
      data-testid="history-strip"
      className="glass-panel mx-4 mb-3 shrink-0 rounded-xl px-4 py-3"
      aria-label="History"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="icon text-[18px] text-[var(--accent-primary)]" aria-hidden="true">
            history
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
            History
          </h2>
        </div>

        <div
          data-testid="history-strip-items"
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1"
        >
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="interactive-lift group relative h-12 w-12 shrink-0 rounded-lg border border-[var(--border-static)] bg-[var(--surface-control)] p-1"
              aria-label="Open history item"
            >
              <span className="media-lens relative block h-full w-full rounded-md">
                <Image
                  src={item.resultFileUrl}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-150 group-hover:scale-[1.03]"
                  sizes="48px"
                  unoptimized
                />
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="btn-secondary shrink-0 rounded-md px-3 py-1.5 text-xs"
        >
          View all
        </button>
      </div>
    </section>
  );
}
