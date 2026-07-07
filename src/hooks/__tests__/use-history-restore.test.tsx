// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useHistoryRestore } from "@/hooks/use-history-restore";
import type { VisualRecipe } from "@/types/models";

const recipe: VisualRecipe = {
  imageSummary: "A precise glass flower study",
  subject: "Glass flower",
  scene: "Editorial studio",
  composition: "Centered macro composition",
  cameraLanguage: "Macro lens",
  lighting: "Blue rim light",
  color: "Cool blue and silver",
  texture: "Translucent glass petals",
  styleTags: ["glass", "editorial", "macro"],
  mood: "Quiet and refined",
  visualKeywords: ["translucent", "rim light"],
  mustKeep: ["glass petal structure"],
  replaceable: ["background prop"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHistoryRestore", () => {
  it("restores generation detail with source context and variables", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "history-1",
          analysisTaskId: "analysis-1",
          status: "completed",
          promptSnapshot: "Restored prompt with {{subject}}",
          negativePromptSnapshot: "blurry",
          params: { aspectRatio: "16:9", quality: "hd" },
          modelName: "flux.2",
          resultAssetId: "result-asset",
          resultFileUrl: "https://cdn.example.com/result.webp",
          sourceAssetId: "source-asset",
          sourceImageUrl: "https://cdn.example.com/source.png",
          recipe,
          variables: [
            {
              name: "subject",
              defaultValue: "Glass flower",
              label: "Subject",
              sourceField: "subject",
            },
          ],
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useHistoryRestore());
    let restored: Awaited<ReturnType<typeof result.current.restore>> | null = null;

    await act(async () => {
      restored = await result.current.restore("history-1");
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/generation/history-1");
    expect(restored).toMatchObject({
      resultFileUrl: "https://cdn.example.com/result.webp",
      promptSnapshot: "Restored prompt with {{subject}}",
      negativePromptSnapshot: "blurry",
      analysisTaskId: "analysis-1",
      sourceAssetId: "source-asset",
      sourceImageUrl: "https://cdn.example.com/source.png",
    });
    expect(restored?.variables).toEqual([
      expect.objectContaining({ name: "subject", defaultValue: "Glass flower" }),
    ]);
    expect(result.current.error).toBeNull();
  });

  it("derives contextual variables from recipe when detail has no variable payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "history-2",
          analysisTaskId: "analysis-2",
          status: "completed",
          promptSnapshot: "Restored flattened prompt",
          negativePromptSnapshot: "",
          params: { aspectRatio: "1:1", quality: "standard" },
          modelName: "flux.2",
          resultAssetId: "result-asset",
          resultFileUrl: "https://cdn.example.com/result.webp",
          recipe,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useHistoryRestore());
    let restored: Awaited<ReturnType<typeof result.current.restore>> | null = null;

    await act(async () => {
      restored = await result.current.restore("history-2");
    });

    expect(restored?.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "subject", defaultValue: "Glass flower" }),
      ]),
    );
  });

  it("surfaces restore failure without mutating the caller workspace snapshot", async () => {
    const workspaceSnapshot = {
      promptText: "Draft prompt stays here",
      sourceAssetId: "current-source",
      sourceImageUrl: "https://cdn.example.com/current.png",
    };
    const beforeFailure = { ...workspaceSnapshot };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Restore failed", code: "SERVICE_UNAVAILABLE" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { result } = renderHook(() => useHistoryRestore());

    await act(async () => {
      await expect(result.current.restore("missing-history")).rejects.toThrow("Restore failed");
    });

    expect(result.current.error?.message).toBe("Restore failed");
    expect(result.current.isRestoring).toBe(false);
    expect(workspaceSnapshot).toEqual(beforeFailure);
  });
});
