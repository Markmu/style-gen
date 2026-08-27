import { POST } from "../route";
import { NextRequest } from "next/server";
import type { GenerationTask } from "@/types/models";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindById = vi.fn();
const mockFindStyleMemoryDetail = vi.fn();
const mockSetRepresentativeResult = vi.fn();
vi.mock("@/lib/repositories/template-repository", () => ({
  findById: (...args: unknown[]) => mockFindById(...args),
  findStyleMemoryDetail: (...args: unknown[]) =>
    mockFindStyleMemoryDetail(...args),
  setRepresentativeResult: (...args: unknown[]) =>
    mockSetRepresentativeResult(...args),
}));

const mockFindGenerationTaskById = vi.fn();
vi.mock("@/lib/repositories/generation-task-repository", () => ({
  findGenerationTaskById: (...args: unknown[]) =>
    mockFindGenerationTaskById(...args),
}));

// plan-02: representative-result 为写端点，接入共享限流（templateWrite）
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

function makeRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const routeParams = (id = "template-1") => ({ params: Promise.resolve({ id }) });

const toUlid = (prefix: string) => prefix.padEnd(26, "0").slice(0, 26);
const TEMPLATE_ID = "template-1";
const SOURCE_TASK_ID = toUlid("GENSRC");
const DERIVED_TASK_ID = toUlid("GENDRV");

const MEMORY = {
  id: TEMPLATE_ID,
  name: "Saved Direction",
  description: "A glass-fox direction",
  content: "Create {{subject}}.",
  variables: [{ name: "subject", defaultValue: "glass fox" }],
  retainedRules: ["rule a", "rule b"],
  negativeConstraints: ["no text"],
  styleTokens: ["glass", "soft light"],
  enhancementHints: ["keep it minimal"],
  verificationStatus: "pending_verification" as const,
  representativeGenerationTaskId: null as string | null,
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  sourceGenerationTaskId: SOURCE_TASK_ID,
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

function makeGenerationTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    id: DERIVED_TASK_ID,
    analysisTaskId: "analysis-1",
    status: "completed",
    promptSnapshot: "A glass fox at dawn",
    negativePromptSnapshot: "",
    params: { aspectRatio: "1:1", quality: "standard" },
    modelName: "flux.2",
    provider: "fal",
    externalId: null,
    resultAssetId: "asset-gen-1",
    errorMessage: null,
    userId: "user-1",
    recipeSnapshot: null,
    variablesSnapshot: null,
    // 相关集分支一：本 Memory 派生的迭代（sourceTemplateId 匹配）
    sourceTemplateId: TEMPLATE_ID,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** 相关集分支二：来源迭代自身（task.id === memory.sourceGenerationTaskId） */
const SOURCE_ITERATION_TASK = makeGenerationTask({
  id: SOURCE_TASK_ID,
  sourceTemplateId: null,
});

function loggedEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map((call) => call[0])
    .filter((line): line is string => typeof line === "string")
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null);
}

