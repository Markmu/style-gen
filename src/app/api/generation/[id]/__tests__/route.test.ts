import { NextRequest } from "next/server";

// ---- Mocks ----

const mockFindGenerationTaskById = vi.fn();
vi.mock("@/lib/repositories/generation-task-repository", () => ({
  findGenerationTaskById: (...args: unknown[]) =>
    mockFindGenerationTaskById(...args),
}));

const mockFindAssetById = vi.fn();
vi.mock("@/lib/repositories/asset-repository", () => ({
  findAssetById: (...args: unknown[]) => mockFindAssetById(...args),
}));

import { GET } from "../route";

// ---- Helpers ----

function createGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/generation/gen-1", {
    method: "GET",
  });
}

const baseTask = {
  id: "gen-1",
  analysisTaskId: "analysis-1",
  promptSnapshot: "a beautiful sunset",
  negativePromptSnapshot: "ugly",
  params: { aspectRatio: "16:9", quality: "high" },
  modelName: "flux.2",
  resultAssetId: null,
  errorMessage: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const completedTask = {
  ...baseTask,
  status: "completed" as const,
  resultAssetId: "asset-gen-1",
};

const generatedAsset = {
  id: "asset-gen-1",
  type: "generated" as const,
  fileUrl: "https://r2.example.com/generated/gen-1/result.webp",
  thumbnailUrl: null,
  width: 1024,
  height: 1024,
  mimeType: "image/webp",
  createdAt: new Date("2025-01-01"),
};

// ---- Tests ----

describe("GET /api/generation/[id]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFindGenerationTaskById.mockReset();
    mockFindAssetById.mockReset();
  });

  // 1. P0: 查询 completed 任务含 resultFileUrl
  it("查询 completed 任务应包含 resultFileUrl", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce(completedTask);
    mockFindAssetById.mockResolvedValueOnce(generatedAsset);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("gen-1");
    expect(json.status).toBe("completed");
    expect(json.resultFileUrl).toBe(
      "https://r2.example.com/generated/gen-1/result.webp"
    );
  });

  // 2. P0: 查询 pending 任务 (resultFileUrl: null)
  it("查询 pending 任务 resultFileUrl 应为 null", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce({
      ...baseTask,
      status: "pending",
    });

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("pending");
    expect(json.resultFileUrl).toBeNull();
  });

  // 3. P0: 查询 processing 任务
  it("查询 processing 任务 resultFileUrl 应为 null", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce({
      ...baseTask,
      status: "processing",
    });

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("processing");
    expect(json.resultFileUrl).toBeNull();
  });

  // 4. P0: 查询 failed 任务
  it("查询 failed 任务应返回 errorMessage", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce({
      ...baseTask,
      status: "failed",
      errorMessage: "model crashed",
    });

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("failed");
    expect(json.errorMessage).toBe("model crashed");
    expect(json.resultFileUrl).toBeNull();
  });

  // 5. P0: 任务不存在 -> 404 NOT_FOUND
  it("任务不存在应返回 404 NOT_FOUND", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "non-existent" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  // 6. P1: completed 但 resultAssetId 为 null
  it("completed 但 resultAssetId 为 null 时 resultFileUrl 应为 null", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce({
      ...baseTask,
      status: "completed",
      resultAssetId: null,
    });

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("completed");
    expect(json.resultFileUrl).toBeNull();
    // 不应查询 Asset
    expect(mockFindAssetById).not.toHaveBeenCalled();
  });

  // 7. P1: completed 但 Asset 不存在
  it("completed 且有 resultAssetId 但 Asset 不存在时 resultFileUrl 应为 null", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce(completedTask);
    mockFindAssetById.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("completed");
    expect(json.resultFileUrl).toBeNull();
  });

  // 8. P1: 查询异常 -> 500 SERVICE_UNAVAILABLE
  it("查询异常应返回 500 SERVICE_UNAVAILABLE", async () => {
    mockFindGenerationTaskById.mockRejectedValueOnce(
      new Error("database connection lost")
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("SERVICE_UNAVAILABLE");
    expect(json.retryable).toBe(true);
  });

  // 9. P1: 响应包含所有字段
  it("响应应包含所有必要字段", async () => {
    mockFindGenerationTaskById.mockResolvedValueOnce(completedTask);
    mockFindAssetById.mockResolvedValueOnce(generatedAsset);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(json).toEqual(
      expect.objectContaining({
        id: "gen-1",
        analysisTaskId: "analysis-1",
        status: "completed",
        promptSnapshot: "a beautiful sunset",
        negativePromptSnapshot: "ugly",
        params: { aspectRatio: "16:9", quality: "high" },
        modelName: "flux.2",
        resultAssetId: "asset-gen-1",
        resultFileUrl: "https://r2.example.com/generated/gen-1/result.webp",
        errorMessage: null,
      })
    );
    // createdAt and updatedAt should be present
    expect(json.createdAt).toBeDefined();
    expect(json.updatedAt).toBeDefined();
  });
});
