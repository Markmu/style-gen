import type { GenerationParams, GenerationTaskStatus } from "@/types/models";

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
  createGenerationTask,
  findGenerationTaskById,
  updateGenerationTask,
} from "@/lib/repositories/generation-task-repository";

const NOW = new Date("2025-01-01T00:00:00Z");

const sampleParams: GenerationParams = {
  aspectRatio: "16:9",
  quality: "hd",
};

function makeGenerationTaskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "GEN_001",
    analysis_task_id: "TASK_001",
    status: "pending" as GenerationTaskStatus,
    prompt_snapshot: "a beautiful mountain landscape",
    negative_prompt_snapshot: "no blur, no artifacts",
    params: sampleParams,
    model_name: "dall-e-3",
    result_asset_id: null,
    error_message: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

const createInput = {
  analysisTaskId: "TASK_001",
  promptSnapshot: "a beautiful mountain landscape",
  negativePromptSnapshot: "no blur, no artifacts",
  params: sampleParams,
  modelName: "dall-e-3",
};

describe("generation-task-repository", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("GEN_001");
  });

  describe("createGenerationTask", () => {
    it("正常创建", async () => {
      const row = makeGenerationTaskRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await createGenerationTask(createInput);

      expect(task).toEqual({
        id: "GEN_001",
        analysisTaskId: "TASK_001",
        status: "pending",
        promptSnapshot: "a beautiful mountain landscape",
        negativePromptSnapshot: "no blur, no artifacts",
        params: sampleParams,
        modelName: "dall-e-3",
        resultAssetId: null,
        errorMessage: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it("params 序列化 (JSON.stringify + ::jsonb)", async () => {
      const row = makeGenerationTaskRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await createGenerationTask(createInput);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("::jsonb");
      // The 5th parameter (index 4) should be the JSON-stringified params
      expect(params[4]).toBe(JSON.stringify(sampleParams));
    });

    it("snake_case 映射", async () => {
      const row = makeGenerationTaskRow({
        analysis_task_id: "TASK_XYZ",
        prompt_snapshot: "prompt text",
        negative_prompt_snapshot: "negative text",
        model_name: "stable-diffusion",
        result_asset_id: null,
        error_message: null,
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await createGenerationTask({
        ...createInput,
        analysisTaskId: "TASK_XYZ",
        promptSnapshot: "prompt text",
        negativePromptSnapshot: "negative text",
        modelName: "stable-diffusion",
      });

      expect(task.analysisTaskId).toBe("TASK_XYZ");
      expect(task.promptSnapshot).toBe("prompt text");
      expect(task.negativePromptSnapshot).toBe("negative text");
      expect(task.modelName).toBe("stable-diffusion");
      expect(task.resultAssetId).toBeNull();
      expect(task.errorMessage).toBeNull();
    });
  });

  describe("findGenerationTaskById", () => {
    it("找到记录", async () => {
      const row = makeGenerationTaskRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await findGenerationTaskById("GEN_001");

      expect(task).not.toBeNull();
      expect(task!.id).toBe("GEN_001");
      expect(task!.analysisTaskId).toBe("TASK_001");
      expect(task!.params).toEqual(sampleParams);
    });

    it("未找到返回 null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const task = await findGenerationTaskById("NON_EXISTENT");

      expect(task).toBeNull();
    });
  });

  describe("updateGenerationTask", () => {
    it("更新状态", async () => {
      const row = makeGenerationTaskRow({ status: "processing" });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await updateGenerationTask("GEN_001", {
        status: "processing",
      });

      expect(task.status).toBe("processing");
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("UPDATE generation_tasks SET");
      expect(sql).toContain("status = $1");
      expect(sql).toContain("updated_at = NOW()");
      expect(sql).toContain("WHERE id = $2");
      expect(params).toEqual(["processing", "GEN_001"]);
    });

    it("完成并关联 Asset", async () => {
      const row = makeGenerationTaskRow({
        status: "completed",
        result_asset_id: "RESULT_ASSET_001",
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await updateGenerationTask("GEN_001", {
        status: "completed",
        resultAssetId: "RESULT_ASSET_001",
      });

      expect(task.status).toBe("completed");
      expect(task.resultAssetId).toBe("RESULT_ASSET_001");
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("result_asset_id = $");
      expect(params).toContain("RESULT_ASSET_001");
      expect(params[params.length - 1]).toBe("GEN_001");
    });

    it("失败时记录 errorMessage", async () => {
      const row = makeGenerationTaskRow({
        status: "failed",
        error_message: "API rate limit exceeded",
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const task = await updateGenerationTask("GEN_001", {
        status: "failed",
        errorMessage: "API rate limit exceeded",
      });

      expect(task.status).toBe("failed");
      expect(task.errorMessage).toBe("API rate limit exceeded");
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("error_message = $");
      expect(params).toContain("API rate limit exceeded");
    });

    it("未找到记录抛出异常", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        updateGenerationTask("NON_EXISTENT", { status: "failed" })
      ).rejects.toThrow("GenerationTask not found: NON_EXISTENT");
    });

    it("columnMap 完整性", async () => {
      const row = makeGenerationTaskRow({
        status: "completed",
        result_asset_id: "ASSET_R",
        error_message: null,
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await updateGenerationTask("GEN_001", {
        status: "completed",
        resultAssetId: "ASSET_R",
        errorMessage: null,
      });

      const [sql, params] = mockQuery.mock.calls[0];
      // All 3 fields mapped
      expect(sql).toContain("status = $1");
      expect(sql).toContain("result_asset_id = $2");
      expect(sql).toContain("error_message = $3");
      expect(sql).toContain("WHERE id = $4");
      expect(params).toHaveLength(4);
      expect(params).toEqual(["completed", "ASSET_R", null, "GEN_001"]);
    });
  });
});
