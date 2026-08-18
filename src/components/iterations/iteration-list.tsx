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
      <ul className="flex flex-col gap-2 pb-2">
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
        <p
          role="status"
          className="mt-2 rounded-md px-1 py-2 text-sm text-[var(--text-secondary)]"
        >
          Earlier records could not load. The iterations already listed stay
          visible; try again below.
        </p>
      )}

      {hasNextPage && (
        <button
          type="button"
          onClick={onLoadEarlier}
          disabled={isFetchingNextPage}
          aria-busy={isFetchingNextPage}
          className="btn-secondary mt-2 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          <AppIcon icon={ChevronDown} size={16} />
          Load earlier…
        </button>
      )}
    </div>
  );
}
