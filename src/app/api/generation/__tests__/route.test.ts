import { NextRequest } from "next/server";

// ---- Mocks ----

const mockFindAnalysisTaskById = vi.fn();
vi.mock("@/lib/repositories/analysis-task-repository", () => ({
  findAnalysisTaskById: (...args: unknown[]) => mockFindAnalysisTaskById(...args),
}));

const mockCreateGenerationTask = vi.fn();
const mockUpdateGenerationTask = vi.fn();
vi.mock("@/lib/repositories/generation-task-repository", () => ({
  createGenerationTask: (...args: unknown[]) => mockCreateGenerationTask(...args),
  updateGenerationTask: (...args: unknown[]) => mockUpdateGenerationTask(...args),
}));

const mockCreateAsset = vi.fn();
vi.mock("@/lib/repositories/asset-repository", () => ({
  createAsset: (...args: unknown[]) => mockCreateAsset(...args),
}));

const mockGenerateImage = vi.fn();
vi.mock("@/lib/ai/image-gen", () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  ImageGenError: class ImageGenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ImageGenError";
    }
  },
}));

const mockUploadBuffer = vi.fn();
const mockGetPublicUrl = vi.fn();
vi.mock("@/lib/r2", () => ({
  uploadBuffer: (...args: unknown[]) => mockUploadBuffer(...args),
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
}));

// Mock global fetch for downloading temp image
const mockFetch = vi.fn();

import { POST } from "../route";

// ---- Helpers ----

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  analysisTaskId: "analysis-1",
  promptText: "a beautiful sunset",
  negativePromptText: "ugly",
  params: {
    aspectRatio: "16:9",
    quality: "high",
  },
};

