import { NextRequest } from "next/server";

// ---- Mocks ----

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

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

const mockGetImageGenProvider = vi.fn();
vi.mock("@/lib/ai/providers", () => ({
  getImageGenProvider: (...args: unknown[]) => mockGetImageGenProvider(...args),
}));

const mockBuildWebhookUrl = vi.fn();
const mockStartTimeoutTimer = vi.fn();
vi.mock("@/lib/ai/webhook-utils", () => ({
  buildWebhookUrl: (...args: unknown[]) => mockBuildWebhookUrl(...args),
  startTimeoutTimer: (...args: unknown[]) => mockStartTimeoutTimer(...args),
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
  userId: "user-1",
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
  provider: "fal" as const,
  externalId: null,
  resultAssetId: null,
  errorMessage: null,
  userId: "user-1",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

// Mock Provider 实现
const mockFalProvider = {
  name: "fal" as const,
  generate: vi.fn(),
};

const mockReplicateProvider = {
  name: "replicate" as const,
  generate: vi.fn(),
};

// ---- Tests ----

describe("POST /api/generation", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindAnalysisTaskById.mockReset();
    mockCreateGenerationTask.mockReset();
    mockUpdateGenerationTask.mockReset();
    mockCreateAsset.mockReset();
    mockGetImageGenProvider.mockReset();
    mockBuildWebhookUrl.mockReset();
    mockStartTimeoutTimer.mockReset();
    mockUploadBuffer.mockReset();
    mockGetPublicUrl.mockReset();
    mockFalProvider.generate.mockReset();
    mockReplicateProvider.generate.mockReset();
    mockFetch.mockReset();
    globalThis.fetch = mockFetch;

    // 默认返回 fal Provider
    mockGetImageGenProvider.mockReturnValue(mockFalProvider);
    mockBuildWebhookUrl.mockReturnValue("https://example.com/webhook");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ===== 同步模式 (fal.ai) 测试 =====

  describe("同步模式 (fal.ai)", () => {
    // 1. P0: 正常创建生成任务
    it("正常创建生成任务应返回 201 和 { id, status: processing }", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      // 让后台任务不执行，避免干扰
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json).toEqual({ id: "gen-task-1", status: "processing" });
    });

    // 2. P0: 创建任务时 modelName 为 "flux.2" (fal)
    it("创建任务时 modelName 应为 flux.2 (fal provider)", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      await POST(createRequest(validBody));

      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          modelName: "flux.2",
          provider: "fal",
        })
      );
    });

    // 3. P0: fire-and-forget 不阻塞响应
    it("fire-and-forget 不阻塞响应，POST 立即返回 201", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);

      // Provider.generate 立即返回结果，但后续处理（下载、上传）很慢
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });

      // Mock fetch 为永远不 resolve，模拟慢速下载
      let resolveFetch: (v: unknown) => void;
      mockFetch.mockReturnValueOnce(new Promise((resolve) => {
        resolveFetch = resolve;
      }));

      const res = await POST(createRequest(validBody));

      // POST 应立即返回 201，不等待下载完成
      expect(res.status).toBe(201);

      // 清理: resolve 以避免 hanging promise
      resolveFetch!({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
    });

    // 4. P0: 后台生成成功 -> completed
    it("后台生成成功应更新任务为 completed", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockUpdateGenerationTask.mockResolvedValue(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
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

    // 5. P0: 后台生成失败 -> failed
    it("后台生成失败应更新任务为 failed", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockUpdateGenerationTask.mockResolvedValue(createdTask);

      // Provider.generate 返回成功
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });

      // Mock fetch 也会失败
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const res = await POST(createRequest(validBody));
      expect(res.status).toBe(201);

      // 等待后台 catch 执行
      await vi.waitFor(() => {
        expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
          status: "failed",
          errorMessage: expect.stringContaining("Network error"),
        });
      });
    });

    // 6. P0: 后台图片下载失败
    it("后台图片下载失败应更新任务为 failed", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockUpdateGenerationTask.mockResolvedValue(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
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

    // 7. P0: 后台转存 R2
    it("后台应调用 uploadBuffer 转存到 R2", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockUpdateGenerationTask.mockResolvedValue(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
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
  });

  // ===== 异步模式 (Replicate) 测试 =====

  describe("异步模式 (Replicate)", () => {
    beforeEach(() => {
      mockGetImageGenProvider.mockReturnValue(mockReplicateProvider);
    });

    // 8. P0: 异步模式提交成功
    it("异步模式应保存 externalId 并启动超时定时器", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      const replicateTask = {
        ...createdTask,
        provider: "replicate" as const,
        modelName: "black-forest-labs/flux-2-dev",
      };
      mockCreateGenerationTask.mockResolvedValueOnce(replicateTask);
      mockUpdateGenerationTask.mockResolvedValue(replicateTask);
      mockReplicateProvider.generate.mockResolvedValueOnce({
        mode: "async" as const,
        externalId: "replicate-pred-123",
      });

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json).toEqual({ id: "gen-task-1", status: "processing" });

      // 验证保存了 externalId
      expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
        externalId: "replicate-pred-123",
      });

      // 验证启动了超时定时器
      expect(mockStartTimeoutTimer).toHaveBeenCalledWith(
        "gen-task-1",
        "generation",
        5 * 60 * 1000
      );
    });

    // 9. P0: 创建任务时 modelName 为 Replicate 模型名
    it("创建任务时 modelName 应为 black-forest-labs/flux-2-dev (Replicate)", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      const replicateTask = {
        ...createdTask,
        provider: "replicate" as const,
        modelName: "black-forest-labs/flux-2-dev",
      };
      mockCreateGenerationTask.mockResolvedValueOnce(replicateTask);
      mockUpdateGenerationTask.mockResolvedValue(replicateTask);
      mockReplicateProvider.generate.mockResolvedValueOnce({
        mode: "async" as const,
        externalId: "replicate-pred-123",
      });

      await POST(createRequest(validBody));

      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          modelName: "black-forest-labs/flux-2-dev",
          provider: "replicate",
        })
      );
    });

    // 10. P0: 异步模式立即返回
    it("异步模式应立即返回 201，不等待生成完成", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      const replicateTask = {
        ...createdTask,
        provider: "replicate" as const,
        modelName: "black-forest-labs/flux-2-dev",
      };
      mockCreateGenerationTask.mockResolvedValueOnce(replicateTask);
      mockUpdateGenerationTask.mockResolvedValue(replicateTask);

      // Provider.generate 立即返回 externalId
      mockReplicateProvider.generate.mockResolvedValueOnce({
        mode: "async" as const,
        externalId: "replicate-pred-123",
      });

      const res = await POST(createRequest(validBody));

      // POST 应立即返回 201
      expect(res.status).toBe(201);
    });

    // 11. P0: 异步模式调用 Provider 传入 webhookUrl
    it("异步模式应调用 Provider.generate 并传入 webhookUrl", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      const replicateTask = {
        ...createdTask,
        provider: "replicate" as const,
        modelName: "black-forest-labs/flux-2-dev",
      };
      mockCreateGenerationTask.mockResolvedValueOnce(replicateTask);
      mockUpdateGenerationTask.mockResolvedValue(replicateTask);
      mockBuildWebhookUrl.mockReturnValue("https://example.com/webhook?taskType=generation&taskId=gen-task-1");
      mockReplicateProvider.generate.mockResolvedValueOnce({
        mode: "async" as const,
        externalId: "replicate-pred-123",
      });

      await POST(createRequest(validBody));

      expect(mockReplicateProvider.generate).toHaveBeenCalledWith({
        prompt: "a beautiful sunset",
        negativePrompt: "ugly",
        aspectRatio: "16:9",
        quality: "high",
        webhookUrl: "https://example.com/webhook?taskType=generation&taskId=gen-task-1",
      });
    });

    // 12. P0: 异步模式 Provider 失败
    it("异步模式 Provider 失败应返回 500", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      const replicateTask = {
        ...createdTask,
        provider: "replicate" as const,
        modelName: "black-forest-labs/flux-2-dev",
      };
      mockCreateGenerationTask.mockResolvedValueOnce(replicateTask);
      mockReplicateProvider.generate.mockRejectedValueOnce(new Error("Replicate API error"));

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.code).toBe("SERVICE_UNAVAILABLE");
      expect(json.error).toContain("Replicate API error");
    });
  });

  // ===== 通用验证测试 =====

  describe("通用验证 (sync/async 共享)", () => {
    // 13. P0: 缺少 analysisTaskId
    it("缺少 analysisTaskId 应返回 400", async () => {
      const body = { ...validBody, analysisTaskId: undefined };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    // 14. P0: 缺少 promptText
    it("缺少 promptText 应返回 400", async () => {
      const body = { ...validBody, promptText: undefined };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    // 15. P0: promptText 为空字符串
    it("promptText 为空字符串应返回 400", async () => {
      const body = { ...validBody, promptText: "" };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    // 16. P1: negativePromptText 非字符串
    it("negativePromptText 非字符串应返回 400", async () => {
      const body = { ...validBody, negativePromptText: 123 };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    // 17. P0: negativePromptText 允许空字符串
    it("negativePromptText 允许空字符串", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const body = { ...validBody, negativePromptText: "" };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(201);
    });

    // 18. P0: 缺少 params 对象
    it("缺少 params 对象应返回 400", async () => {
      const body = { ...validBody, params: undefined };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
    });

    // 19. P0: params 缺少 aspectRatio
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

    // 20. P0: params 缺少 quality
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

    // 21. P0: analysisTaskId 不存在 -> 404
    it("analysisTaskId 不存在应返回 404 NOT_FOUND", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(null);

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.code).toBe("NOT_FOUND");
    });

    // 22. P0: 分析任务未完成 -> 400
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

    // 23. P1: request.json() 失败 -> 500
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
});
