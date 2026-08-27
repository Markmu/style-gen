import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import type { AnalysisTask, Asset, PromptTemplate } from "@/types/models";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockCreateTemplate = vi.fn();
const mockFindByName = vi.fn();
const mockFindAllByUserId = vi.fn();
vi.mock("@/lib/repositories/template-repository", () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  findByName: (...args: unknown[]) => mockFindByName(...args),
  findAllByUserId: (...args: unknown[]) => mockFindAllByUserId(...args),
}));

const mockFindAssetById = vi.fn();
vi.mock("@/lib/repositories/asset-repository", () => ({
  findAssetById: (...args: unknown[]) => mockFindAssetById(...args),
}));

const mockFindAnalysisTaskById = vi.fn();
vi.mock("@/lib/repositories/analysis-task-repository", () => ({
  findAnalysisTaskById: (...args: unknown[]) => mockFindAnalysisTaskById(...args),
}));

const mockFindGenerationTaskById = vi.fn();
const mockLinkTemplateToGenerationTask = vi.fn();
vi.mock("@/lib/repositories/generation-task-repository", () => ({
  findGenerationTaskById: (...args: unknown[]) => mockFindGenerationTaskById(...args),
  linkTemplateToGenerationTask: (...args: unknown[]) =>
    mockLinkTemplateToGenerationTask(...args),
}));

// plan-02: 限流迁移到共享 checkRateLimit（templateWrite，30/小时）
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

