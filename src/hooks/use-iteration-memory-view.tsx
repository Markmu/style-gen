"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { IterationStatusFilter } from "@/types/models";

/**
 * plan-02（ADR-6）: Iteration Memory 列表视图状态 store。
 *
 * Provider 挂载于 workspace layout，生命周期覆盖 `/workspace/*` 路由切换，
 * 因此从工作台往返或返回列表后，搜索词、筛选、选中项、游标栈与浏览位置
 * 均不丢失。URL `q`/`status` 由页面层做双向同步（URL 优先于 store 记忆值）。
 */
export interface IterationMemoryViewState {
  /** 搜索关键词（已 trim，≤100 字符） */
  q: string;
  /** 状态筛选；页面级默认 `all`（API 默认 completed 仅为近期条兼容） */
  status: IterationStatusFilter;
  /** 当前选中条目（详情联动，plan-03 消费） */
  selectedId: string | null;
  /** 已加载页的游标栈（plan-03 上一条/下一条消费） */
  cursorStack: string[];
  /** 筛选变更令牌：变化时列表滚动位置重置回顶部 */
  scrollResetToken: number;
}

interface IterationMemoryViewContextValue {
  state: IterationMemoryViewState;
  q: string;
  status: IterationStatusFilter;
  selectedId: string | null;
  cursorStack: string[];
  scrollResetToken: number;
  setFilter: (q: string, status: IterationStatusFilter) => void;
  setSelected: (id: string | null) => void;
  pushCursor: (cursor: string) => void;
  resetScroll: () => void;
  saveScrollTop: (scrollTop: number) => void;
  getSavedScrollTop: () => number;
}

const IterationMemoryViewContext =
  createContext<IterationMemoryViewContextValue | null>(null);

const INITIAL_STATE: IterationMemoryViewState = {
  q: "",
  status: "all",
  selectedId: null,
  cursorStack: [],
  scrollResetToken: 0,
};

export function IterationMemoryViewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IterationMemoryViewState>(INITIAL_STATE);
  // 滚动位置保存在 ref 中：写入频繁，无需触发重渲染。
  const scrollTopRef = useRef(0);

  const resetScroll = useCallback(() => {
    scrollTopRef.current = 0;
    setState((prev) => ({
      ...prev,
      scrollResetToken: prev.scrollResetToken + 1,
    }));
  }, []);

  const setFilter = useCallback(
    (q: string, status: IterationStatusFilter) => {
      setState((prev) => {
        if (prev.q === q && prev.status === status) return prev;
        return {
          ...prev,
          q,
          status,
          cursorStack: [],
          scrollResetToken: prev.scrollResetToken + 1,
        };
      });
      scrollTopRef.current = 0;
    },
    [],
  );

  const setSelected = useCallback((id: string | null) => {
    setState((prev) =>
      prev.selectedId === id ? prev : { ...prev, selectedId: id },
    );
  }, []);

  const pushCursor = useCallback((cursor: string) => {
    setState((prev) => {
      if (prev.cursorStack[prev.cursorStack.length - 1] === cursor) return prev;
      return { ...prev, cursorStack: [...prev.cursorStack, cursor] };
    });
  }, []);

  const saveScrollTop = useCallback((scrollTop: number) => {
    scrollTopRef.current = scrollTop;
  }, []);

  const getSavedScrollTop = useCallback(() => scrollTopRef.current, []);

  return (
    <IterationMemoryViewContext.Provider
      value={{
        state,
        q: state.q,
        status: state.status,
        selectedId: state.selectedId,
        cursorStack: state.cursorStack,
        scrollResetToken: state.scrollResetToken,
        setFilter,
        setSelected,
        pushCursor,
        resetScroll,
        saveScrollTop,
        getSavedScrollTop,
      }}
    >
      {children}
    </IterationMemoryViewContext.Provider>
  );
}

export function useIterationMemoryView(): IterationMemoryViewContextValue {
  const ctx = useContext(IterationMemoryViewContext);
  if (!ctx) {
    throw new Error(
      "useIterationMemoryView must be used within IterationMemoryViewProvider",
    );
  }
  return ctx;
}
