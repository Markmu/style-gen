import { GET } from "../route";
import { NextRequest } from "next/server";
import type { AnalysisTask } from "@/types/models";

// ---- Mocks ----

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindAnalysisTaskById = vi.fn();
vi.mock("@/lib/repositories/analysis-task-repository", () => ({
  findAnalysisTaskById: (...args: unknown[]) =>
    mockFindAnalysisTaskById(...args),
}));

// ---- Helpers ----

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/analysis/task-1", {
    method: "GET",
  });
}

function makeCompletedTask(
  overrides: Partial<AnalysisTask> = {}
): AnalysisTask {
  return {
    id: "task-1",
    sourceAssetId: "asset-1",
    status: "completed",
    recipe: {
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
    },
    promptText: "A serene mountain landscape...",
    negativePromptText: "blurry, low quality",
    rawResponse: "Raw visual analysis text",
    errorMessage: null,
    errorStage: null,
    analysisTemplateContent: "Create {{subject}}.",
    analysisTemplateVariables: [
      { name: "subject", defaultValue: "Mountain range", label: "Subject", sourceField: "subject" },
    ],
    analysisTemplateStatus: "ready",
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

describe("GET /api/analysis/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("正常查询 completed 任务", async () => {
    const task = makeCompletedTask();
    mockFindAnalysisTaskById.mockResolvedValue(task);

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("task-1");
    expect(data.status).toBe("completed");
    expect(data.promptText).toBe("A serene mountain landscape...");
    expect(data.analysisTemplateContent).toBe("Create {{subject}}.");
    expect(data.analysisTemplateVariables).toEqual([
      { name: "subject", defaultValue: "Mountain range", label: "Subject", sourceField: "subject" },
    ]);
    expect(data.analysisTemplateStatus).toBe("ready");
    expect(mockFindAnalysisTaskById).toHaveBeenCalledWith("task-1", "user-1");
  });

  it("查询 pending 任务", async () => {
    const task = makeCompletedTask({ status: "pending", recipe: null });
    mockFindAnalysisTaskById.mockResolvedValue(task);

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("pending");
  });

  it("任务不存在时返回 404 NOT_FOUND", async () => {
    mockFindAnalysisTaskById.mockResolvedValue(null);

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe("NOT_FOUND");
    expect(data.error).toBe("Analysis task not found");
  });

  it("查询异常时返回 500 SERVICE_UNAVAILABLE", async () => {
    mockFindAnalysisTaskById.mockRejectedValue(
      new Error("Database connection failed")
    );

    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "task-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.code).toBe("SERVICE_UNAVAILABLE");
    expect(data.error).toBe("Database connection failed");
  });
});
