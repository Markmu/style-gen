// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAnalysis } from "@/hooks/use-analysis";
import type { ReactNode } from "react";

const mockSignIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAnalysis", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSignIn.mockReset();
  });

  // 1. taskId 为 null 时不发起请求 - P0
  it("taskId 为 null 时不发起请求", () => {
    globalThis.fetch = vi.fn();

    const { result } = renderHook(() => useAnalysis(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isPolling).toBe(false);
    expect(result.current.error).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // 2. 轮询到 completed 后停止 - P0
  it("轮询到 completed 后停止", async () => {
    const completedTask = {
      id: "task-1",
      sourceAssetId: "asset-1",
      status: "completed",
      recipe: {
        imageSummary: "test",
        subject: "s",
        scene: "sc",
        composition: "c",
        cameraLanguage: "cl",
        lighting: "l",
        color: "co",
        texture: "t",
        styleTags: [],
        mood: "m",
        visualKeywords: [],
        mustKeep: [],
        replaceable: [],
      },
      promptText: "prompt",
      negativePromptText: "neg",
      rawResponse: null,
      errorMessage: null,
      errorStage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(completedTask),
    });

    const { result } = renderHook(() => useAnalysis("task-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data?.status).toBe("completed");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/analysis/task-1");
  });

  // 3. 轮询到 failed 后停止 - P0
  it("轮询到 failed 后停止", async () => {
    const failedTask = {
      id: "task-2",
      sourceAssetId: "asset-1",
      status: "failed",
      recipe: null,
      promptText: null,
      negativePromptText: null,
      rawResponse: null,
      errorMessage: "LLM error",
      errorStage: "llm",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(failedTask),
    });

    const { result } = renderHook(() => useAnalysis("task-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data?.status).toBe("failed");
    expect(result.current.data?.errorMessage).toBe("LLM error");
  });

  // 4. 401 响应时调用 signIn 并停止轮询
  it("401 响应时调用 signIn 引导重新Log in", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: "Authentication required",
          code: "UNAUTHORIZED",
          retryable: false,
        }),
    });

    const { result } = renderHook(() => useAnalysis("task-401"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(mockSignIn).toHaveBeenCalledWith("google", {
      callbackUrl: expect.any(String),
    });
    expect(result.current.error?.message).toBe("Your session expired. Please log in again.");
  });
});
