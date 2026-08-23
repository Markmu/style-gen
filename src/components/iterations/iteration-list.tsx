"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { IterationListItemRow } from "@/components/iterations/iteration-list-item";
import { useIterationMemoryView } from "@/hooks/use-iteration-memory-view";
import type { IterationListItem } from "@/types/models";

/**
 * plan-02: Iteration Memory 列表容器。
 *
 * 拥有滚动容器 `[data-testid="iteration-list"]`：滚动位置写入视图 store，
 * 组件重新挂载（从工作台/详情往返）后恢复浏览位置；筛选变化时重置回顶部。
 * 尾部提供"继续浏览较早记录"（keyset 游标翻页）。
 */
export interface IterationListProps {
  items: IterationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadEarlierError: boolean;
  onLoadEarlier: () => void;
}

export function IterationList({
  items,
  selectedId,
  onSelect,
  hasNextPage,
  isFetchingNextPage,
  loadEarlierError,
  onLoadEarlier,
}: IterationListProps) {
  const view = useIterationMemoryView();
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedTokenRef = useRef<number | null>(null);

  // 滚动即保存（ref 写入，不触发渲染）
  const handleScroll = () => {
    if (scrollRef.current) {
      view.saveScrollTop(scrollRef.current.scrollTop);
    }
  };

  // 卸载兜底：程序化 scrollTop 赋值的 scroll 事件在导航前可能尚未派发。
  // 必须用 useLayoutEffect：其 cleanup 在 DOM 分离前同步执行，此时元素
  // 仍可读出 scrollTop；useEffect cleanup 时元素已脱离文档，scrollTop 为 0。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    return () => {
      if (el && el.isConnected) {
        view.saveScrollTop(el.scrollTop);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 挂载恢复 / 筛选令牌变化重置
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (appliedTokenRef.current === null) {
      appliedTokenRef.current = view.scrollResetToken;
      const saved = view.getSavedScrollTop();
      if (saved > 0 && el.scrollHeight > el.clientHeight) {
        el.scrollTop = saved;
      }
      return;
    }
    if (view.scrollResetToken !== appliedTokenRef.current) {
      appliedTokenRef.current = view.scrollResetToken;
      el.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.scrollResetToken, items.length, hasNextPage]);

  return (
    <div
      ref={scrollRef}
      data-testid="iteration-list"
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <ul className="pb-2">
        {items.map((item) => (
          <IterationListItemRow
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            onSelect={onSelect}
          />
        ))}
      </ul>

      {loadEarlierError && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)] shadow-xs"
        >
          <p className="font-medium text-[var(--color-error)]">
            Could not load earlier iterations
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-[var(--text-secondary)]">
            Earlier records could not load. The iterations already listed stay
            visible; try again below.
          </p>
        </div>
      )}

      {hasNextPage && (
        <div className="pt-2 pb-2">
          <button
            type="button"
            onClick={onLoadEarlier}
            disabled={isFetchingNextPage}
            aria-busy={isFetchingNextPage}
            className="btn-secondary flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold tracking-wide transition-all duration-150"
          >
            <AppIcon
              icon={ChevronDown}
              size={15}
              className={`transition-transform duration-200 ${
                isFetchingNextPage ? "animate-spin motion-reduce:animate-none" : ""
              }`}
            />
            <span>{isFetchingNextPage ? "Loading earlier records…" : "Load earlier…"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
