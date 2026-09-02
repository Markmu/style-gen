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
const mockListCompleted = vi.fn();
const mockListIterations = vi.fn();
const mockGetDirectionIterationFeed = vi.fn();
vi.mock("@/lib/repositories/generation-task-repository", () => ({
  createGenerationTask: (...args: unknown[]) => mockCreateGenerationTask(...args),
  updateGenerationTask: (...args: unknown[]) => mockUpdateGenerationTask(...args),
  listCompleted: (...args: unknown[]) => mockListCompleted(...args),
  listIterations: (...args: unknown[]) => mockListIterations(...args),
  getDirectionIterationFeed: (...args: unknown[]) => mockGetDirectionIterationFeed(...args),
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

const mockFindTemplateById = vi.fn();
vi.mock("@/lib/repositories/template-repository", () => ({
  findById: (...args: unknown[]) => mockFindTemplateById(...args),
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

import { GET, POST } from "../route";

// ---- Helpers ----

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createGetRequest(url = "http://localhost:3000/api/generation?pageSize=20"): NextRequest {
  return new NextRequest(url, { method: "GET" });
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
  recipe: { imageSummary: "Glass flower study" },
  promptText: "a beautiful sunset",
  negativePromptText: "ugly",
  rawResponse: null,
  errorMessage: null,
  errorStage: null,
  userId: "user-1",
  analysisTemplateVariables: [{ name: "subject", defaultValue: "Glass flower" }],
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const ownedTemplate = {
  id: "template-1",
  name: "Glass Study",
  content: "Create {{subject}}",
  variables: [],
  sourceAssetId: null,
  sourceImageUrl: null,
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
  modelName: "fal-ai/flux-2",
  provider: "fal" as const,
  externalId: null,
  resultAssetId: null,
  errorMessage: null,
  userId: "user-1",
  recipeSnapshot: completedAnalysisTask.recipe,
  variablesSnapshot: completedAnalysisTask.analysisTemplateVariables,
  sourceTemplateId: null,
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

const mockGeminiProvider = {
  name: "gemini" as const,
  generate: vi.fn(),
};

// ─── plan-03 fixtures：V2 Recipe 分析任务与合法 Prompt 控制快照 ────────────

const v2RecipeAnalysisTask = {
  ...completedAnalysisTask,
  recipe: {
    schemaVersion: 2,
    extractionStatus: "ready",
    extractionReasons: [],
    contentDescription: {
      summary: "Glass flower study",
      subjectAttributes: [],
      supportingElements: [],
    },
    styleProfile: {},
    styleInvariants: [
      {
        id: "inv_color_1",
        value: "cool blue palette",
        evidence: ["img-01"],
        confidence: 0.9,
        kind: "hard",
        dimension: "color",
        sourceObservationIds: [],
      },
      {
        id: "inv_camera_1",
        value: "macro lens",
        evidence: ["img-02"],
        confidence: 0.8,
        kind: "soft",
        dimension: "camera",
        sourceObservationIds: [],
      },
    ],
    contentVariables: [
      {
        name: "subject",
        label: "Subject",
        defaultValue: "Glass flower",
        sourceField: "subject",
      },
    ],
    optionalModifiers: [],
    negativeConstraints: [],
    styleFingerprint: { tokens: [], scores: {} },
    promptOutputs: {
      reconstructionPrompt: "reconstruct",
      conciseTemplate: "concise",
      standardTemplate: "standard",
      professionalTemplate: "professional",
    },
  },
};

const validPromptControlSnapshot = {
  schemaVersion: 1,
  trigger: "quick_recreate" as const,
  intent: "reconstruction" as const,
  detailLevel: "standard" as const,
  editorMode: "variables" as const,
  customPromptDirty: false,
  enabledInvariantIds: ["inv_color_1", "inv_camera_1"],
  variableValues: { subject: "Crystal peony" },
  enabledModifierNames: [] as string[],
  modifierValues: {} as Record<string, string>,
  adjustments: [
    { invariantId: "inv_color_1", action: "strengthen" as const },
  ],
};

/** 快照变体构造器 */
function snapshotWith(
  overrides: Record<string, unknown>
): typeof validPromptControlSnapshot {
  return { ...validPromptControlSnapshot, ...overrides };
}

/** 刷新微任务队列（fake-timer 场景下不推进任何定时器） */
async function flushMicrotasks(times = 30): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

// ---- Tests ----

describe("GET /api/generation", () => {
  const sampleIterationItem = {
    id: "gen-history-1",
    status: "completed" as const,
    promptSummary: "a beautiful sunset",
    resultFileUrl: "https://cdn.example.com/result.webp",
    params: { aspectRatio: "16:9", quality: "high" },
    createdAt: new Date("2026-05-11T05:00:00.000Z"),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockListIterations.mockReset();
  });

  it("返回当前用户的迭代列表（条目为既有字段超集）", async () => {
    mockListIterations.mockResolvedValueOnce({
      items: [sampleIterationItem],
      nextCursor: "2026-05-11T05:00:00.000Z::gen-history-1",
    });

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      items: [
        {
          id: "gen-history-1",
          status: "completed",
          promptSummary: "a beautiful sunset",
          resultFileUrl: "https://cdn.example.com/result.webp",
          params: { aspectRatio: "16:9", quality: "high" },
          createdAt: "2026-05-11T05:00:00.000Z",
        },
      ],
      nextCursor: "2026-05-11T05:00:00.000Z::gen-history-1",
    });
  });

  it("无 status 参数默认 completed（近期迭代条 useHistoryList 兼容）", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=20"));

    expect(mockListIterations).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", status: "completed" })
    );
  });

  it("status=all / processing / completed / failed 白名单值透传给仓库", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?status=all"));
    await GET(createGetRequest("http://localhost:3000/api/generation?status=processing"));
    await GET(createGetRequest("http://localhost:3000/api/generation?status=failed"));
    await GET(createGetRequest("http://localhost:3000/api/generation?status=completed"));

    expect(mockListIterations).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "all" })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "processing" })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ status: "failed" })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ status: "completed" })
    );
  });

  it("非法 status 值返回 400 INVALID_REQUEST 且不查询仓库", async () => {
    const res = await GET(
      createGetRequest("http://localhost:3000/api/generation?status=done")
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("q trim 后透传，可与 status 组合生效", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(
      createGetRequest(
        "http://localhost:3000/api/generation?q=%20sunset%20&status=all"
      )
    );

    expect(mockListIterations).toHaveBeenCalledWith(
      expect.objectContaining({ q: "sunset", status: "all" })
    );
  });

  it("q trim 后超过 100 字符返回 400，不做静默截断", async () => {
    const longQ = "x".repeat(101);

    const res = await GET(
      createGetRequest(`http://localhost:3000/api/generation?q=${longQ}`)
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("q trim 后恰好 100 字符可接受", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    const q = "x".repeat(100);
    const res = await GET(
      createGetRequest(`http://localhost:3000/api/generation?q=%20${q}%20`)
    );

    expect(res.status).toBe(200);
    expect(mockListIterations).toHaveBeenCalledWith(
      expect.objectContaining({ q })
    );
  });

  it("q 为空串或纯空白视为无搜索条件", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?q="));
    await GET(createGetRequest("http://localhost:3000/api/generation?q=%20%20"));

    expect(mockListIterations).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ q: undefined })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ q: undefined })
    );
  });

  it("未Log in时返回 401 且不查询列表", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual(
      expect.objectContaining({ code: "UNAUTHORIZED", retryable: false })
    );
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("pageSize 会限制在 1 到 50 之间", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=100"));
    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=0"));
    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=abc"));
    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=1.5"));

    expect(mockListIterations).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pageSize: 50 })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageSize: 1 })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ pageSize: 20 })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ pageSize: 1 })
    );
  });

  it("成功路径输出 iteration_list_queried 结构化日志", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockListIterations.mockResolvedValueOnce({ items: [sampleIterationItem], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?status=all&q=sun"));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("iteration_list_queried")
    );

    logSpy.mockRestore();
  });

  it("查询异常时打印结构化错误日志", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListIterations.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5433"));

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("SERVICE_UNAVAILABLE");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("generation_history_list_failed")
    );

    errorSpy.mockRestore();
  });
});

