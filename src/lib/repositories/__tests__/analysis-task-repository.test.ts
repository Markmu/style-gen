import type {
  AnalysisTaskStatus,
  AnalysisTaskErrorStage,
  VisualRecipe,
} from "@/types/models";

const { mockQuery, mockGenerateId } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mockQuery,
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

import {
  createAnalysisTask,
  findAnalysisTaskById,
  updateAnalysisTask,
} from "@/lib/repositories/analysis-task-repository";

const NOW = new Date("2025-01-01T00:00:00Z");

function makeAnalysisTaskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "TASK_001",
    source_asset_id: "ASSET_001",
    status: "pending" as AnalysisTaskStatus,
    recipe: null,
    prompt_text: null,
    negative_prompt_text: null,
    raw_response: null,
    error_message: null,
    error_stage: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

const sampleRecipe: VisualRecipe = {
  imageSummary: "A beautiful landscape",
  subject: "mountain",
  scene: "outdoor",
  composition: "rule of thirds",
  cameraLanguage: "wide angle",
  lighting: "golden hour",
  color: "warm tones",
  texture: "smooth",
  styleTags: ["landscape", "nature"],
  mood: "peaceful",
  visualKeywords: ["mountain", "sunset"],
  mustKeep: ["mountain"],
  replaceable: ["sky color"],
};

describe("analysis-task-repository", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("TASK_001");
  });

  describe("createAnalysisTask", () => {
    it("正常创建", async () => {
      const row = makeAnalysisTaskRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await createAnalysisTask({ sourceAssetId: "ASSET_001" });

      expect(task).toEqual({
        id: "TASK_001",
        sourceAssetId: "ASSET_001",
        status: "pending",
        recipe: null,
        promptText: null,
        negativePromptText: null,
        rawResponse: null,
        errorMessage: null,
        errorStage: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it("snake_case 映射", async () => {
      const row = makeAnalysisTaskRow({
        source_asset_id: "ASSET_XYZ",
        prompt_text: "a prompt",
        negative_prompt_text: "no blur",
        raw_response: "raw data",
        error_message: "something failed",
        error_stage: "vision" as AnalysisTaskErrorStage,
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await createAnalysisTask({ sourceAssetId: "ASSET_XYZ" });

      expect(task.sourceAssetId).toBe("ASSET_XYZ");
      expect(task.promptText).toBe("a prompt");
      expect(task.negativePromptText).toBe("no blur");
      expect(task.rawResponse).toBe("raw data");
      expect(task.errorMessage).toBe("something failed");
      expect(task.errorStage).toBe("vision");
    });
  });

  describe("findAnalysisTaskById", () => {
    it("找到记录", async () => {
      const row = makeAnalysisTaskRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await findAnalysisTaskById("TASK_001");

      expect(task).not.toBeNull();
      expect(task!.id).toBe("TASK_001");
      expect(task!.sourceAssetId).toBe("ASSET_001");
    });

    it("未找到返回 null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const task = await findAnalysisTaskById("NON_EXISTENT");

      expect(task).toBeNull();
    });

    it("recipe JSONB 自动解析", async () => {
      // pg driver auto-parses JSONB columns into JS objects
      const row = makeAnalysisTaskRow({ recipe: sampleRecipe });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await findAnalysisTaskById("TASK_001");

      expect(task!.recipe).toEqual(sampleRecipe);
      expect(task!.recipe!.styleTags).toEqual(["landscape", "nature"]);
    });
  });

  describe("updateAnalysisTask", () => {
    it("更新单个字段", async () => {
      const row = makeAnalysisTaskRow({ status: "processing" });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await updateAnalysisTask("TASK_001", { status: "processing" });

      expect(task.status).toBe("processing");
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("UPDATE analysis_tasks SET");
      expect(sql).toContain("status = $1");
      expect(sql).toContain("updated_at = NOW()");
      expect(sql).toContain("WHERE id = $2");
      expect(params).toEqual(["processing", "TASK_001"]);
    });

    it("更新多个字段", async () => {
      const row = makeAnalysisTaskRow({
        status: "completed",
        prompt_text: "generated prompt",
        negative_prompt_text: "no artifacts",
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await updateAnalysisTask("TASK_001", {
        status: "completed",
        promptText: "generated prompt",
        negativePromptText: "no artifacts",
      });

      expect(task.status).toBe("completed");
      expect(task.promptText).toBe("generated prompt");
      expect(task.negativePromptText).toBe("no artifacts");

      const [sql, params] = mockQuery.mock.calls[0];
      // Should have 3 field params + 1 id param
      expect(params).toHaveLength(4);
      expect(params[params.length - 1]).toBe("TASK_001");
    });

    it("recipe 序列化 (JSON.stringify + ::jsonb)", async () => {
      const row = makeAnalysisTaskRow({ recipe: sampleRecipe });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await updateAnalysisTask("TASK_001", { recipe: sampleRecipe });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("::jsonb");
      expect(params[0]).toBe(JSON.stringify(sampleRecipe));
    });

    it("recipe 为 null", async () => {
      const row = makeAnalysisTaskRow({ recipe: null });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await updateAnalysisTask("TASK_001", { recipe: null });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("::jsonb");
      // null should be passed as null, not stringified
      expect(params[0]).toBeNull();
    });

    it("未找到记录抛出异常", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        updateAnalysisTask("NON_EXISTENT", { status: "failed" })
      ).rejects.toThrow("AnalysisTask not found: NON_EXISTENT");
    });

    it("columnMap 映射正确", async () => {
      const row = makeAnalysisTaskRow({
        status: "failed",
        error_message: "timeout",
        error_stage: "llm",
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await updateAnalysisTask("TASK_001", {
        status: "failed",
        errorMessage: "timeout",
        errorStage: "llm",
      });

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("status = $1");
      expect(sql).toContain("error_message = $");
      expect(sql).toContain("error_stage = $");
    });

    it("忽略无效字段", async () => {
      const row = makeAnalysisTaskRow({ status: "processing" });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      // Pass an invalid field alongside a valid one
      await updateAnalysisTask("TASK_001", {
        status: "processing",
        invalidField: "should be ignored",
      } as any);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).not.toContain("invalidField");
      expect(sql).not.toContain("invalid_field");
      // Only valid field + id
      expect(params).toEqual(["processing", "TASK_001"]);
    });

    it("参数索引正确", async () => {
      const row = makeAnalysisTaskRow({
        status: "completed",
        prompt_text: "prompt",
        raw_response: "raw",
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await updateAnalysisTask("TASK_001", {
        status: "completed",
        promptText: "prompt",
        rawResponse: "raw",
      });

      const [sql, params] = mockQuery.mock.calls[0];
      // Verify sequential parameter indexing $1, $2, $3 for fields, $4 for id
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
      expect(sql).toContain("$3");
      expect(sql).toContain("WHERE id = $4");
      expect(params).toHaveLength(4);
      expect(params[3]).toBe("TASK_001");
    });
  });
});
