import { POST } from "../route";
import { NextRequest } from "next/server";
import type { AnalysisTask, Asset } from "@/types/models";
import { StructurerError } from "@/lib/ai/structurer";

// ---- Mocks ----

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockUpsertAsset = vi.fn();
const mockFindAssetByIdForUser = vi.fn();
vi.mock("@/lib/repositories/asset-repository", () => ({
  upsertAsset: (...args: unknown[]) => mockUpsertAsset(...args),
  findAssetByIdForUser: (...args: unknown[]) => mockFindAssetByIdForUser(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_CONFIGS: {
    upload: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
    analysis: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
    generation: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
    templateWrite: { windowMs: 60 * 60 * 1000, maxRequests: 30 },
  },
}));

const mockCreateAnalysisTask = vi.fn();
const mockUpdateAnalysisTask = vi.fn();
const mockFindAnalysisTaskByIdInternal = vi.fn();
vi.mock("@/lib/repositories/analysis-task-repository", () => ({
  createAnalysisTask: (...args: unknown[]) => mockCreateAnalysisTask(...args),
  updateAnalysisTask: (...args: unknown[]) => mockUpdateAnalysisTask(...args),
  findAnalysisTaskByIdInternal: (...args: unknown[]) => mockFindAnalysisTaskByIdInternal(...args),
}));

const mockStructureAnalysis = vi.fn();
vi.mock("@/lib/ai/structurer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/structurer")>();
  return {
    ...actual,
    structureAnalysis: (...args: unknown[]) => mockStructureAnalysis(...args),
  };
});

// Mock VisionProvider
const mockVisionProvider = {
  name: 'gemini' as const,
  analyze: vi.fn(),
};

vi.mock("@/lib/ai/providers", () => ({
  getVisionProvider: () => mockVisionProvider,
}));

// ---- Helpers ----

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  assetId: "asset-1",
  fileUrl: "https://example.com/image.jpg",
  width: 800,
  height: 600,
  mimeType: "image/jpeg",
};

const ASSET: Asset = {
  id: "asset-1",
  type: "reference",
  fileUrl: "https://example.com/image.jpg",
  thumbnailUrl: null,
  width: 800,
  height: 600,
  mimeType: "image/jpeg",
  userId: "user-1",
  createdAt: new Date("2025-01-01"),
};

// ─── plan-03: 已归属当前用户的生成 Asset（ADR-6 结果作为新参考） ──────────

const GENERATED_ASSET: Asset = {
  id: "asset-gen-1",
  type: "generated",
  fileUrl: "https://r2.example.com/generated/gen-1/result.webp",
  thumbnailUrl: null,
  width: 1024,
  height: 576,
  mimeType: "image/webp",
  userId: "user-1",
  createdAt: new Date("2025-01-01"),
};