const completedAnalysisTask = {
  id: "analysis-1",
  sourceAssetId: "asset-1",
  status: "completed" as const,
  recipe: null,
  promptText: "a beautiful sunset",
  negativePromptText: "ugly",
  rawResponse: null,
  errorMessage: null,
  errorStage: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const createdTask = {
  id: "gen-task-1",
  analysisTaskId: "analysis-1",
  status: "pending" as const,
  promptSnapshot: "a beautiful sunset",
  negativePromptSnapshot: "ugly",
  params: { aspectRatio: "16:9", quality: "high" },
  modelName: "flux.2",
  resultAssetId: null,
  errorMessage: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

// ---- Tests ----

describe("POST /api/generation", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFindAnalysisTaskById.mockReset();
    mockCreateGenerationTask.mockReset();
    mockUpdateGenerationTask.mockReset();
    mockCreateAsset.mockReset();
    mockGenerateImage.mockReset();
    mockUploadBuffer.mockReset();
    mockGetPublicUrl.mockReset();
    mockFetch.mockReset();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. P0: 正常创建生成任务
  it("正常创建生成任务应返回 201 和 { id, status: pending }", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    // 让后台任务不执行，避免干扰
    mockGenerateImage.mockReturnValueOnce(new Promise(() => {}));

    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ id: "gen-task-1", status: "pending" });
  });

  // 2. P0: 缺少 analysisTaskId
  it("缺少 analysisTaskId 应返回 400", async () => {
    const body = { ...validBody, analysisTaskId: undefined };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 3. P0: 缺少 promptText
  it("缺少 promptText 应返回 400", async () => {
    const body = { ...validBody, promptText: undefined };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 4. P0: promptText 为空字符串
  it("promptText 为空字符串应返回 400", async () => {
    const body = { ...validBody, promptText: "" };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 5. P1: negativePromptText 非字符串
  it("negativePromptText 非字符串应返回 400", async () => {
    const body = { ...validBody, negativePromptText: 123 };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 6. P0: negativePromptText 允许空字符串
  it("negativePromptText 允许空字符串", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockGenerateImage.mockReturnValueOnce(new Promise(() => {}));

    const body = { ...validBody, negativePromptText: "" };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(201);
  });

  // 7. P0: 缺少 params 对象
  it("缺少 params 对象应返回 400", async () => {
    const body = { ...validBody, params: undefined };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 8. P0: params 缺少 aspectRatio
  it("params 缺少 aspectRatio 应返回 400", async () => {
    const body = {
      ...validBody,
      params: { quality: "high" },
    };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 9. P0: params 缺少 quality
  it("params 缺少 quality 应返回 400", async () => {
    const body = {
      ...validBody,
      params: { aspectRatio: "16:9" },
    };
    const res = await POST(createRequest(body));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  // 10. P0: analysisTaskId 不存在 -> 404
  it("analysisTaskId 不存在应返回 404 NOT_FOUND", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(null);

    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  // 11. P0: 分析任务未完成 -> 400
  it("分析任务未完成应返回 400", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce({
      ...completedAnalysisTask,
      status: "processing",
    });

    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("not completed");
  });

  // 12. P0: 创建任务 modelName 为 "flux.2"
  it("创建任务时 modelName 应为 flux.2", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockGenerateImage.mockReturnValueOnce(new Promise(() => {}));

    await POST(createRequest(validBody));

    expect(mockCreateGenerationTask).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: "flux.2",
      })
    );
  });

  // 13. P0: fire-and-forget 不阻塞响应
  it("fire-and-forget 不阻塞响应，POST 立即返回 201", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);

    // generateImage 永远不 resolve，模拟长时间运行
    let resolveGenerate: (v: unknown) => void;
    mockGenerateImage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      })
    );

    const res = await POST(createRequest(validBody));

    // 即使 generateImage 未完成，POST 也应立即返回 201
    expect(res.status).toBe(201);

    // 清理: resolve 以避免 hanging promise
    resolveGenerate!({
      imageUrl: "https://fal.ai/tmp/result.webp",
      width: 1024,
      height: 1024,
    });
  });

  // 14. P0: 后台生成成功 -> completed
  it("后台生成成功应更新任务为 completed", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockUpdateGenerationTask.mockResolvedValue(createdTask);
    mockGenerateImage.mockResolvedValueOnce({
      imageUrl: "https://fal.ai/tmp/result.webp",
      width: 1024,
      height: 1024,
    });

    // Mock fetch for downloading the temp image
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    mockUploadBuffer.mockResolvedValueOnce(undefined);
    mockGetPublicUrl.mockReturnValueOnce(
      "https://r2.example.com/generated/gen-task-1/result.webp"
    );
    mockCreateAsset.mockResolvedValueOnce({
      id: "asset-gen-1",
      type: "generated",
      fileUrl: "https://r2.example.com/generated/gen-task-1/result.webp",
      thumbnailUrl: null,
      width: 1024,
      height: 1024,
      mimeType: "image/webp",
      createdAt: new Date("2025-01-01"),
    });

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(201);

    // 等待后台任务完成
    await vi.waitFor(() => {
      expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
        status: "completed",
        resultAssetId: "asset-gen-1",
      });
    });
  });

  // 15. P0: 后台生成失败 -> failed
  it("后台生成失败应更新任务为 failed", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockUpdateGenerationTask.mockResolvedValue(createdTask);
    mockGenerateImage.mockRejectedValueOnce(new Error("model crashed"));

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(201);

    // 等待后台 catch 执行
    await vi.waitFor(() => {
      expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
        status: "failed",
        errorMessage: "model crashed",
      });
    });
  });

  // 16. P0: 后台图片下载失败 (fetch non-200)
  it("后台图片下载失败应更新任务为 failed", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockUpdateGenerationTask.mockResolvedValue(createdTask);
    mockGenerateImage.mockResolvedValueOnce({
      imageUrl: "https://fal.ai/tmp/result.webp",
      width: 1024,
      height: 1024,
    });

    // fetch 返回非 200
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(201);

    await vi.waitFor(() => {
      expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
        status: "failed",
        errorMessage: expect.stringContaining("Failed to download generated image"),
      });
    });
  });

  // 17. P0: 后台转存 R2 (uploadBuffer called with correct key)
  it("后台应调用 uploadBuffer 转存到 R2", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockUpdateGenerationTask.mockResolvedValue(createdTask);
    mockGenerateImage.mockResolvedValueOnce({
      imageUrl: "https://fal.ai/tmp/result.webp",
      width: 1024,
      height: 1024,
    });

    const fakeBuffer = new ArrayBuffer(64);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeBuffer),
    });

    mockUploadBuffer.mockResolvedValueOnce(undefined);
    mockGetPublicUrl.mockReturnValueOnce(
      "https://r2.example.com/generated/gen-task-1/result.webp"
    );
    mockCreateAsset.mockResolvedValueOnce({
      id: "asset-gen-1",
      type: "generated",
      fileUrl: "https://r2.example.com/generated/gen-task-1/result.webp",
      thumbnailUrl: null,
      width: 1024,
      height: 1024,
      mimeType: "image/webp",
      createdAt: new Date("2025-01-01"),
    });

    await POST(createRequest(validBody));

    await vi.waitFor(() => {
      expect(mockUploadBuffer).toHaveBeenCalledWith(
        "generated/gen-task-1/result.webp",
        expect.any(Buffer),
        "image/webp"
      );
    });
  });

  // 18. P0: 后台创建 Asset 记录 (type: "generated")
  it("后台应创建 type 为 generated 的 Asset 记录", async () => {
    mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
    mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
    mockUpdateGenerationTask.mockResolvedValue(createdTask);
    mockGenerateImage.mockResolvedValueOnce({
      imageUrl: "https://fal.ai/tmp/result.webp",
      width: 1024,
      height: 1024,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
    });

    mockUploadBuffer.mockResolvedValueOnce(undefined);
    mockGetPublicUrl.mockReturnValueOnce(
      "https://r2.example.com/generated/gen-task-1/result.webp"
    );
    mockCreateAsset.mockResolvedValueOnce({
      id: "asset-gen-1",
      type: "generated",
      fileUrl: "https://r2.example.com/generated/gen-task-1/result.webp",
      thumbnailUrl: null,
      width: 1024,
      height: 1024,
      mimeType: "image/webp",
      createdAt: new Date("2025-01-01"),
    });

    await POST(createRequest(validBody));

    await vi.waitFor(() => {
      expect(mockCreateAsset).toHaveBeenCalledWith({
        type: "generated",
        fileUrl: "https://r2.example.com/generated/gen-task-1/result.webp",
        thumbnailUrl: null,
        width: 1024,
        height: 1024,
        mimeType: "image/webp",
      });
    });
  });

  // 19. P1: request.json() 失败 -> 500
  it("request.json() 失败应返回 500 SERVICE_UNAVAILABLE", async () => {
    const badRequest = new NextRequest("http://localhost:3000/api/generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json{{{",
    });

    const res = await POST(badRequest);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("SERVICE_UNAVAILABLE");
  });
});