describe("/api/templates/[id]/representative-result", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 60 * 60 * 1000,
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("合法设置（派生迭代）→ 200 user_verified，日志 action=set", async () => {
    mockFindById.mockResolvedValue(MEMORY);
    mockFindStyleMemoryDetail.mockResolvedValue(MEMORY);
    mockFindGenerationTaskById.mockResolvedValue(makeGenerationTask());
    mockSetRepresentativeResult.mockResolvedValue({
      ...MEMORY,
      representativeGenerationTaskId: DERIVED_TASK_ID,
      verificationStatus: "user_verified",
    });

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: DERIVED_TASK_ID },
      ),
      routeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindGenerationTaskById).toHaveBeenCalledWith(
      DERIVED_TASK_ID,
      "user-1",
    );
    expect(mockSetRepresentativeResult).toHaveBeenCalledWith(
      TEMPLATE_ID,
      "user-1",
      DERIVED_TASK_ID,
    );
    expect(data.verificationStatus).toBe("user_verified");
    expect(data.representativeGenerationTaskId).toBe(DERIVED_TASK_ID);

    const events = loggedEvents(logSpy);
    const setEvent = events.find(
      (event) => event.event === "representative_result_set",
    );
    expect(setEvent).toMatchObject({
      templateId: TEMPLATE_ID,
      generationTaskId: DERIVED_TASK_ID,
      action: "set",
    });
  });

  it("替换已有代表结果（来源迭代自身也属相关集）→ 200，日志 action=replace", async () => {
    const memoryWithRepresentative = {
      ...MEMORY,
      representativeGenerationTaskId: DERIVED_TASK_ID,
      verificationStatus: "user_verified" as const,
    };
    mockFindById.mockResolvedValue(memoryWithRepresentative);
    mockFindStyleMemoryDetail.mockResolvedValue(memoryWithRepresentative);
    mockFindGenerationTaskById.mockResolvedValue(SOURCE_ITERATION_TASK);
    mockSetRepresentativeResult.mockResolvedValue({
      ...memoryWithRepresentative,
      representativeGenerationTaskId: SOURCE_TASK_ID,
      verificationStatus: "user_verified",
    });

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: SOURCE_TASK_ID },
      ),
      routeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.verificationStatus).toBe("user_verified");

    const events = loggedEvents(logSpy);
    const replaceEvent = events.find(
      (event) => event.event === "representative_result_set",
    );
    expect(replaceEvent).toMatchObject({
      templateId: TEMPLATE_ID,
      generationTaskId: SOURCE_TASK_ID,
      action: "replace",
    });
  });

  it.each([
    {
      label: "目标不在相关集",
      task: makeGenerationTask({
        id: toUlid("GENOTHER"),
        sourceTemplateId: "template-999",
      }),
    },
    {
      label: "目标非 completed",
      task: makeGenerationTask({ status: "processing" as const }),
    },
    {
      label: "目标无结果资产",
      task: makeGenerationTask({ resultAssetId: null }),
    },
  ])("负向校验（$label）→ 400/404 且不写入", async ({ task }) => {
    mockFindById.mockResolvedValue(MEMORY);
    mockFindStyleMemoryDetail.mockResolvedValue(MEMORY);
    mockFindGenerationTaskById.mockResolvedValue(task);

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: task.id },
      ),
      routeParams(),
    );

    expect([400, 404]).toContain(response.status);
    expect(mockSetRepresentativeResult).not.toHaveBeenCalled();
  });

  it("目标任务不存在或不属于本人 → 400/404 且不写入", async () => {
    mockFindById.mockResolvedValue(MEMORY);
    mockFindStyleMemoryDetail.mockResolvedValue(MEMORY);
    mockFindGenerationTaskById.mockResolvedValue(null);

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: DERIVED_TASK_ID },
      ),
      routeParams(),
    );

    expect([400, 404]).toContain(response.status);
    expect(mockSetRepresentativeResult).not.toHaveBeenCalled();
  });

  it("Memory 不存在或不属于本人 → 404 TEMPLATE_NOT_FOUND", async () => {
    mockFindById.mockResolvedValue(null);
    mockFindStyleMemoryDetail.mockResolvedValue(null);

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: DERIVED_TASK_ID },
      ),
      routeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe("TEMPLATE_NOT_FOUND");
    expect(mockFindGenerationTaskById).not.toHaveBeenCalled();
    expect(mockSetRepresentativeResult).not.toHaveBeenCalled();
  });

  it.each([
    { label: "缺失 generationTaskId", body: {} },
    { label: "generationTaskId 非字符串", body: { generationTaskId: 12345 } },
  ])("非法请求体（$label）→ 400 INVALID_REQUEST", async ({ body }) => {
    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        body,
      ),
      routeParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("INVALID_REQUEST");
    expect(mockSetRepresentativeResult).not.toHaveBeenCalled();
  });

  it("未登录 → 401 UNAUTHORIZED", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: DERIVED_TASK_ID },
      ),
      routeParams(),
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.code).toBe("UNAUTHORIZED");
    expect(mockSetRepresentativeResult).not.toHaveBeenCalled();
  });

  it("共享限流超限 → 429 RATE_LIMITED retryable（templateWrite）", async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60 * 60 * 1000,
    });

    const response = await POST(
      makeRequest(
        `http://localhost:3000/api/templates/${TEMPLATE_ID}/representative-result`,
        { generationTaskId: DERIVED_TASK_ID },
      ),
      routeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.code).toBe("RATE_LIMITED");
    expect(data.retryable).toBe(true);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "user-1",
      "templateWrite",
      expect.objectContaining({ maxRequests: 30 }),
    );
    expect(mockSetRepresentativeResult).not.toHaveBeenCalled();
  });
});