function makePendingTask(overrides: Partial<AnalysisTask> = {}): AnalysisTask {
  return {
    id: "task-1",
    sourceAssetId: "asset-1",
    status: "pending",
    recipe: null,
    promptText: null,
    negativePromptText: null,
    rawResponse: null,
    errorMessage: null,
    errorStage: null,
    analysisTemplateContent: null,
    analysisTemplateVariables: [],
    analysisTemplateStatus: null,
    analysisTemplateReason: null,
    provider: "gemini",
    externalId: null,
    modelName: "gemini-2.5-flash",
    userId: "user-1",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

const VALID_RECIPE = {
  imageSummary: "A serene landscape",
  subject: "Mountain range",
  scene: "Alpine meadow",
  composition: "Rule of thirds",
  cameraLanguage: "Wide angle",
  lighting: "Golden hour",
  color: "Warm palette",
  texture: "Soft, natural",
  styleTags: ["landscape"],
  mood: "Peaceful",
  visualKeywords: ["mountain"],
  mustKeep: ["golden light"],
  replaceable: ["specific flowers"],
};

/** 设置默认的成功 mock 行为 */
function setupSuccessMocks() {
  // auth
  mockAuth.mockResolvedValue({ user: { id: "user-1" } });

  // upsertAsset
  mockUpsertAsset.mockResolvedValue(ASSET);

  // 创建任务 (pending)
  mockCreateAnalysisTask.mockResolvedValue(makePendingTask());

  // 更新任务 (各阶段)
  mockUpdateAnalysisTask.mockImplementation(
    (id: string, updates: Partial<AnalysisTask>) =>
      Promise.resolve(makePendingTask({ id, ...updates }))
  );

  // Vision Provider - 同步模式（Gemini）
  mockVisionProvider.analyze.mockResolvedValue({
    mode: 'sync',
    result: "Raw visual analysis text",
  });

  // 结构化分析
  mockStructureAnalysis.mockResolvedValue({
    recipe: VALID_RECIPE,
    promptText: "Create Mountain range with Golden hour.",
    negativePromptText: "blurry, low quality",
    analysisTemplateContent: "Create {{subject}} with {{lighting}}.",
    analysisTemplateVariables: [
      { name: "subject", defaultValue: "Mountain range", label: "Subject", sourceField: "subject" },
      { name: "lighting", defaultValue: "Golden hour", label: "Lighting", sourceField: "lighting_color" },
    ],
    analysisTemplateStatus: "ready",
    analysisTemplateReason: null,
  });
}

describe("POST /api/analysis", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    setupSuccessMocks();
    // VisionProvider mock 为 gemini；让 models.json 解析结果与其一致
    process.env.VISION_PROVIDER = "gemini";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // --- 正常流程 ---

  it("正常分析流程（完整成功）", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("completed");
    expect(data.recipe).toEqual(VALID_RECIPE);
    expect(data.promptText).toBe("Create Mountain range with Golden hour.");
    expect(data.negativePromptText).toBe("blurry, low quality");
    expect(data.analysisTemplateContent).toBe("Create {{subject}} with {{lighting}}.");
    expect(data.analysisTemplateVariables).toHaveLength(2);
    expect(data.analysisTemplateStatus).toBe("ready");
  });

  // --- 请求体校验 ---

  it("缺少 assetId 时返回 400", async () => {
    const { assetId: _, ...body } = VALID_BODY;
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("INVALID_REQUEST");
  });

  it("缺少 fileUrl 时返回 400", async () => {
    const { fileUrl: _, ...body } = VALID_BODY;
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
  });

  it("width 为 0 时返回 400", async () => {
    const response = await POST(makeRequest({ ...VALID_BODY, width: 0 }));
    expect(response.status).toBe(400);
  });

  it("width 为负数时返回 400", async () => {
    const response = await POST(makeRequest({ ...VALID_BODY, width: -1 }));
    expect(response.status).toBe(400);
  });

  it("height 为非数字时返回 400", async () => {
    const response = await POST(
      makeRequest({ ...VALID_BODY, height: "abc" })
    );
    expect(response.status).toBe(400);
  });

  it("空请求体时返回 400", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  // --- 数据库记录创建 ---

  it("创建 Asset 记录", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockUpsertAsset).toHaveBeenCalledWith("user-1", "asset-1", {
      fileUrl: "https://example.com/image.jpg",
      width: 800,
      height: 600,
      mimeType: "image/jpeg",
    });
  });

  it("创建 AnalysisTask 记录", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockCreateAnalysisTask).toHaveBeenCalledWith("user-1", {
      sourceAssetId: "asset-1",
      provider: 'gemini',
      modelName: 'gemini-2.5-flash',
    });
  });

  it("状态更新为 processing", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockUpdateAnalysisTask).toHaveBeenCalledWith("task-1", {
      status: "processing",
    });
  });

  // --- 失败路径 ---

  it("Vision Understanding失败时标记 failed 且 errorStage 为 vision", async () => {
    mockVisionProvider.analyze.mockRejectedValue(
      new Error("Vision provider failed")
    );

    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Vision provider failed");

    expect(mockUpdateAnalysisTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "failed",
        errorStage: "vision",
      })
    );
  });

  it("LLM 失败时 L3 降级 (completed, recipe: null, promptText: rawAnalysis)", async () => {
    mockStructureAnalysis.mockRejectedValue(
      new StructurerError("Structurer failed")
    );

    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("completed");
    expect(data.recipe).toBeNull();
    expect(data.promptText).toBe("Raw visual analysis text");
    expect(data.errorStage).toBe("llm");

    expect(mockUpdateAnalysisTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "completed",
        recipe: null,
        promptText: "Raw visual analysis text",
        negativePromptText: "",
        analysisTemplateContent: null,
        analysisTemplateVariables: [],
        analysisTemplateStatus: "fallback",
        analysisTemplateReason: expect.any(String),
        errorStage: "llm",
      })
    );
  });

  it("L3 降级也处理非 StructurerError", async () => {
    mockStructureAnalysis.mockRejectedValue(
      new Error("Unexpected error in structurer")
    );

    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("completed");
    expect(data.recipe).toBeNull();
    expect(data.promptText).toBe("Raw visual analysis text");
    expect(data.errorStage).toBe("llm");
  });

  it("成功时保存 rawResponse", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockUpdateAnalysisTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "completed",
        rawResponse: "Raw visual analysis text",
      })
    );
  });

  // --- Replicate 异步模式 ---

  it("async 模式：返回 {id, status:'processing'}，HTTP 201", async () => {
    mockVisionProvider.analyze.mockResolvedValue({
      mode: 'async',
      externalId: 'replicate-pred-123',
    });

    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBe('task-1');
    expect(data.status).toBe('processing');
  });

  it("async 模式：保存 externalId 到任务", async () => {
    mockVisionProvider.analyze.mockResolvedValue({
      mode: 'async',
      externalId: 'replicate-pred-456',
    });

    await POST(makeRequest(VALID_BODY));

    // 应该调用 updateAnalysisTask 保存 externalId
    const externalIdCall = mockUpdateAnalysisTask.mock.calls.find(
      (call: unknown[]) => call[1]?.externalId !== undefined
    );
    expect(externalIdCall).toBeDefined();
    expect(externalIdCall![1]).toEqual(
      expect.objectContaining({ externalId: 'replicate-pred-456' })
    );
  });

  it("async 模式：传递 webhookUrl 给 Provider", async () => {
    mockVisionProvider.analyze.mockResolvedValue({
      mode: 'async',
      externalId: 'replicate-pred-789',
    });

    await POST(makeRequest(VALID_BODY));

    expect(mockVisionProvider.analyze).toHaveBeenCalledWith({
      imageUrl: VALID_BODY.fileUrl,
      mimeType: VALID_BODY.mimeType,
      webhookUrl: expect.stringContaining('api/webhooks/replicate?taskType=analysis&taskId=task-1'),
    });
  });

  it("async 模式：创建任务时 provider 为 replicate，modelName 为 gemini 模型", async () => {
    mockVisionProvider.name = 'replicate' as const;
    process.env.VISION_PROVIDER = 'replicate';
    mockVisionProvider.analyze.mockResolvedValue({
      mode: 'async',
      externalId: 'replicate-pred-abc',
    });

    try {
      await POST(makeRequest(VALID_BODY));

      expect(mockCreateAnalysisTask).toHaveBeenCalledWith('user-1', {
        sourceAssetId: 'asset-1',
        provider: 'replicate',
        modelName: 'google/gemini-2.5-flash',
      });
    } finally {
      mockVisionProvider.name = 'gemini' as const;
    }
  });

  it("async 模式：Provider 调用失败时标记任务 failed", async () => {
    mockVisionProvider.analyze.mockRejectedValue(
      new Error('Replicate API error')
    );

    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Replicate API error');

    expect(mockUpdateAnalysisTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        status: 'failed',
        errorStage: 'vision',
      })
    );
  });

  // ─── plan-03: 已有 Asset 分析分支（§4 / ADR-6 / AC-07） ─────────────────

  describe("已有 Asset 分析分支 (plan-03)", () => {
    it("sourceAssetId 模式：服务端读取归属 Asset 元数据并创建分析任务（不复制 Asset）", async () => {
      mockFindAssetByIdForUser.mockResolvedValueOnce(GENERATED_ASSET);

      const response = await POST(makeRequest({ sourceAssetId: "asset-gen-1" }));
      const data = await response.json();

      expect(mockFindAssetByIdForUser).toHaveBeenCalledWith(
        "asset-gen-1",
        "user-1"
      );
      // 不 upsert、不复制 Asset，不改类型
      expect(mockUpsertAsset).not.toHaveBeenCalled();
      expect(mockCreateAnalysisTask).toHaveBeenCalledWith("user-1", {
        sourceAssetId: "asset-gen-1",
        provider: "gemini",
        modelName: "gemini-2.5-flash",
      });
      // Vision Provider 只拿服务端派生的元数据
      expect(mockVisionProvider.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: GENERATED_ASSET.fileUrl,
          mimeType: GENERATED_ASSET.mimeType,
        })
      );
      expect(response.status).toBe(200);
      expect(data.status).toBe("completed");
    });

    it("输出 analysis_existing_asset_started 结构化日志（§8.5）", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockFindAssetByIdForUser.mockResolvedValueOnce(GENERATED_ASSET);

      await POST(makeRequest({ sourceAssetId: "asset-gen-1" }));

      const logged = logSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes("analysis_existing_asset_started"));
      expect(logged).toBeDefined();
      expect(logged).toContain('"assetId":"asset-gen-1"');

      logSpy.mockRestore();
    });

    it("非法联合（sourceAssetId 混入 fileUrl/width/height/mimeType）→ 400，不读 Asset 不调 Provider", async () => {
      const response = await POST(
        makeRequest({
          sourceAssetId: "asset-gen-1",
          fileUrl: "https://attacker.example.com/fake.jpg",
          width: 800,
          height: 600,
          mimeType: "image/jpeg",
        })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockFindAssetByIdForUser).not.toHaveBeenCalled();
      expect(mockVisionProvider.analyze).not.toHaveBeenCalled();
      expect(mockCreateAnalysisTask).not.toHaveBeenCalled();
    });

    it("sourceAssetId 不存在或不归属当前用户 → 404 稳定错误，不调 Provider 不建任务", async () => {
      mockFindAssetByIdForUser.mockResolvedValueOnce(null);

      const response = await POST(makeRequest({ sourceAssetId: "asset-other-user" }));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe("NOT_FOUND");
      expect(mockVisionProvider.analyze).not.toHaveBeenCalled();
      expect(mockCreateAnalysisTask).not.toHaveBeenCalled();
      expect(mockUpsertAsset).not.toHaveBeenCalled();
    });

    it("Asset 元数据非图片 MIME → 400 INVALID_REQUEST（防御：不进入分析管线）", async () => {
      mockFindAssetByIdForUser.mockResolvedValueOnce({
        ...GENERATED_ASSET,
        mimeType: "text/plain",
      });

      const response = await POST(makeRequest({ sourceAssetId: "asset-gen-1" }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockVisionProvider.analyze).not.toHaveBeenCalled();
    });

    it("上传模式不触发 findAssetByIdForUser（既有契约不变）", async () => {
      await POST(makeRequest(VALID_BODY));

      expect(mockFindAssetByIdForUser).not.toHaveBeenCalled();
      expect(mockUpsertAsset).toHaveBeenCalledWith("user-1", "asset-1", {
        fileUrl: "https://example.com/image.jpg",
        width: 800,
        height: 600,
        mimeType: "image/jpeg",
      });
    });
  });

  // ─── plan-03: 分析用户级限流（§8.3） ────────────────────────────────────

  describe("分析用户级限流 (plan-03 / §8.3)", () => {
    it("接入 analysis 配置：identifier 取 session userId，10 次/小时", async () => {
      mockCheckRateLimit.mockReturnValue({
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60 * 60 * 1000,
      });

      await POST(makeRequest(VALID_BODY));

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        "user-1",
        "analysis",
        expect.objectContaining({
          windowMs: 60 * 60 * 1000,
          maxRequests: 10,
        })
      );
    });

    it("超限返回 429 RATE_LIMITED，不调 Provider 不建任务", async () => {
      mockCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60 * 60 * 1000,
      });

      const response = await POST(makeRequest(VALID_BODY));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.code).toBe("RATE_LIMITED");
      expect(data.retryable).toBe(true);
      expect(mockVisionProvider.analyze).not.toHaveBeenCalled();
      expect(mockCreateAnalysisTask).not.toHaveBeenCalled();
    });
  });
});
