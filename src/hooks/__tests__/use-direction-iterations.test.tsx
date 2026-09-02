// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  DIRECTION_FEED_POLL_INTERVAL_MS,
  useDirectionIterations,
} from "@/hooks/use-direction-iterations";
import type { DirectionIterationFeed } from "@/types/models";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function feedResponse(
  overrides: Partial<DirectionIterationFeed> = {},
): DirectionIterationFeed {
  return {
    completed: [
      {
        id: "dir-c-1",
        status: "completed",
        promptSummary: "Direction iteration dir-c-1",
        resultFileUrl: "https://cdn.example.com/results/dir-c-1.webp",
        params: { aspectRatio: "1:1", quality: "standard" },
        createdAt: "2026-09-01T00:01:00.000Z",
        resultAssetId: "asset-dir-c-1",
        errorMessage: null,
      },
    ],
    active: {
      id: "dir-active-1",
      status: "processing",
      promptSummary: "Direction iteration dir-active-1",
      resultFileUrl: null,
      params: { aspectRatio: "1:1", quality: "standard" },
      createdAt: "2026-09-01T00:02:00.000Z",
      resultAssetId: null,
      errorMessage: null,
    },
    latestFailure: null,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useDirectionIterations", () => {
  it("analysisTaskId 为 null 时不发起请求", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useDirectionIterations(null), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.feed).toBeNull();
  });

  it("请求 view=direction + analysisTaskId + pageSize=5 的分组 DTO", async () => {
    const feed = feedResponse();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(feed));

    const { result } = renderHook(() => useDirectionIterations("task-a"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.feed?.completed).toHaveLength(1);
    });

    const url = new URL(fetchSpy.mock.calls[0][0] as string, window.location.href);
    expect(url.searchParams.get("view")).toBe("direction");
    expect(url.searchParams.get("analysisTaskId")).toBe("task-a");
    expect(url.searchParams.get("pageSize")).toBe("5");

    // 分组 DTO 原样消费：active 不混入 completed（ADR-5 三组不共享名额）
    expect(result.current.feed?.active?.id).toBe("dir-active-1");
    expect(result.current.feed?.completed[0]?.id).toBe("dir-c-1");
    expect(result.current.isPolling).toBe(true);
  });

  it("active 存在时按间隔刷新，终态（active 清空）后停止", async () => {
    vi.useFakeTimers();
    let feed: DirectionIterationFeed = feedResponse();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse(feed));

    const { result } = renderHook(() => useDirectionIterations("task-b"), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.feed?.active?.id).toBe("dir-active-1");
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // active 期间按 DIRECTION_FEED_POLL_INTERVAL_MS 刷新
    await vi.advanceTimersByTimeAsync(DIRECTION_FEED_POLL_INTERVAL_MS);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 终态：active 清空后停止轮询
    feed = feedResponse({ active: null });
    await vi.advanceTimersByTimeAsync(DIRECTION_FEED_POLL_INTERVAL_MS);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => {
      expect(result.current.feed?.active).toBeNull();
    });
    expect(result.current.isPolling).toBe(false);

    await vi.advanceTimersByTimeAsync(DIRECTION_FEED_POLL_INTERVAL_MS * 3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("分析方向变化时 query key 隔离，不读取旧方向缓存", async () => {
    let task = "task-a";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        jsonResponse(
          feedResponse({
            completed: [
              {
                id: `completed-${task}`,
                status: "completed",
                promptSummary: `Direction iteration ${task}`,
                resultFileUrl: "https://cdn.example.com/results/x.webp",
                params: { aspectRatio: "1:1", quality: "standard" },
                createdAt: "2026-09-01T00:01:00.000Z",
                resultAssetId: `asset-${task}`,
                errorMessage: null,
              },
            ],
            active: null,
          }),
        ),
      );

    const { result, rerender } = renderHook(
      () => useDirectionIterations(task),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.feed?.completed[0]?.id).toBe("completed-task-a");
    });

    task = "task-b";
    rerender();
    await waitFor(() => {
      expect(result.current.feed?.completed[0]?.id).toBe("completed-task-b");
    });

    const urls = fetchSpy.mock.calls.map(
      (call) => new URL(call[0] as string, window.location.href),
    );
    expect(urls.every((url) => url.searchParams.get("view") === "direction")).toBe(
      true,
    );
    expect(urls.map((url) => url.searchParams.get("analysisTaskId"))).toEqual([
      "task-a",
      "task-b",
    ]);
  });

  it("刷新失败保留 previous data 并暴露错误与重试（L2）", async () => {
    let fail = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (fail) {
        return jsonResponse(
          { error: "Direction feed temporarily unavailable" },
          503,
        );
      }
      return jsonResponse(feedResponse());
    });

    const { result } = renderHook(() => useDirectionIterations("task-c"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.feed?.completed).toHaveLength(1);
    });

    fail = true;
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe(
      "Direction feed temporarily unavailable",
    );
    // previous data 保留：不清空既有 feed
    expect(result.current.feed?.completed[0]?.id).toBe("dir-c-1");
    expect(result.current.feed?.active?.id).toBe("dir-active-1");

    // 重试恢复：错误清除、数据更新
    fail = false;
    await result.current.refetch();
    await waitFor(() => {
      expect(result.current.isError).toBe(false);
    });
    expect(result.current.feed?.completed).toHaveLength(1);
  });

  it("非分组形态响应按空 feed 处理，不把列表条目伪造成方向结果", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ items: [], nextCursor: null }),
    );

    const { result } = renderHook(() => useDirectionIterations("task-d"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.feed).not.toBeNull();
    });
    expect(result.current.feed).toEqual({
      completed: [],
      active: null,
      latestFailure: null,
    });
    expect(result.current.isError).toBe(false);
  });
});