// ─── plan-03: GET ?view=direction 方向分组 feed（§3 / AC-04） ─────────────

describe("GET /api/generation?view=direction (plan-03)", () => {
  function directionItem(overrides: Record<string, unknown> = {}) {
    return {
      id: "gen-dir-1",
      status: "completed" as const,
      promptSummary: "a beautiful sunset",
      resultFileUrl: "https://cdn.example.com/result.webp",
      params: { aspectRatio: "16:9", quality: "high" },
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      resultAssetId: "asset-dir-1",
      errorMessage: null,
      ...overrides,
    };
  }

  function createDirectionRequest(query: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/generation?${query}`, {
      method: "GET",
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetDirectionIterationFeed.mockReset();
    // plan-03 implementer 修复测试 fixture：vi.restoreAllMocks() 不清除 vi.fn() 的调用记录，
    // 上一 describe 末次 listIterations 调用会泄漏进本 describe 的 not.toHaveBeenCalled() 断言；
    // reset 仅隔离跨 describe 状态，不改变任何断言语义。
    mockListIterations.mockReset();
  });

  it("返回 completed/active/latestFailure 分组 feed（DirectionIterationFeed DTO）", async () => {
    mockGetDirectionIterationFeed.mockResolvedValueOnce({
      completed: [
        directionItem(),
        directionItem({
          id: "gen-dir-2",
          resultAssetId: "asset-dir-2",
          createdAt: new Date("2026-08-31T00:00:00.000Z"),
        }),
      ],
      active: directionItem({
        id: "gen-dir-active",
        status: "processing",
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: directionItem({
        id: "gen-dir-failed",
        status: "failed",
        resultFileUrl: null,
        resultAssetId: null,
        errorMessage: "provider timeout",
      }),
    });

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1&pageSize=5")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetDirectionIterationFeed).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      5
    );
    expect(mockListIterations).not.toHaveBeenCalled();
    expect(json.completed).toEqual([
      {
        id: "gen-dir-1",
        status: "completed",
        promptSummary: "a beautiful sunset",
        resultFileUrl: "https://cdn.example.com/result.webp",
        params: { aspectRatio: "16:9", quality: "high" },
        createdAt: "2026-09-01T00:00:00.000Z",
        resultAssetId: "asset-dir-1",
        errorMessage: null,
      },
      {
        id: "gen-dir-2",
        status: "completed",
        promptSummary: "a beautiful sunset",
        resultFileUrl: "https://cdn.example.com/result.webp",
        params: { aspectRatio: "16:9", quality: "high" },
        createdAt: "2026-08-31T00:00:00.000Z",
        resultAssetId: "asset-dir-2",
        errorMessage: null,
      },
    ]);
    expect(json.active).toEqual(
      expect.objectContaining({ id: "gen-dir-active", status: "processing" })
    );
    expect(json.latestFailure).toEqual(
      expect.objectContaining({
        id: "gen-dir-failed",
        status: "failed",
        errorMessage: "provider timeout",
      })
    );
  });

  it("无进行中/失败任务时 active 与 latestFailure 返回 null", async () => {
    mockGetDirectionIterationFeed.mockResolvedValueOnce({
      completed: [directionItem()],
      active: null,
      latestFailure: null,
    });

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.active).toBeNull();
    expect(json.latestFailure).toBeNull();
    // pageSize 缺省为 5
    expect(mockGetDirectionIterationFeed).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      5
    );
  });

  it("缺少 analysisTaskId 返回 400 INVALID_REQUEST 且不查询方向 feed", async () => {
    const res = await GET(createDirectionRequest("view=direction"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("方向 pageSize 仅允许 1-5：0 与 6 均返回 400", async () => {
    const zero = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1&pageSize=0")
    );
    expect(zero.status).toBe(400);
    expect((await zero.json()).code).toBe("INVALID_REQUEST");

    const six = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1&pageSize=6")
    );
    expect(six.status).toBe(400);
    expect((await six.json()).code).toBe("INVALID_REQUEST");

    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
  });

  it("view 为未知值时返回 400（枚举白名单，不静默回退普通列表）", async () => {
    const res = await GET(createDirectionRequest("view=other"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("成功路径输出 direction_iterations_queried（duration/completedCount/hasActive/hasLatestFailure）", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockGetDirectionIterationFeed.mockResolvedValueOnce({
      completed: [directionItem()],
      active: directionItem({
        id: "gen-dir-active",
        status: "processing",
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: null,
    });

    await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );

    const logged = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("direction_iterations_queried"));
    expect(logged).toBeDefined();
    expect(logged).toContain('"completedCount":1');
    expect(logged).toContain('"hasActive":true');
    expect(logged).toContain('"hasLatestFailure":false');
    expect(logged).toContain('"duration"');

    logSpy.mockRestore();
  });

  it("未登录返回 401 且不查询方向 feed", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual(
      expect.objectContaining({ code: "UNAUTHORIZED", retryable: false })
    );
    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
  });

  it("方向查询异常返回 500 SERVICE_UNAVAILABLE（可重试）", async () => {
    mockGetDirectionIterationFeed.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 127.0.0.1:5433")
    );

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("SERVICE_UNAVAILABLE");
    expect(json.retryable).toBe(true);
  });
});

describe("POST /api/generation", () => {
  const originalFetch = globalThis.fetch;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // 模型解析默认不受环境影响；各 provider 子套件按需覆盖
    delete process.env.IMAGE_GEN_PROVIDER;
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindAnalysisTaskById.mockReset();
    mockCreateGenerationTask.mockReset();
    mockUpdateGenerationTask.mockReset();
    mockListCompleted.mockReset();
    mockListIterations.mockReset();
    mockFindTemplateById.mockReset();
    mockCreateAsset.mockReset();
    mockGetImageGenProvider.mockReset();
    mockBuildWebhookUrl.mockReset();
    mockStartTimeoutTimer.mockReset();
    mockUploadBuffer.mockReset();
    mockGetPublicUrl.mockReset();
    mockFalProvider.generate.mockReset();
    mockReplicateProvider.generate.mockReset();
    mockGeminiProvider.generate.mockReset();
    mockFetch.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 19,
      resetAt: Date.now() + 60 * 60 * 1000,
    });
    mockGetDirectionIterationFeed.mockReset();
    globalThis.fetch = mockFetch;

    // 默认返回 fal Provider
    mockGetImageGenProvider.mockReturnValue(mockFalProvider);
    mockBuildWebhookUrl.mockReturnValue("https://example.com/webhook");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...ORIGINAL_ENV };
  });

  // ===== 同步模式 (fal.ai) 测试 =====

  describe("同步模式 (fal.ai)", () => {
    beforeEach(() => {
      process.env.IMAGE_GEN_PROVIDER = "fal";
    });

    // 1. P0: 正常创建Generation Task
    it("正常创建Generation Task应返回 201 和 { id, status: processing }", async () => {
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

    // 2. P0: 创建任务时 modelName 为 models.json 中 fal 绑定的模型名
    it("创建任务时 modelName 应为 fal-ai/flux-2 (fal provider)", async () => {
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
          modelName: "fal-ai/flux-2",
          provider: "fal",
        })
      );
    });

    // 3. P0: fire-and-forget 不阻塞响应
    it("fire-and-forget 不阻塞响应，POST 立即返回 201", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);

      // Provider.generate 立即返回结果，但后续处理（Download、上传）很慢
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });

      // Mock fetch 为永远不 resolve，模拟慢速Download
      let resolveFetch: (v: unknown) => void;
      mockFetch.mockReturnValueOnce(new Promise((resolve) => {
        resolveFetch = resolve;
      }));

      const res = await POST(createRequest(validBody));

      // POST 应立即返回 201，不等待DownloadDone
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

      // 等待后台任务Done
      await vi.waitFor(() => {
        expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
          status: "completed",
          resultAssetId: "asset-gen-1",
        });
      });
    });

    // 5. P0: 后台Generation Failed -> failed
    it("后台Generation Failed应更新任务为 failed", async () => {
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

    // 6. P0: 后台图片Download失败
    it("后台图片Download失败应更新任务为 failed", async () => {
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

  // ===== 同步模式 (Gemini / Nano Banana 2) 测试 =====

  describe("同步模式 (Gemini)", () => {
    beforeEach(() => {
      process.env.IMAGE_GEN_PROVIDER = "gemini";
      mockGetImageGenProvider.mockReturnValue(mockGeminiProvider);
    });

    /** 构造带 IHDR 宽高的 PNG 头部 base64 */
    function pngHeaderBase64(width: number, height: number): string {
      const header = Buffer.alloc(24);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
      header.writeUInt32BE(13, 8);
      header.write("IHDR", 12, "ascii");
      header.writeUInt32BE(width, 16);
      header.writeUInt32BE(height, 20);
      return header.toString("base64");
    }

    it("创建任务时 modelName 应为 gemini-3.1-flash-lite-image 且返回 201", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockGeminiProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageBase64: pngHeaderBase64(1024, 576),
        mimeType: "image/png",
        width: 1024,
        height: 576,
      });

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json).toEqual({ id: "gen-task-1", status: "processing" });
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          modelName: "gemini-3.1-flash-lite-image",
          provider: "gemini",
        })
      );
    });

    it("内联 base64 不经 fetch 直接转存 R2 并标记 completed", async () => {
      const imageBase64 = pngHeaderBase64(1024, 576);
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockUpdateGenerationTask.mockResolvedValue(createdTask);
      mockGeminiProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageBase64,
        mimeType: "image/png",
        width: 1024,
        height: 576,
      });

      mockUploadBuffer.mockResolvedValueOnce(undefined);
      mockGetPublicUrl.mockReturnValueOnce(
        "https://r2.example.com/generated/gen-task-1/result.png"
      );
      mockCreateAsset.mockResolvedValueOnce({
        id: "asset-gen-1",
        type: "generated",
        fileUrl: "https://r2.example.com/generated/gen-task-1/result.png",
        thumbnailUrl: null,
        width: 1024,
        height: 576,
        mimeType: "image/png",
        createdAt: new Date("2025-01-01"),
      });

      const res = await POST(createRequest(validBody));
      expect(res.status).toBe(201);

      await vi.waitFor(() => {
        expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
          status: "completed",
          resultAssetId: "asset-gen-1",
        });
      });

      // 内联图片不应触发远程下载
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUploadBuffer).toHaveBeenCalledWith(
        "generated/gen-task-1/result.png",
        Buffer.from(imageBase64, "base64"),
        "image/png"
      );
      expect(mockCreateAsset).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          mimeType: "image/png",
          width: 1024,
          height: 576,
        })
      );
    });

    it("Provider 调用失败应返回 500（与异步模式 Provider 失败行为一致）", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockGeminiProvider.generate.mockRejectedValueOnce(
        new Error("GEMINI_API_KEY is not configured")
      );

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.code).toBe("SERVICE_UNAVAILABLE");
      expect(json.error).toContain("GEMINI_API_KEY is not configured");
    });
  });

  // ===== 异步模式 (Replicate) 测试 =====

  describe("异步模式 (Replicate)", () => {
    beforeEach(() => {
      process.env.IMAGE_GEN_PROVIDER = "replicate";
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
    it("异步模式应立即返回 201，不等待Generation Complete", async () => {
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

  // ===== 模型选择 (params.model → models.json 解析) 测试 =====

  describe("模型选择 (params.model)", () => {
    it("请求携带 model 时按该模型的默认绑定落库并传给工厂", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockGeminiProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageBase64: "aGVsbG8=",
        mimeType: "image/png",
        width: 1024,
        height: 576,
      });
      mockGetImageGenProvider.mockReturnValue(mockGeminiProvider);

      const body = {
        ...validBody,
        params: { ...validBody.params, model: "nano-banana-2-lite" },
      };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(201);
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          modelName: "gemini-3.1-flash-lite-image",
          provider: "gemini",
          params: expect.objectContaining({ model: "nano-banana-2-lite" }),
        })
      );
      expect(mockGetImageGenProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: "nano-banana-2-lite",
          provider: "gemini",
          providerModelId: "gemini-3.1-flash-lite-image",
        })
      );
    });

    it("env 指定的 provider 服务于所选模型时覆盖默认绑定", async () => {
      process.env.IMAGE_GEN_PROVIDER = "fal";
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockGetImageGenProvider.mockReturnValue(mockFalProvider);

      const body = {
        ...validBody,
        params: { ...validBody.params, model: "flux-2-dev" },
      };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(201);
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          modelName: "fal-ai/flux-2",
          provider: "fal",
        })
      );
    });

    it("未知 model 应返回 400 且不创建任务", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);

      const body = {
        ...validBody,
        params: { ...validBody.params, model: "not-a-model" },
      };
      const res = await POST(createRequest(body));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_REQUEST");
      expect(json.error).toBe("Unknown imageGen model: not-a-model");
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
    });

    it("model 含非法字符应返回 400", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);

      const body = {
        ...validBody,
        params: { ...validBody.params, model: "bad model!" },
      };
      const res = await POST(createRequest(body));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("INVALID_REQUEST");
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

    // 22. P0: 分析任务未Done -> 400
    it("分析任务未Done应返回 400", async () => {
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

  // ===== plan-01: 提交时快照固化与 sourceTemplateId =====

  describe("POST 快照固化与 sourceTemplateId (plan-01)", () => {
    it("创建任务时服务端固化 recipe/variables 快照（ADR-2）", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const res = await POST(createRequest(validBody));

      expect(res.status).toBe(201);
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          recipeSnapshot: completedAnalysisTask.recipe,
          variablesSnapshot: completedAnalysisTask.analysisTemplateVariables,
        })
      );
    });

    it("携带合法 sourceTemplateId 时校验归属并写入创建参数", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockFindTemplateById.mockResolvedValueOnce(ownedTemplate);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const res = await POST(
        createRequest({ ...validBody, sourceTemplateId: "template-1" })
      );

      expect(res.status).toBe(201);
      expect(mockFindTemplateById).toHaveBeenCalledWith("template-1", "user-1");
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ sourceTemplateId: "template-1" })
      );
    });

    it("sourceTemplateId 不存在或不属于当前用户时返回 400 INVALID_REQUEST", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockFindTemplateById.mockResolvedValueOnce(null);

      const res = await POST(
        createRequest({ ...validBody, sourceTemplateId: "template-other" })
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_REQUEST");
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
    });

    it("sourceTemplateId 非字符串类型返回 400 INVALID_REQUEST", async () => {
      const res = await POST(
        createRequest({ ...validBody, sourceTemplateId: 12345 })
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_REQUEST");
      expect(mockFindAnalysisTaskById).not.toHaveBeenCalled();
    });
  });

  // ─── plan-03: POST 快照校验与 trigger（§3 / AC-01） ─────────────────────

  describe("POST 快照校验与 trigger (plan-03)", () => {
    beforeEach(() => {
      process.env.IMAGE_GEN_PROVIDER = "fal";
    });

    /** 快照合法路径的标准 mock（Provider 挂起避免后台任务干扰） */
    function setupSnapshotSuccess() {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));
    }

    it("携带合法 promptControlSnapshot 时透传持久化（含 trigger）", async () => {
      setupSnapshotSuccess();

      const res = await POST(
        createRequest({ ...validBody, promptControlSnapshot: validPromptControlSnapshot })
      );

      expect(res.status).toBe(201);
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          promptControlSnapshot: validPromptControlSnapshot,
        })
      );
    });

    it("generation_request_received 日志携带快照 trigger（§8.5）", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      setupSnapshotSuccess();

      await POST(
        createRequest({ ...validBody, promptControlSnapshot: validPromptControlSnapshot })
      );

      const logged = logSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes("generation_request_received"));
      expect(logged).toBeDefined();
      expect(logged).toContain('"trigger":"quick_recreate"');

      logSpy.mockRestore();
    });

    it("未携带快照的存量请求兼容：promptControlSnapshot 持久化为 null，trigger 记 manual", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const res = await POST(createRequest(validBody));

      expect(res.status).toBe(201);
      expect(mockCreateGenerationTask).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ promptControlSnapshot: null })
      );

      const logged = logSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes("generation_request_received"));
      expect(logged).toContain('"trigger":"manual"');

      logSpy.mockRestore();
    });

    it("快照 intent 非法枚举 → 400 prompt_control_snapshot_rejected，任务不创建、Provider 不调用", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const res = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({ intent: "wrong_intent" }),
        })
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_REQUEST");
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
      expect(
        logSpy.mock.calls.some((call) =>
          String(call[0]).includes("prompt_control_snapshot_rejected")
        )
      ).toBe(true);

      logSpy.mockRestore();
    });

    it("快照 detailLevel/editorMode/trigger 非法枚举 → 400", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      for (const overrides of [
        { detailLevel: "verbose" },
        { editorMode: "markdown" },
        { trigger: "auto" },
      ]) {
        const res = await POST(
          createRequest({
            ...validBody,
            promptControlSnapshot: snapshotWith(overrides),
          })
        );
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("INVALID_REQUEST");
      }
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });

    it("enabledInvariantIds 引用 Recipe 外 invariant → 400，Provider 不调用", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const res = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            enabledInvariantIds: ["inv_unknown_1"],
          }),
        })
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_REQUEST");
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });

    it("adjustments 引用 Recipe 外 invariantId → 400", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const res = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            adjustments: [
              { invariantId: "inv_unknown_9", action: "disable" as const },
            ],
          }),
        })
      );

      expect(res.status).toBe(400);
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
    });

    it("variableValues 含非 Recipe 变量名 → 400", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const res = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            variableValues: { not_a_recipe_variable: "x" },
          }),
        })
      );

      expect(res.status).toBe(400);
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });

    it("超过 20 个变量或 10 个 adjustment → 400（§7.3 上限）", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const tooManyVariables = Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [`var_${i}`, "v"])
      );
      const variableRes = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            variableValues: tooManyVariables,
          }),
        })
      );
      expect(variableRes.status).toBe(400);

      const tooManyAdjustments = Array.from({ length: 11 }, () => ({
        invariantId: "inv_color_1",
        action: "strengthen" as const,
      }));
      const adjustmentRes = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            adjustments: tooManyAdjustments,
          }),
        })
      );
      expect(adjustmentRes.status).toBe(400);

      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });

    it("变量单值超过 200 字符 → 400；customTemplate 超过 6000 字符 → 400", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const longValue = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            variableValues: { subject: "x".repeat(201) },
          }),
        })
      );
      expect(longValue.status).toBe(400);

      const longTemplate = await POST(
        createRequest({
          ...validBody,
          promptControlSnapshot: snapshotWith({
            customTemplate: "x".repeat(6001),
          }),
        })
      );
      expect(longTemplate.status).toBe(400);

      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });

    it("params.aspectRatio 不在支持白名单 → 400 INVALID_REQUEST，Provider 不调用（§3 画幅校验）", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(v2RecipeAnalysisTask);

      const res = await POST(
        createRequest({
          ...validBody,
          params: { ...validBody.params, aspectRatio: "4:5" },
        })
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("INVALID_REQUEST");
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });
  });

  // ─── plan-03: POST Provider 启动异常终态（§3 / AC-07） ──────────────────

  describe("POST Provider 启动异常终态 (plan-03 / AC-07)", () => {
    beforeEach(() => {
      process.env.IMAGE_GEN_PROVIDER = "fal";
    });

    it("Provider 启动抛错：best-effort 回写 failed 后返回可重试错误", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockUpdateGenerationTask.mockResolvedValue(createdTask);
      mockFalProvider.generate.mockRejectedValueOnce(
        new Error("FAL_KEY is not configured")
      );

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.code).toBe("SERVICE_UNAVAILABLE");
      expect(json.retryable).toBe(true);
      expect(json.error).toContain("FAL_KEY is not configured");
      // 任务必须落入终态 failed，而非永久 processing
      expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
        status: "failed",
        errorMessage: expect.stringContaining("FAL_KEY is not configured"),
      });
      expect(
        logSpy.mock.calls.some((call) =>
          String(call[0]).includes("generation_provider_start_failed")
        )
      ).toBe(true);

      logSpy.mockRestore();
    });

    it("failed 回写本身失败：输出 generation_failed_status_write_failed critical 日志且不含 Prompt", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      // 第 1 次（processing）成功；第 2 次（failed 终态）写失败
      mockUpdateGenerationTask
        .mockResolvedValueOnce(createdTask)
        .mockRejectedValueOnce(new Error("db connection lost"));
      mockFalProvider.generate.mockRejectedValueOnce(
        new Error("FAL_KEY is not configured")
      );

      const res = await POST(createRequest(validBody));

      expect(res.status).toBe(500);

      const critical = errorSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.includes("generation_failed_status_write_failed"));
      expect(critical).toBeDefined();
      expect(critical).toContain('"taskId":"gen-task-1"');
      expect(critical).toContain('"analysisTaskId":"analysis-1"');
      expect(critical).toContain('"provider":"fal"');
      // critical 日志不记录 Prompt 全文（§8.5）
      expect(critical).not.toContain("a beautiful sunset");

      errorSpy.mockRestore();
    });

    it("Replicate 异步提交成功后调用 startTimeoutTimer(..., 300_000)", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      const replicateTask = {
        ...createdTask,
        provider: "replicate" as const,
        modelName: "black-forest-labs/flux-2-dev",
      };
      mockCreateGenerationTask.mockResolvedValueOnce(replicateTask);
      mockUpdateGenerationTask.mockResolvedValue(replicateTask);
      mockGetImageGenProvider.mockReturnValue(mockReplicateProvider);
      mockReplicateProvider.generate.mockResolvedValueOnce({
        mode: "async" as const,
        externalId: "replicate-pred-timeout",
      });

      await POST(createRequest(validBody));

      expect(mockStartTimeoutTimer).toHaveBeenCalledWith(
        "gen-task-1",
        "generation",
        300_000
      );
    });

    it("同步生成超时固定 120_000ms：到点写 failed 且错误信息含超时说明", async () => {
      vi.useFakeTimers();
      try {
        mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
        mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
        mockUpdateGenerationTask.mockResolvedValue(createdTask);
        mockFalProvider.generate.mockResolvedValueOnce({
          mode: "sync" as const,
          imageUrl: "https://fal.ai/tmp/result.webp",
          width: 1024,
          height: 1024,
        });
        // 下载挂起，使 120s 超时定时器先触发
        mockFetch.mockReturnValue(new Promise(() => {}));

        const res = await POST(createRequest(validBody));
        expect(res.status).toBe(201);

        // 119_999ms 时尚未写 failed
        await vi.advanceTimersByTimeAsync(119_999);
        expect(mockUpdateGenerationTask).not.toHaveBeenCalledWith(
          "gen-task-1",
          expect.objectContaining({ status: "failed" })
        );

        // 到 120_000ms 写 failed
        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(0);
        expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
          status: "failed",
          errorMessage: expect.stringContaining("timed out"),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("同步超时不覆盖已落 completed 终态（先 completed，后到点不写 failed）", async () => {
      vi.useFakeTimers();
      try {
        mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
        mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
        mockUpdateGenerationTask.mockResolvedValue(createdTask);
        mockFalProvider.generate.mockResolvedValueOnce({
          mode: "sync" as const,
          imageUrl: "https://fal.ai/tmp/result.webp",
          width: 1024,
          height: 1024,
        });
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

        // 不推进定时器，仅刷新微任务：completed 先落库
        await flushMicrotasks();
        expect(mockUpdateGenerationTask).toHaveBeenCalledWith("gen-task-1", {
          status: "completed",
          resultAssetId: "asset-gen-1",
        });

        // 超过 120s 后也不得改写为 failed
        await vi.advanceTimersByTimeAsync(130_000);
        await flushMicrotasks();
        expect(mockUpdateGenerationTask).not.toHaveBeenCalledWith(
          "gen-task-1",
          expect.objectContaining({ status: "failed" })
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ─── plan-03: POST 用户级限流（§3 / §8.3） ─────────────────────────────

  describe("POST 用户级限流 (plan-03 / §8.3)", () => {
    it("接入 generation 配置：identifier 取 session userId，20 次/小时", async () => {
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const res = await POST(createRequest(validBody));

      expect(res.status).toBe(201);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        "user-1",
        "generation",
        expect.objectContaining({
          windowMs: 60 * 60 * 1000,
          maxRequests: 20,
        })
      );
    });

    it("超限返回 429 RATE_LIMITED，任务不创建、Provider 不调用", async () => {
      mockCheckRateLimit.mockReturnValueOnce({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60 * 60 * 1000,
      });
      // 未接入限流时这些 mock 本应让请求走到 201，使 429 断言成为纯限流红点
      mockFindAnalysisTaskById.mockResolvedValueOnce(completedAnalysisTask);
      mockCreateGenerationTask.mockResolvedValueOnce(createdTask);
      mockFalProvider.generate.mockResolvedValueOnce({
        mode: "sync" as const,
        imageUrl: "https://fal.ai/tmp/result.webp",
        width: 1024,
        height: 1024,
      });
      mockFalProvider.generate.mockReturnValueOnce(new Promise(() => {}));

      const res = await POST(createRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(429);
      expect(json.code).toBe("RATE_LIMITED");
      expect(json.retryable).toBe(true);
      expect(mockCreateGenerationTask).not.toHaveBeenCalled();
      expect(mockFalProvider.generate).not.toHaveBeenCalled();
    });
  });
});
