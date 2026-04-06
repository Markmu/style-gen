import type { GenerationParams, GenerationTaskStatus } from "@/types/models";

const { mockGenerateId } = vi.hoisted(() => ({
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

// Mock Drizzle db with chainable API
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockUpdateSet = vi.fn(() => ({
  where: vi.fn(() => ({ returning: mockReturning })),
}));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/db/schema", async (importOriginal) => {
  return await importOriginal();
});

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

function makeCamelCaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "GEN_001",
    analysisTaskId: "TASK_001",
    status: "pending" as GenerationTaskStatus,
    promptSnapshot: "a beautiful mountain landscape",
    negativePromptSnapshot: "no blur, no artifacts",
    params: sampleParams,
    modelName: "dall-e-3",
    provider: "fal" as const,
    externalId: null,
    resultAssetId: null,
    errorMessage: null,
    userId: "USER_001",
    createdAt: NOW,
    updatedAt: NOW,
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
    mockInsert.mockClear();
    mockValues.mockClear();
    mockReturning.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("GEN_001");
  });

  describe("createGenerationTask", () => {
    it("正常创建", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      const task = await createGenerationTask("USER_001", createInput);

      expect(task).toEqual({
        id: "GEN_001",
        analysisTaskId: "TASK_001",
        status: "pending",
        promptSnapshot: "a beautiful mountain landscape",
        negativePromptSnapshot: "no blur, no artifacts",
        params: sampleParams,
        modelName: "dall-e-3",
        provider: "fal",
        externalId: null,
        resultAssetId: null,
        errorMessage: null,
        userId: "USER_001",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it("params 直接传入（Drizzle 自动序列化 JSONB）", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      await createGenerationTask("USER_001", createInput);

      expect(mockValues).toHaveBeenCalledWith({
        id: "GEN_001",
        analysisTaskId: "TASK_001",
        promptSnapshot: "a beautiful mountain landscape",
        negativePromptSnapshot: "no blur, no artifacts",
        params: sampleParams,
        modelName: "dall-e-3",
        provider: "fal",
        userId: "USER_001",
      });
    });

    it("camelCase 字段映射", async () => {
      const row = makeCamelCaseRow({
        analysisTaskId: "TASK_XYZ",
        promptSnapshot: "prompt text",
        negativePromptSnapshot: "negative text",
        modelName: "stable-diffusion",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await createGenerationTask("USER_001", {
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
    });
  });

  describe("findGenerationTaskById", () => {
    it("找到记录", async () => {
      const row = makeCamelCaseRow();
      mockWhere.mockResolvedValueOnce([row]);

      const task = await findGenerationTaskById("GEN_001", "USER_001");

      expect(task).not.toBeNull();
      expect(task!.id).toBe("GEN_001");
      expect(task!.analysisTaskId).toBe("TASK_001");
      expect(task!.params).toEqual(sampleParams);
    });

    it("未找到返回 null", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const task = await findGenerationTaskById("NON_EXISTENT", "USER_001");

      expect(task).toBeNull();
    });
  });

  describe("updateGenerationTask", () => {
    it("更新状态", async () => {
      const row = makeCamelCaseRow({ status: "processing" });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await updateGenerationTask("GEN_001", {
        status: "processing",
      });

      expect(task.status).toBe("processing");
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("processing");
      expect(setArg.updatedAt).toBeDefined();
    });

    it("完成并关联 Asset", async () => {
      const row = makeCamelCaseRow({
        status: "completed",
        resultAssetId: "RESULT_ASSET_001",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await updateGenerationTask("GEN_001", {
        status: "completed",
        resultAssetId: "RESULT_ASSET_001",
      });

      expect(task.status).toBe("completed");
      expect(task.resultAssetId).toBe("RESULT_ASSET_001");
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.resultAssetId).toBe("RESULT_ASSET_001");
    });

    it("失败时记录 errorMessage", async () => {
      const row = makeCamelCaseRow({
        status: "failed",
        errorMessage: "API rate limit exceeded",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await updateGenerationTask("GEN_001", {
        status: "failed",
        errorMessage: "API rate limit exceeded",
      });

      expect(task.status).toBe("failed");
      expect(task.errorMessage).toBe("API rate limit exceeded");
    });

    it("未找到记录抛出异常", async () => {
      mockReturning.mockResolvedValueOnce([]);

      await expect(
        updateGenerationTask("NON_EXISTENT", { status: "failed" })
      ).rejects.toThrow("GenerationTask not found: NON_EXISTENT");
    });

    it("所有可更新字段正确传递", async () => {
      const row = makeCamelCaseRow({
        status: "completed",
        resultAssetId: "ASSET_R",
        errorMessage: null,
      });
      mockReturning.mockResolvedValueOnce([row]);

      await updateGenerationTask("GEN_001", {
        status: "completed",
        resultAssetId: "ASSET_R",
        errorMessage: null,
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("completed");
      expect(setArg.resultAssetId).toBe("ASSET_R");
      expect(setArg.errorMessage).toBeNull();
    });
  });
});
