import { POST } from "../route";
import { NextRequest } from "next/server";
import type { AnalysisTask } from "@/types/models";
import { VisionError } from "@/lib/ai/vision";
import { StructurerError } from "@/lib/ai/structurer";

// ---- Mocks ----

const mockQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockCreateAnalysisTask = vi.fn();
const mockUpdateAnalysisTask = vi.fn();
vi.mock("@/lib/repositories/analysis-task-repository", () => ({
  createAnalysisTask: (...args: unknown[]) => mockCreateAnalysisTask(...args),
  updateAnalysisTask: (...args: unknown[]) => mockUpdateAnalysisTask(...args),
}));

const mockAnalyzeImage = vi.fn();
vi.mock("@/lib/ai/vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/vision")>();
  return {
    ...actual,
    analyzeImage: (...args: unknown[]) => mockAnalyzeImage(...args),
  };
});

const mockStructureAnalysis = vi.fn();
vi.mock("@/lib/ai/structurer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/structurer")>();
  return {
    ...actual,
    structureAnalysis: (...args: unknown[]) => mockStructureAnalysis(...args),
  };
});

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

const ASSET_ROW = {
  id: "asset-1",
  type: "reference",
  file_url: "https://example.com/image.jpg",
  thumbnail_url: null,
  width: 800,
  height: 600,
  mime_type: "image/jpeg",
  created_at: new Date("2025-01-01"),
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
  // query: 创建 Asset
  mockQuery.mockResolvedValue({ rows: [ASSET_ROW] });

  // 创建任务 (pending)
  mockCreateAnalysisTask.mockResolvedValue(makePendingTask());

  // 更新任务 (各阶段)
  mockUpdateAnalysisTask.mockImplementation(
    (id: string, updates: Partial<AnalysisTask>) =>
      Promise.resolve(makePendingTask({ id, ...updates }))
  );

  // 视觉分析
  mockAnalyzeImage.mockResolvedValue("Raw visual analysis text");

  // 结构化分析
  mockStructureAnalysis.mockResolvedValue({
    recipe: VALID_RECIPE,
    promptText: "A serene mountain landscape...",
    negativePromptText: "blurry, low quality",
  });
}

describe("POST /api/analysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupSuccessMocks();
  });

  // --- 正常流程 ---

  it("正常分析流程（完整成功）", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("completed");
    expect(data.recipe).toEqual(VALID_RECIPE);
    expect(data.promptText).toBe("A serene mountain landscape...");
    expect(data.negativePromptText).toBe("blurry, low quality");
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

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO assets"),
      expect.arrayContaining(["asset-1", "https://example.com/image.jpg", 800, 600, "image/jpeg"])
    );
  });

  it("创建 AnalysisTask 记录", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockCreateAnalysisTask).toHaveBeenCalledWith({
      sourceAssetId: "asset-1",
    });
  });

  it("状态更新为 processing", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockUpdateAnalysisTask).toHaveBeenCalledWith("task-1", {
      status: "processing",
    });
  });

  // --- 失败路径 ---

  it("视觉理解失败时标记 failed 且 errorStage 为 vision", async () => {
    mockAnalyzeImage.mockRejectedValue(
      new VisionError("Vision model failed")
    );

    const response = await POST(makeRequest(VALID_BODY));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("failed");
    expect(data.errorStage).toBe("vision");

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
});
