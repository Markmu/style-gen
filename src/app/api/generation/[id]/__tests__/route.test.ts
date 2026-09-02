import { NextRequest } from "next/server";

// ---- Mocks ----

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindIterationDetail = vi.fn();
vi.mock("@/lib/repositories/generation-task-repository", () => ({
  findIterationDetail: (...args: unknown[]) => mockFindIterationDetail(...args),
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

const templateVariables = [
  {
    name: "subject",
    defaultValue: "Glass flower",
    label: "Subject",
    sourceField: "subject",
  },
];

const sampleRecipe = { imageSummary: "A glass flower study" };

// ─── plan-03: Prompt 控制快照 fixture（AC-01 新旧任务详情契约） ────────────

const samplePromptControlSnapshot = {
  schemaVersion: 1,
  trigger: "quick_recreate" as const,
  intent: "reconstruction" as const,
  detailLevel: "standard" as const,
  editorMode: "variables" as const,
  customPromptDirty: false,
  enabledInvariantIds: ["inv_color_1"],
  variableValues: { subject: "Crystal peony" },
  enabledModifierNames: [] as string[],
  modifierValues: {} as Record<string, string>,
  adjustments: [
    { invariantId: "inv_color_1", action: "strengthen" as const },
  ],
};

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "gen-1",
    analysisTaskId: "analysis-1",
    status: "completed" as const,
    promptSnapshot: "a beautiful sunset",
    negativePromptSnapshot: "ugly",
    params: { aspectRatio: "16:9", quality: "high" },
    modelName: "flux.2",
    resultAssetId: "asset-gen-1",
    resultFileUrl: "https://r2.example.com/generated/gen-1/result.webp",
    errorMessage: null,
    recipe: sampleRecipe,
    recipeSource: "snapshot" as const,
    variables: templateVariables,
    variablesSource: "snapshot" as const,
    sourceImageUrl: "https://r2.example.com/references/source-asset-1/original.png",
    sourceAssetId: "source-asset-1",
    sourceTemplateId: "template-1",
    sourceTemplateName: "Glass Study",
    savedTemplate: { id: "template-saved", name: "Saved Direction" },
    analysisTemplateVariables: templateVariables,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ---- Tests ----

describe("GET /api/generation/[id]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindIterationDetail.mockReset();
    mockFindAssetById.mockReset();
  });

  it("completed 详情返回完整上下文（既有字段超集 + 快照来源标记）", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(makeDetail());

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockFindIterationDetail).toHaveBeenCalledWith("gen-1", "user-1");
    expect(json).toEqual({
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
      recipe: sampleRecipe,
      recipeSource: "snapshot",
      variables: templateVariables,
      variablesSource: "snapshot",
      sourceImageUrl: "https://r2.example.com/references/source-asset-1/original.png",
      sourceAssetId: "source-asset-1",
      sourceTemplateId: "template-1",
      sourceTemplateName: "Glass Study",
      savedTemplate: { id: "template-saved", name: "Saved Direction" },
      analysisTemplateVariables: templateVariables,
      createdAt: new Date("2025-01-01").toISOString(),
      updatedAt: new Date("2025-01-01").toISOString(),
    });
  });

  it("既有轮询消费字段 resultAssetId / analysisTemplateVariables 保留（use-history-restore 兼容）", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(makeDetail());

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(json.resultAssetId).toBe("asset-gen-1");
    expect(json.analysisTemplateVariables).toEqual(templateVariables);
    // 单条资产回查已由仓库联表完成
    expect(mockFindAssetById).not.toHaveBeenCalled();
  });

  it("pending 任务归并为 processing 展示态", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({
        status: "processing",
        resultAssetId: null,
        resultFileUrl: null,
        savedTemplate: null,
      })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("processing");
    expect(json.resultFileUrl).toBeNull();
  });

  it("processing 任务返回保留上下文与 null resultFileUrl", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({ status: "processing", resultFileUrl: null, resultAssetId: null })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("processing");
    expect(json.resultFileUrl).toBeNull();
    expect(json.errorMessage).toBeNull();
    expect(json.recipeSource).toBe("snapshot");
  });

  it("failed 任务返回 errorMessage 与保留上下文", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({
        status: "failed",
        resultFileUrl: null,
        resultAssetId: null,
        errorMessage: "model crashed",
      })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("failed");
    expect(json.errorMessage).toBe("model crashed");
    expect(json.resultFileUrl).toBeNull();
    expect(json.promptSnapshot).toBe("a beautiful sunset");
  });

  it("存量旧行快照回退：recipeSource / variablesSource 为 fallback", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({ recipeSource: "fallback", variablesSource: "fallback" })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(json.recipeSource).toBe("fallback");
    expect(json.variablesSource).toBe("fallback");
  });

  it("来源资产缺失时 sourceAssetId / sourceImageUrl 为 null", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({ sourceAssetId: null, sourceImageUrl: null })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(json.sourceAssetId).toBeNull();
    expect(json.sourceImageUrl).toBeNull();
  });

  it("成功路径输出 iteration_detail_queried 结构化日志", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockFindIterationDetail.mockResolvedValueOnce(makeDetail());

    await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("iteration_detail_queried")
    );

    logSpy.mockRestore();
  });

  it("任务不存在或跨用户访问返回 404 NOT_FOUND", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "non-existent" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("未登录返回 401 { error, code: UNAUTHORIZED, retryable: false }", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual(
      expect.objectContaining({ code: "UNAUTHORIZED", retryable: false })
    );
    expect(mockFindIterationDetail).not.toHaveBeenCalled();
  });

  it("查询异常返回 500 SERVICE_UNAVAILABLE", async () => {
    mockFindIterationDetail.mockRejectedValueOnce(
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

  // ─── plan-03: promptControlSnapshot 新旧详情契约（§3 / AC-01） ──────────

  it("新任务详情返回 promptControlSnapshot，可回证 trigger/intent/变量/调整", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({ promptControlSnapshot: samplePromptControlSnapshot })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.promptControlSnapshot).toEqual(samplePromptControlSnapshot);
    // 快照字段与既有上下文并存
    expect(json.promptSnapshot).toBe("a beautiful sunset");
    expect(json.params).toEqual({ aspectRatio: "16:9", quality: "high" });
  });

  it("旧任务没有快照时 promptControlSnapshot 为 null，消费端以 promptSnapshot 全文降级", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({ promptControlSnapshot: null })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.promptControlSnapshot).toBeNull();
    // 不虚构历史控制值：全文降级依据原样保留
    expect(json.promptSnapshot).toBe("a beautiful sunset");
    expect(json.recipeSource).toBe("snapshot");
  });

  it("processing/failed 任务同样透传 promptControlSnapshot（终态前后上下文一致）", async () => {
    mockFindIterationDetail.mockResolvedValueOnce(
      makeDetail({
        status: "failed",
        resultFileUrl: null,
        resultAssetId: null,
        errorMessage: "model crashed",
        promptControlSnapshot: samplePromptControlSnapshot,
      })
    );

    const res = await GET(createGetRequest(), {
      params: Promise.resolve({ id: "gen-1" }),
    });
    const json = await res.json();

    expect(json.status).toBe("failed");
    expect(json.promptControlSnapshot).toEqual(samplePromptControlSnapshot);
  });
});