function makeRequest(
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const REFERENCE_ASSET: Asset = {
  id: "asset-1",
  type: "reference",
  fileUrl: "https://cdn.example.com/reference.png",
  thumbnailUrl: null,
  width: 800,
  height: 600,
  mimeType: "image/png",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

const ANALYSIS_TASK: AnalysisTask = {
  id: "analysis-1",
  sourceAssetId: "asset-1",
  status: "completed",
  recipe: null,
  promptText: "Create a glass fox.",
  negativePromptText: "",
  rawResponse: "A glass fox.",
  errorMessage: null,
  errorStage: null,
  analysisTemplateContent: "Create {{subject}}.",
  analysisTemplateVariables: [{ name: "subject", defaultValue: "glass fox" }],
  analysisTemplateStatus: "ready",
  analysisTemplateReason: null,
  provider: "gemini",
  externalId: null,
  modelName: "gemini-2.5-flash",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

const TEMPLATE: PromptTemplate = {
  id: "template-1",
  name: "Saved",
  content: "Create {{subject}}.",
  variables: [{ name: "subject", defaultValue: "glass fox" }],
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

const COMPLETED_GENERATION_TASK = {
  id: "gen-1",
  analysisTaskId: "analysis-1",
  status: "completed" as const,
  promptSnapshot: "A glass fox at dawn",
  negativePromptSnapshot: "",
  params: { aspectRatio: "1:1", quality: "standard" },
  modelName: "flux.2",
  provider: "fal" as const,
  externalId: null,
  resultAssetId: "asset-gen-1",
  errorMessage: null,
  userId: "user-1",
  recipeSnapshot: null,
  variablesSnapshot: null,
  sourceTemplateId: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("/api/templates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("derives the owned reference image from sourceAnalysisTaskId", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);
    mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);
    mockCreateTemplate.mockResolvedValue(TEMPLATE);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockFindAnalysisTaskById).toHaveBeenCalledWith("analysis-1", "user-1");
    expect(mockFindAssetById).toHaveBeenCalledWith("asset-1");
    expect(mockCreateTemplate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        sourceAssetId: "asset-1",
        sourceImageUrl: "https://cdn.example.com/reference.png",
      }),
    );
  });

  it("rejects a missing or unauthorized source analysis task", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(null);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFindAnalysisTaskById).toHaveBeenCalledWith("analysis-1", "user-1");
    expect(mockFindAssetById).not.toHaveBeenCalled();
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects a non-reference asset derived from the analysis task", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);
    mockFindAssetById.mockResolvedValue({
      ...REFERENCE_ASSET,
      type: "generated",
    });

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects an asset owned by another user even when the task is owned", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);
    mockFindAssetById.mockResolvedValue({
      ...REFERENCE_ASSET,
      userId: "user-2",
    });

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects conflicting analysis task and explicit source asset IDs", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
        sourceAssetId: "asset-2",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFindAssetById).not.toHaveBeenCalled();
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects a client image URL without a database-backed source", async () => {
    mockFindByName.mockResolvedValue(null);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceImageUrl: "https://cdn.example.com/client-supplied.png",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("creates a template with the owned reference asset image", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);
    mockCreateTemplate.mockResolvedValue(TEMPLATE);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        variables: [{ name: "subject", defaultValue: "glass fox" }],
        sourceAssetId: "asset-1",
        sourceImageUrl: "https://cdn.example.com/client-supplied.png",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateTemplate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        sourceAssetId: "asset-1",
        sourceImageUrl: "https://cdn.example.com/reference.png",
      }),
    );
  });

  it("accepts Unicode, spaced, and hyphenated variable names", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAssetById.mockResolvedValue(null);
    mockCreateTemplate.mockResolvedValue(TEMPLATE);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "多语言模板",
        content: "Create {{主体 名称}} with {{lighting-color}}.",
        variables: [
          { name: "主体 名称 ", defaultValue: "glass fox" },
          { name: "lighting-color", defaultValue: "soft blue" },
        ],
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateTemplate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        variables: [
          { name: "主体 名称", defaultValue: "glass fox" },
          { name: "lighting-color", defaultValue: "soft blue" },
        ],
      }),
    );
  });

  it("returns source image fields in the template list response", async () => {
    mockFindAllByUserId.mockResolvedValue({
      items: [
        {
          id: "template-1",
          name: "Saved",
          variableCount: 1,
          sourceAssetId: "asset-1",
          sourceImageUrl: "https://cdn.example.com/reference.png",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const response = await GET(
      makeRequest("http://localhost:3000/api/templates?limit=20"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items[0].sourceAssetId).toBe("asset-1");
    expect(data.items[0].sourceImageUrl).toBe("https://cdn.example.com/reference.png");
  });

  // ─── plan-01: sourceGenerationTaskId 来源迭代关联 ────────────────────

  describe("sourceGenerationTaskId (plan-01)", () => {
    const iterationSaveBody = {
      name: "Saved Direction",
      content: "Create {{subject}}.",
      sourceGenerationTaskId: "gen-1",
      sourceAssetId: "asset-1",
    };

    it("校验通过后落库来源迭代关联并返回 201", async () => {
      mockFindByName.mockResolvedValue(null);
      mockFindGenerationTaskById.mockResolvedValue(COMPLETED_GENERATION_TASK);
      mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);
      mockCreateTemplate.mockResolvedValue(TEMPLATE);
      mockLinkTemplateToGenerationTask.mockResolvedValue(undefined);

      const response = await POST(
        makeRequest("http://localhost:3000/api/templates", iterationSaveBody),
      );

      expect(response.status).toBe(201);
      expect(mockFindGenerationTaskById).toHaveBeenCalledWith("gen-1", "user-1");
      expect(mockLinkTemplateToGenerationTask).toHaveBeenCalledWith(
        "template-1",
        "gen-1",
        "user-1",
      );
    });

    it("任务不存在或不属于当前用户时返回 400 INVALID_REQUEST", async () => {
      mockFindByName.mockResolvedValue(null);
      mockFindGenerationTaskById.mockResolvedValue(null);

      const response = await POST(
        makeRequest("http://localhost:3000/api/templates", iterationSaveBody),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockCreateTemplate).not.toHaveBeenCalled();
      expect(mockLinkTemplateToGenerationTask).not.toHaveBeenCalled();
    });

    it("任务非 completed 时返回 400 INVALID_REQUEST", async () => {
      mockFindByName.mockResolvedValue(null);
      mockFindGenerationTaskById.mockResolvedValue({
        ...COMPLETED_GENERATION_TASK,
        status: "processing" as const,
      });

      const response = await POST(
        makeRequest("http://localhost:3000/api/templates", iterationSaveBody),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });

    it("任务 completed 但无结果资产时返回 400 INVALID_REQUEST", async () => {
      mockFindByName.mockResolvedValue(null);
      mockFindGenerationTaskById.mockResolvedValue({
        ...COMPLETED_GENERATION_TASK,
        resultAssetId: null,
      });

      const response = await POST(
        makeRequest("http://localhost:3000/api/templates", iterationSaveBody),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });

    it("sourceGenerationTaskId 非字符串类型返回 400 INVALID_REQUEST", async () => {
      const response = await POST(
        makeRequest("http://localhost:3000/api/templates", {
          name: "Saved Direction",
          content: "Create {{subject}}.",
          sourceGenerationTaskId: 12345,
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockFindGenerationTaskById).not.toHaveBeenCalled();
    });
  });

  // ─── plan-02: POST 扩展体、GET status 筛选与共享限流（架构 §6.1/§6.3/§7.3/§8.2/§8.3） ───

  const toUlid = (prefix: string) => prefix.padEnd(26, "0").slice(0, 26);
  const PLAN2_SOURCE_TASK_ID = toUlid("GEN1");

  const PLAN2_COMPLETED_SOURCE_TASK = {
    ...COMPLETED_GENERATION_TASK,
    id: PLAN2_SOURCE_TASK_ID,
  };

  const STYLE_MEMORY_RECORD_BASE = {
    id: "template-1",
    name: "Saved Direction",
    description: null as string | null,
    content: "Create {{subject}}.",
    variables: [{ name: "subject", defaultValue: "glass fox" }],
    retainedRules: [] as string[],
    negativeConstraints: [] as string[],
    styleTokens: [] as string[],
    enhancementHints: [] as string[],
    verificationStatus: "pending_verification" as const,
    representativeGenerationTaskId: null as string | null,
    sourceAssetId: "asset-1",
    sourceImageUrl: "https://cdn.example.com/reference.png",
    sourceGenerationTaskId: null as string | null,
    userId: "user-1",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };

  describe("plan-02: POST 保存流程扩展体与状态派生", () => {
    beforeEach(() => {
      mockCheckRateLimit.mockReturnValue({
        allowed: true,
        remaining: 29,
        resetAt: Date.now() + 60 * 60 * 1000,
      });
      // 模拟 plan-01 createTemplate 的服务端状态派生（带代表结果 → user_verified）
      mockCreateTemplate.mockImplementation(
        (
          _userId: string,
          data: { representativeGenerationTaskId?: string | null },
        ) => ({
          ...STYLE_MEMORY_RECORD_BASE,
          ...(data.representativeGenerationTaskId
            ? {
                verificationStatus: "user_verified" as const,
                representativeGenerationTaskId: data.representativeGenerationTaskId,
              }
            : {}),
        }),
      );
    });

    it("透传扩展字段并返回 pending_verification 记录（无代表结果）", async () => {
      mockFindByName.mockResolvedValue(null);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          {
            name: "Saved Direction",
            content: "Create {{subject}}.",
            description: "A glass-fox direction",
            retainedRules: ["keep glass texture", "soft rim light"],
            negativeConstraints: ["no text"],
            styleTokens: ["glass", "soft light"],
            enhancementHints: ["keep it minimal"],
          },
          { "x-forwarded-for": "10.0.2.1" },
        ),
      );

      expect(response.status).toBe(201);
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          description: "A glass-fox direction",
          retainedRules: ["keep glass texture", "soft rim light"],
          negativeConstraints: ["no text"],
          styleTokens: ["glass", "soft light"],
          enhancementHints: ["keep it minimal"],
        }),
      );
      const data = await response.json();
      expect(data.verificationStatus).toBe("pending_verification");
    });

    it("带合法 representative（等于 sourceGenerationTaskId）→ 201 user_verified", async () => {
      mockFindByName.mockResolvedValue(null);
      mockFindGenerationTaskById.mockResolvedValue(PLAN2_COMPLETED_SOURCE_TASK);
      mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);
      mockLinkTemplateToGenerationTask.mockResolvedValue(undefined);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          {
            name: "Saved Direction",
            content: "Create {{subject}}.",
            sourceAssetId: "asset-1",
            sourceGenerationTaskId: PLAN2_SOURCE_TASK_ID,
            representativeGenerationTaskId: PLAN2_SOURCE_TASK_ID,
          },
          { "x-forwarded-for": "10.0.2.2" },
        ),
      );

      expect(response.status).toBe(201);
      expect(mockFindGenerationTaskById).toHaveBeenCalledWith(
        PLAN2_SOURCE_TASK_ID,
        "user-1",
      );
      expect(mockCreateTemplate).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          representativeGenerationTaskId: PLAN2_SOURCE_TASK_ID,
        }),
      );
      const data = await response.json();
      expect(data.verificationStatus).toBe("user_verified");
    });

    it("representative ≠ sourceGenerationTaskId → 400 INVALID_REQUEST", async () => {
      mockFindByName.mockResolvedValue(null);
      mockFindGenerationTaskById.mockResolvedValue(PLAN2_COMPLETED_SOURCE_TASK);
      mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          {
            name: "Saved Direction",
            content: "Create {{subject}}.",
            sourceAssetId: "asset-1",
            sourceGenerationTaskId: PLAN2_SOURCE_TASK_ID,
            representativeGenerationTaskId: toUlid("GEN2"),
          },
          { "x-forwarded-for": "10.0.2.3" },
        ),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });

    it("请求体携带 verificationStatus → 400（ADR-1 信任边界）", async () => {
      mockFindByName.mockResolvedValue(null);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          {
            name: "Saved Direction",
            content: "Create {{subject}}.",
            verificationStatus: "user_verified",
          },
          { "x-forwarded-for": "10.0.2.4" },
        ),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });

    it.each([
      {
        label: "13 条 retainedRules",
        field: "retainedRules",
        value: Array.from({ length: 13 }, (_, i) => `rule ${i + 1}`),
      },
      {
        label: "201 字符 retainedRules 元素",
        field: "retainedRules",
        value: ["x".repeat(201)],
      },
      {
        label: "13 条 negativeConstraints",
        field: "negativeConstraints",
        value: Array.from({ length: 13 }, (_, i) => `avoid ${i + 1}`),
      },
      {
        label: "201 字符 negativeConstraints 元素",
        field: "negativeConstraints",
        value: ["y".repeat(201)],
      },
      {
        label: "501 字符 description",
        field: "description",
        value: "d".repeat(501),
      },
      {
        label: "17 条 styleTokens",
        field: "styleTokens",
        value: Array.from({ length: 17 }, (_, i) => `token ${i + 1}`),
      },
      {
        label: "81 字符 styleTokens 元素",
        field: "styleTokens",
        value: ["t".repeat(81)],
      },
      {
        label: "17 条 enhancementHints",
        field: "enhancementHints",
        value: Array.from({ length: 17 }, (_, i) => `hint ${i + 1}`),
      },
      {
        label: "81 字符 enhancementHints 元素",
        field: "enhancementHints",
        value: ["h".repeat(81)],
      },
    ])("输入上限越界（$label）→ 400 INVALID_REQUEST", async ({ field, value }) => {
      mockFindByName.mockResolvedValue(null);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          {
            name: "Saved Direction",
            content: "Create {{subject}}.",
            [field]: value,
          },
          { "x-forwarded-for": "10.0.2.5" },
        ),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });

    it("同名冲突 → 409 code 保持 TEMPLATE_NAME_CONFLICT", async () => {
      mockFindByName.mockResolvedValue(STYLE_MEMORY_RECORD_BASE);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          { name: "Saved Direction", content: "Create {{subject}}." },
          { "x-forwarded-for": "10.0.2.6" },
        ),
      );

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.code).toBe("TEMPLATE_NAME_CONFLICT");
    });
  });

  describe("plan-02: GET 列表 status 白名单与新列表 DTO", () => {
    beforeEach(() => {
      mockFindAllByUserId.mockResolvedValue({
        items: [
          {
            id: "template-1",
            name: "Saved Direction",
            verificationStatus: "user_verified",
            retainedRulesPreview: ["keep glass texture", "soft rim light"],
            variableCount: 1,
            sourceImageUrl: "https://cdn.example.com/reference.png",
            representativeImageUrl: "https://cdn.example.com/gen-1.webp",
            lastUsedAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        hasMore: false,
        nextCursor: null,
      });
    });

    it("status 非白名单值 → 400 INVALID_REQUEST", async () => {
      const response = await GET(
        makeRequest("http://localhost:3000/api/templates?status=verified"),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockFindAllByUserId).not.toHaveBeenCalled();
    });

    it("status=user_verified 生效且可与 search 组合", async () => {
      const response = await GET(
        makeRequest(
          "http://localhost:3000/api/templates?status=user_verified&search=glass",
        ),
      );

      expect(response.status).toBe(200);
      expect(mockFindAllByUserId).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          verificationStatus: "user_verified",
          search: "glass",
        }),
      );
    });

    it("status=pending_verification 生效", async () => {
      const response = await GET(
        makeRequest(
          "http://localhost:3000/api/templates?status=pending_verification",
        ),
      );

      expect(response.status).toBe(200);
      expect(mockFindAllByUserId).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ verificationStatus: "pending_verification" }),
      );
    });

    it("status=all 与缺省 → 不携带 verificationStatus 筛选", async () => {
      await GET(makeRequest("http://localhost:3000/api/templates?status=all"));
      expect(mockFindAllByUserId.mock.calls[0][0]).toBe("user-1");
      expect(mockFindAllByUserId.mock.calls[0][1]).not.toHaveProperty(
        "verificationStatus",
      );

      await GET(makeRequest("http://localhost:3000/api/templates"));
      expect(mockFindAllByUserId.mock.calls[1][1]).not.toHaveProperty(
        "verificationStatus",
      );
    });

    it("返回 StyleMemoryListItem 新 DTO 字段", async () => {
      const response = await GET(
        makeRequest("http://localhost:3000/api/templates"),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items[0]).toMatchObject({
        id: "template-1",
        verificationStatus: "user_verified",
        retainedRulesPreview: ["keep glass texture", "soft rim light"],
        representativeImageUrl: "https://cdn.example.com/gen-1.webp",
        lastUsedAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      });
    });
  });

  describe("plan-02: 限流迁移到共享 checkRateLimit", () => {
    beforeEach(() => {
      mockCheckRateLimit.mockReturnValue({
        allowed: true,
        remaining: 29,
        resetAt: Date.now() + 60 * 60 * 1000,
      });
    });

    it("POST 接入共享 templateWrite 配置（identifier 取 session userId）", async () => {
      mockFindByName.mockResolvedValue(null);
      mockCreateTemplate.mockResolvedValue(STYLE_MEMORY_RECORD_BASE);

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          { name: "Saved", content: "Create {{subject}}." },
          { "x-forwarded-for": "10.0.2.7" },
        ),
      );

      expect(response.status).toBe(201);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        "user-1",
        "templateWrite",
        expect.objectContaining({
          windowMs: 60 * 60 * 1000,
          maxRequests: 30,
        }),
      );
    });

    it("共享限流超限 → 429 RATE_LIMITED retryable", async () => {
      mockCheckRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60 * 60 * 1000,
      });

      const response = await POST(
        makeRequest(
          "http://localhost:3000/api/templates",
          { name: "Saved", content: "Create {{subject}}." },
          { "x-forwarded-for": "10.0.2.8" },
        ),
      );

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.code).toBe("RATE_LIMITED");
      expect(data.retryable).toBe(true);
      expect(mockCreateTemplate).not.toHaveBeenCalled();
    });
  });
});
