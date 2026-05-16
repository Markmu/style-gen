import type {
  AnalysisTaskStatus,
  VisualRecipe,
} from "@/types/models";

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
  createAnalysisTask,
  findAnalysisTaskById,
  updateAnalysisTask,
} from "@/lib/repositories/analysis-task-repository";

const NOW = new Date("2025-01-01T00:00:00Z");

function makeCamelCaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "TASK_001",
    sourceAssetId: "ASSET_001",
    status: "pending" as AnalysisTaskStatus,
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
    provider: "gemini" as const,
    externalId: null,
    modelName: null,
    userId: "USER_001",
    createdAt: NOW,
    updatedAt: NOW,
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
    mockInsert.mockClear();
    mockValues.mockClear();
    mockReturning.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("TASK_001");
  });

  describe("createAnalysisTask", () => {
    it("正常创建", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      const task = await createAnalysisTask("USER_001", { sourceAssetId: "ASSET_001" });

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
        analysisTemplateContent: null,
        analysisTemplateVariables: [],
        analysisTemplateStatus: null,
        analysisTemplateReason: null,
        provider: "gemini",
        externalId: null,
        modelName: null,
        userId: "USER_001",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it("传入正确的 values", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      await createAnalysisTask("USER_001", { sourceAssetId: "ASSET_001" });

      expect(mockValues).toHaveBeenCalledWith({
        id: "TASK_001",
        sourceAssetId: "ASSET_001",
        provider: "gemini",
        modelName: undefined,
        userId: "USER_001",
      });
    });
  });

  describe("findAnalysisTaskById", () => {
    it("找到记录", async () => {
      const row = makeCamelCaseRow();
      mockWhere.mockResolvedValueOnce([row]);

      const task = await findAnalysisTaskById("TASK_001", "USER_001");

      expect(task).not.toBeNull();
      expect(task!.id).toBe("TASK_001");
      expect(task!.sourceAssetId).toBe("ASSET_001");
    });

    it("未找到返回 null", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const task = await findAnalysisTaskById("NON_EXISTENT", "USER_001");

      expect(task).toBeNull();
    });

    it("recipe JSONB 自动解析", async () => {
      const row = makeCamelCaseRow({ recipe: sampleRecipe });
      mockWhere.mockResolvedValueOnce([row]);

      const task = await findAnalysisTaskById("TASK_001", "USER_001");

      expect(task!.recipe).toEqual(sampleRecipe);
      expect(task!.recipe!.styleTags).toEqual(["landscape", "nature"]);
    });

    it("自动模板字段 JSONB 自动解析并归一化数组", async () => {
      const row = makeCamelCaseRow({
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: [
          { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" },
        ],
        analysisTemplateStatus: "ready",
        analysisTemplateReason: null,
      });
      mockWhere.mockResolvedValueOnce([row]);

      const task = await findAnalysisTaskById("TASK_001", "USER_001");

      expect(task!.analysisTemplateContent).toBe("Create {{subject}}.");
      expect(task!.analysisTemplateVariables).toEqual([
        { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" },
      ]);
      expect(task!.analysisTemplateStatus).toBe("ready");
      expect(task!.analysisTemplateReason).toBeNull();
    });
  });

  describe("updateAnalysisTask", () => {
    it("更新单个字段", async () => {
      const row = makeCamelCaseRow({ status: "processing" });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await updateAnalysisTask("TASK_001", {
        status: "processing",
      });

      expect(task.status).toBe("processing");
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      // Verify set was called with status and updatedAt
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("processing");
      expect(setArg.updatedAt).toBeDefined();
    });

    it("更新多个字段", async () => {
      const row = makeCamelCaseRow({
        status: "completed",
        promptText: "generated prompt",
        negativePromptText: "no artifacts",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await updateAnalysisTask("TASK_001", {
        status: "completed",
        promptText: "generated prompt",
        negativePromptText: "no artifacts",
      });

      expect(task.status).toBe("completed");
      expect(task.promptText).toBe("generated prompt");
      expect(task.negativePromptText).toBe("no artifacts");

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("completed");
      expect(setArg.promptText).toBe("generated prompt");
      expect(setArg.negativePromptText).toBe("no artifacts");
    });

    it("recipe 字段正常传递", async () => {
      const row = makeCamelCaseRow({ recipe: sampleRecipe });
      mockReturning.mockResolvedValueOnce([row]);

      await updateAnalysisTask("TASK_001", { recipe: sampleRecipe });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.recipe).toEqual(sampleRecipe);
    });

    it("recipe 为 null", async () => {
      const row = makeCamelCaseRow({ recipe: null });
      mockReturning.mockResolvedValueOnce([row]);

      await updateAnalysisTask("TASK_001", { recipe: null });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.recipe).toBeNull();
    });

    it("自动模板字段正常传递", async () => {
      const variables = [
        { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" as const },
      ];
      const row = makeCamelCaseRow({
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: variables,
        analysisTemplateStatus: "ready",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await updateAnalysisTask("TASK_001", {
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: variables,
        analysisTemplateStatus: "ready",
        analysisTemplateReason: null,
      });

      expect(task.analysisTemplateVariables).toEqual(variables);
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.analysisTemplateContent).toBe("Create {{subject}}.");
      expect(setArg.analysisTemplateVariables).toEqual(variables);
      expect(setArg.analysisTemplateStatus).toBe("ready");
      expect(setArg.analysisTemplateReason).toBeNull();
    });

    it("未找到记录抛出异常", async () => {
      mockReturning.mockResolvedValueOnce([]);

      await expect(
        updateAnalysisTask("NON_EXISTENT", { status: "failed" })
      ).rejects.toThrow("AnalysisTask not found: NON_EXISTENT");
    });

    it("errorMessage 和 errorStage 正确传递", async () => {
      const row = makeCamelCaseRow({
        status: "failed",
        errorMessage: "timeout",
        errorStage: "llm",
      });
      mockReturning.mockResolvedValueOnce([row]);

      await updateAnalysisTask("TASK_001", {
        status: "failed",
        errorMessage: "timeout",
        errorStage: "llm",
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.status).toBe("failed");
      expect(setArg.errorMessage).toBe("timeout");
      expect(setArg.errorStage).toBe("llm");
    });
  });
});
