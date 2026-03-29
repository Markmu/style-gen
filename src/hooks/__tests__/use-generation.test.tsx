// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGeneration } from "@/hooks/use-generation";

const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  mockSignIn.mockReset();
});

describe("useGeneration", () => {
  it("taskId 为 null 时不发起请求", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useGeneration(null), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isPolling).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("轮询到 completed 后停止", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      const status = callCount >= 2 ? "completed" : "processing";
      return new Response(
        JSON.stringify({
          id: "task-1",
          analysisTaskId: "a-1",
          status,
          promptSnapshot: "prompt",
          negativePromptSnapshot: "",
          params: { aspectRatio: "1:1", quality: "standard" },
          modelName: "test",
          resultAssetId: null,
          resultFileUrl: status === "completed" ? "https://example.com/result.png" : null,
          errorMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { result } = renderHook(() => useGeneration("task-1"), {
      wrapper: createWrapper(),
    });

    // Wait for the first fetch (processing)
    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe("processing");
    });

    // Advance timer past the poll interval (3s)
    await vi.advanceTimersByTimeAsync(3100);

    // Now the second fetch should have returned "completed"
    await vi.waitFor(() => {
      expect(result.current.data?.status).toBe("completed");
    });

    expect(result.current.data?.resultFileUrl).toBe(
      "https://example.com/result.png",
    );
    expect(result.current.error).toBeNull();
  });

  it("轮询到 failed 后停止", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          id: "task-2",
          analysisTaskId: "a-2",
          status: "failed",
          promptSnapshot: "prompt",
          negativePromptSnapshot: "",
          params: { aspectRatio: "1:1", quality: "standard" },
          modelName: "test",
          resultAssetId: null,
          resultFileUrl: null,
          errorMessage: "generation failed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { result } = renderHook(() => useGeneration("task-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("failed");
    });

    expect(result.current.data?.errorMessage).toBe("generation failed");
    expect(result.current.error).toBeNull();
  });

  // 401 响应时调用 signIn 并停止轮询
  it("401 响应时调用 signIn 引导重新登录", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: "Authentication required",
          code: "UNAUTHORIZED",
          retryable: false,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });

    const { result } = renderHook(() => useGeneration("task-401"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(mockSignIn).toHaveBeenCalledWith("google", {
      callbackUrl: expect.any(String),
    });
    expect(result.current.error?.message).toBe("会话已过期，请重新登录");
  });
});
