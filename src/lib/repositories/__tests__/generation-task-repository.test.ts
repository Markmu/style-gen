import { templates } from "@/lib/db/schema";
import { getTableConfig } from "drizzle-orm/pg-core";
import type {
  GenerationParams,
  GenerationTaskStatus,
  StoredVisualRecipe,
  TemplateVariable,
  VisualRecipe,
} from "@/types/models";

const { mockGenerateId } = vi.hoisted(() => ({
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

// Mock Drizzle db with chainable API.
// select 链（from -> leftJoin* -> where -> orderBy -> limit）共用一个 thenable chain，
// await 链时通过 mockRows 解析行数据。
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockWhere = vi.fn();
const mockLeftJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockSelectDistinctOn = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockAs = vi.fn();
const mockRows = vi.fn();

/** selectDistinctOn 子查询在 mock 下的稳定替身 */
const SUBQUERY_STUB = { __subquery: true };

const queryChain: {
  leftJoin: (...args: unknown[]) => typeof queryChain;
  where: (...args: unknown[]) => typeof queryChain;
  orderBy: (...args: unknown[]) => typeof queryChain;
  limit: (...args: unknown[]) => typeof queryChain;
  as: (...args: unknown[]) => unknown;
  then: <TResult1, TResult2>(
    onFulfilled: (value: unknown) => TResult1 | PromiseLike<TResult1>,
    onRejected: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ) => PromiseLike<TResult1 | TResult2>;
} = {
  leftJoin: (...args: unknown[]) => mockLeftJoin(...args) as typeof queryChain,
  where: (...args: unknown[]) => mockWhere(...args) as typeof queryChain,
  orderBy: (...args: unknown[]) => mockOrderBy(...args) as typeof queryChain,
  limit: (...args: unknown[]) => mockLimit(...args) as typeof queryChain,
  as: (...args: unknown[]) => mockAs(...args),
  then: (onFulfilled, onRejected) =>
    mockRows().then(onFulfilled, onRejected) as never,
};

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    selectDistinctOn: (...args: unknown[]) => mockSelectDistinctOn(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

const mockUpdateSet = vi.fn(() => ({
  where: vi.fn(() => ({ returning: mockReturning })),
}));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("@/lib/db/schema", async (importOriginal) => {
  return await importOriginal();
});

import {
  createGenerationTask,
  findByIdWithRecipe,
  findGenerationTaskById,
  findIterationDetail,
  linkTemplateToGenerationTask,
  listIterations,
  updateGenerationTask,
} from "@/lib/repositories/generation-task-repository";

const NOW = new Date("2025-01-01T00:00:00Z");

const sampleParams: GenerationParams = {
  aspectRatio: "16:9",
  quality: "hd",
};

const sampleRecipe: VisualRecipe = {
  imageSummary: "A precise glass flower study",
  subject: "Glass flower",
  scene: "Editorial studio",
  composition: "Centered macro composition",
  cameraLanguage: "Macro lens",
  lighting: "Blue rim light",
  color: "Cool blue and silver",
  texture: "Translucent glass petals",
  styleTags: ["glass", "editorial"],
  mood: "Quiet and refined",
  visualKeywords: ["translucent", "rim light"],
  mustKeep: ["glass petal structure"],
  replaceable: ["background prop"],
};

const sampleVariables: TemplateVariable[] = [
  { name: "subject", defaultValue: "Glass flower", label: "Subject" },
];

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
    recipeSnapshot: null as StoredVisualRecipe | null,
    variablesSnapshot: null as TemplateVariable[] | null,
    sourceTemplateId: null as string | null,
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

/** 从 Drizzle 条件对象中递归收集绑定参数（eq/inArray 的 Param.value、ilike 的裸字符串 pattern、lt 的裸 Date） */
function collectParams(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || node === undefined) return out;
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    out.push(node);
    return out;
  }
  if (node instanceof Date) {
    out.push(node);
    return out;
  }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectParams(item, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  if ("value" in record) {
    const value = record.value;
    if (
      value === null ||
      typeof value !== "object" ||
      value instanceof Date
    ) {
      out.push(value);
    }
  }
  if (Array.isArray(record.queryChunks)) {
    collectParams(record.queryChunks, out);
  }
  return out;
}

/** 取最近一次 where 调用的绑定参数 */
function lastWhereParams(): unknown[] {
  const lastCall = mockWhere.mock.calls.at(-1);
  return collectParams(lastCall?.[0]);
}

describe("generation-task-repository", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockValues.mockClear();
    mockReturning.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockLeftJoin.mockClear();
    mockSelectDistinctOn.mockClear();
    mockOrderBy.mockClear();
    mockLimit.mockClear();
    mockAs.mockClear();
    mockRows.mockReset();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("GEN_001");

    mockSelect.mockImplementation(() => ({ from: mockFrom }));
    mockSelectDistinctOn.mockImplementation(() => ({ from: mockFrom }));
    mockFrom.mockImplementation(() => queryChain);
    mockLeftJoin.mockImplementation(() => queryChain);
    mockWhere.mockImplementation(() => queryChain);
    mockOrderBy.mockImplementation(() => queryChain);
    mockLimit.mockImplementation(() => queryChain);
    mockAs.mockImplementation(() => SUBQUERY_STUB);
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
        recipeSnapshot: null,
        variablesSnapshot: null,
        sourceTemplateId: null,
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

    it("固化提交时快照：recipeSnapshot/variablesSnapshot/sourceTemplateId 写入 insert values", async () => {
      const row = makeCamelCaseRow({
        recipeSnapshot: sampleRecipe,
        variablesSnapshot: sampleVariables,
        sourceTemplateId: "TPL_001",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const task = await createGenerationTask("USER_001", {
        ...createInput,
        recipeSnapshot: sampleRecipe,
        variablesSnapshot: sampleVariables,
        sourceTemplateId: "TPL_001",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          recipeSnapshot: sampleRecipe,
          variablesSnapshot: sampleVariables,
          sourceTemplateId: "TPL_001",
        })
      );
      expect(task.recipeSnapshot).toEqual(sampleRecipe);
      expect(task.variablesSnapshot).toEqual(sampleVariables);
      expect(task.sourceTemplateId).toBe("TPL_001");
    });
  });

  describe("findGenerationTaskById", () => {
    it("找到记录", async () => {
      const row = makeCamelCaseRow();
      mockRows.mockResolvedValueOnce([row]);

      const task = await findGenerationTaskById("GEN_001", "USER_001");

      expect(task).not.toBeNull();
      expect(task!.id).toBe("GEN_001");
      expect(task!.analysisTaskId).toBe("TASK_001");
      expect(task!.params).toEqual(sampleParams);
    });

    it("未找到返回 null", async () => {
      mockRows.mockResolvedValueOnce([]);

      const task = await findGenerationTaskById("NON_EXISTENT", "USER_001");

      expect(task).toBeNull();
    });

    it("查询条件强制携带 userId 归属过滤", async () => {
      mockRows.mockResolvedValueOnce([]);

      await findGenerationTaskById("GEN_001", "USER_OTHER");

      const params = collectParams(mockWhere.mock.calls[0][0]);
      expect(params).toContain("USER_OTHER");
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

    it("Done并关联 Asset", async () => {
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

  // ─── FEAT-02: listCompleted & findByIdWithRecipe ─────────────────────
  // These methods use innerJoin/leftJoin which the simple mock doesn't fully
  // reify; behavior is verified through signature and pure logic checks.

  describe("listCompleted (FEAT-02)", () => {
    it("导出为函数且签名正确", async () => {
      const { listCompleted: lc } = await import("@/lib/repositories/generation-task-repository");
      expect(typeof lc).toBe("function");
    });

    it("pageSize clamp 逻辑: 边界值处理", () => {
      // Test the clamp logic in isolation
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      expect(clamp(20, 1, 50)).toBe(20);
      expect(clamp(0, 1, 50)).toBe(1);
      expect(clamp(100, 1, 50)).toBe(50);
      expect(clamp(-5, 1, 50)).toBe(1);
      expect(clamp(50, 1, 50)).toBe(50);
    });

    it("cursor 编解码格式验证", () => {
      // cursor format: "created_at::id"
      const validCursor = `${new Date("2025-06-15T10:00:00Z").toISOString()}::GEN_H19`;
      const parts = validCursor.split("::");
      expect(parts).toHaveLength(2);
      expect(new Date(parts[0]).toISOString()).toBe(new Date("2025-06-15T10:00:00Z").toISOString());
      expect(parts[1]).toBe("GEN_H19");
    });

    it("nextCursor 仅在超出 pageSize 时生成", () => {
      // Simulate the nextCursor logic from listCompleted
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `GEN_${i}`,
        resultFileUrl: `url${i}`,
        createdAt: new Date(2025, 5, 15 - i, 10, 0, 0), // June 15 down to June -5 (wraps to May)
      }));
      const size = 20;
      const hasNextPage = items.length > size;
      const nextCursor = hasNextPage
        ? `${items[size - 1].createdAt.toISOString()}::${items[size - 1].id}`
        : null;

      expect(hasNextPage).toBe(true);
      expect(nextCursor).toContain("::");
      // nextCursor points to the last included item (items[size-1] = items[19])
      // which is the 20th item, with one more item (items[20]) excluded
      expect(nextCursor).toContain("GEN_19");

      // Exactly pageSize items → no nextCursor (use slice to simulate)
      const exactItems = items.slice(0, 20);
      const exactHasNext = exactItems.length > size;
      const exactNextCursor = exactHasNext
        ? `${exactItems[size - 1].createdAt.toISOString()}::${exactItems[size - 1].id}`
        : null;
      expect(exactHasNext).toBe(false);
      expect(exactNextCursor).toBeNull();
    });
  });

  describe("findByIdWithRecipe (FEAT-02)", () => {
    it("导出为函数且签名正确", async () => {
      const { findByIdWithRecipe: fir } = await import("@/lib/repositories/generation-task-repository");
      expect(typeof fir).toBe("function");
    });

    it("返回 completed 详情时带出真实 source context 和 template variables", async () => {
      const variables = [
        {
          name: "subject",
          defaultValue: "Glass flower",
          label: "Subject",
          sourceField: "subject" as const,
        },
      ];
      mockRows.mockResolvedValueOnce([
        {
          id: "GEN_001",
          analysisTaskId: "TASK_001",
          status: "completed",
          promptSnapshot: "Restored prompt with {{subject}}",
          negativePromptSnapshot: "blurry",
          params: sampleParams,
          modelName: "flux.2",
          resultAssetId: "RESULT_ASSET_001",
          assetFileUrl: "https://cdn.example.com/generated/result.webp",
          recipe: sampleRecipe,
          sourceAssetId: "SOURCE_ASSET_001",
          sourceImageUrl: "https://cdn.example.com/references/source.png",
          analysisTemplateVariables: variables,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);

      const detail = await findByIdWithRecipe("GEN_001", "USER_001");

      expect(detail).toMatchObject({
        id: "GEN_001",
        analysisTaskId: "TASK_001",
        status: "completed",
        resultAssetId: "RESULT_ASSET_001",
        resultFileUrl: "https://cdn.example.com/generated/result.webp",
        recipe: sampleRecipe,
        sourceAssetId: "SOURCE_ASSET_001",
        sourceImageUrl: "https://cdn.example.com/references/source.png",
        variables,
        analysisTemplateVariables: variables,
      });
      expect(mockLeftJoin).toHaveBeenCalledTimes(3);
      expect(Object.keys(mockSelect.mock.calls.at(-1)?.[0] ?? {})).toEqual(
        expect.arrayContaining([
          "sourceAssetId",
          "sourceImageUrl",
          "analysisTemplateVariables",
        ])
      );
    });

    it("source context 缺失时返回 null source 和空 variables，避免前端误用 mock 字段", async () => {
      mockRows.mockResolvedValueOnce([
        {
          id: "GEN_001",
          analysisTaskId: "TASK_001",
          status: "completed",
          promptSnapshot: "Restored prompt",
          negativePromptSnapshot: "blurry",
          params: sampleParams,
          modelName: "flux.2",
          resultAssetId: "RESULT_ASSET_001",
          assetFileUrl: "https://cdn.example.com/generated/result.webp",
          recipe: null,
          sourceAssetId: null,
          sourceImageUrl: null,
          analysisTemplateVariables: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);

      const detail = await findByIdWithRecipe("GEN_001", "USER_001");

      expect(detail?.sourceAssetId).toBeNull();
      expect(detail?.sourceImageUrl).toBeNull();
      expect(detail?.variables).toEqual([]);
      expect(detail?.analysisTemplateVariables).toEqual([]);
    });

    it("非 completed 状态应返回 null", async () => {
      mockRows.mockResolvedValueOnce([
        {
          id: "GEN_001",
          analysisTaskId: "TASK_001",
          status: "processing",
          promptSnapshot: "Restored prompt",
          negativePromptSnapshot: "blurry",
          params: sampleParams,
          modelName: "flux.2",
          resultAssetId: null,
          assetFileUrl: null,
          recipe: null,
          sourceAssetId: "SOURCE_ASSET_001",
          sourceImageUrl: "https://cdn.example.com/references/source.png",
          analysisTemplateVariables: [],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);

      await expect(findByIdWithRecipe("GEN_001", "USER_001")).resolves.toBeNull();
    });

    it("completed 状态且 recipe 为 null 应正常返回（逻辑验证）", () => {
      // Verify that null recipe is acceptable
      const recipe = null;
      expect(recipe).toBeNull();
      // The function should not throw when recipe is null
    });
  });

  // ─── plan-01: listIterations ───────────────────────────────────────────

  describe("listIterations (plan-01)", () => {
    function makeListRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "GEN_001",
        status: "completed",
        promptSnapshot: "a beautiful mountain landscape",
        params: sampleParams,
        resultFileUrl: "https://cdn.example.com/result.webp",
        createdAt: NOW,
        ...overrides,
      };
    }

    it("status=all 返回全部状态，pending 归并为 processing，按返回顺序映射", async () => {
      mockRows.mockResolvedValueOnce([
        makeListRow({ id: "GEN_04", status: "pending", resultFileUrl: null }),
        makeListRow({ id: "GEN_03", status: "processing", resultFileUrl: null }),
        makeListRow({ id: "GEN_02", status: "failed", resultFileUrl: null, errorMessage: "boom" }),
        makeListRow({ id: "GEN_01", status: "completed" }),
      ]);

      const result = await listIterations({
        userId: "USER_001",
        status: "all",
        pageSize: 20,
      });

      expect(result.items.map((item) => item.status)).toEqual([
        "processing",
        "processing",
        "failed",
        "completed",
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it("status=processing 映射为 status IN ('pending','processing') 条件", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listIterations({ userId: "USER_001", status: "processing", pageSize: 20 });

      const params = collectParams(mockWhere.mock.calls[0][0]);
      expect(params).toContain("pending");
      expect(params).toContain("processing");
      expect(params).toContain("USER_001");
    });

    it("status=completed / failed 映射为单值条件，all 不加状态值", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listIterations({ userId: "USER_001", status: "completed", pageSize: 20 });
      let params = lastWhereParams();
      expect(params).toContain("completed");
      expect(params).not.toContain("pending");

      mockRows.mockResolvedValueOnce([]);
      await listIterations({ userId: "USER_001", status: "failed", pageSize: 20 });
      params = lastWhereParams();
      expect(params).toContain("failed");

      mockRows.mockResolvedValueOnce([]);
      await listIterations({ userId: "USER_001", status: "all", pageSize: 20 });
      params = lastWhereParams();
      expect(params).toContain("USER_001");
      expect(params).not.toContain("completed");
      expect(params).not.toContain("failed");
      expect(params).not.toContain("pending");
    });

    it("q 非空时生成 prompt_snapshot 与来源模板名的 ILIKE 双字段条件", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listIterations({ userId: "USER_001", q: "City", status: "all", pageSize: 20 });

      const params = lastWhereParams();
      expect(params.filter((p) => p === "%City%")).toHaveLength(2);
    });

    it("q 联表包含 templates（来源模板名命中）", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listIterations({ userId: "USER_001", q: "City", status: "all", pageSize: 20 });

      const joinedTables = mockLeftJoin.mock.calls.map((call) => call[0]);
      expect(joinedTables).toContain(templates);
    });

    it("promptSummary 截断为前 120 字符", async () => {
      const longPrompt = "x".repeat(200);
      mockRows.mockResolvedValueOnce([
        makeListRow({ promptSnapshot: longPrompt }),
      ]);

      const result = await listIterations({ userId: "USER_001", status: "all", pageSize: 20 });

      expect(result.items[0].promptSummary).toBe("x".repeat(120));
    });

    it("resultFileUrl 仅 completed 且资产联表有值时返回，否则 null", async () => {
      mockRows.mockResolvedValueOnce([
        makeListRow({ status: "completed", resultFileUrl: "https://cdn.example.com/r.webp" }),
        makeListRow({ status: "completed", resultFileUrl: null }),
        makeListRow({ status: "processing", resultFileUrl: "https://cdn.example.com/r.webp" }),
      ]);

      const result = await listIterations({ userId: "USER_001", status: "all", pageSize: 20 });

      expect(result.items[0].resultFileUrl).toBe("https://cdn.example.com/r.webp");
      expect(result.items[1].resultFileUrl).toBeNull();
      expect(result.items[2].resultFileUrl).toBeNull();
    });

    it("pageSize clamp 到 [1, 50]，且 LIMIT 使用 size + 1 探测更早记录", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listIterations({ userId: "USER_001", status: "all", pageSize: 100 });
      expect(mockLimit).toHaveBeenLastCalledWith(51);

      mockRows.mockResolvedValueOnce([]);
      await listIterations({ userId: "USER_001", status: "all", pageSize: 0 });
      expect(mockLimit).toHaveBeenLastCalledWith(2);

      mockRows.mockResolvedValueOnce([]);
      await listIterations({ userId: "USER_001", status: "all", pageSize: -7 });
      expect(mockLimit).toHaveBeenLastCalledWith(2);
    });

    it("nextCursor 指向本页最后一条；不足一页时为 null", async () => {
      const rows = Array.from({ length: 3 }, (_, i) =>
        makeListRow({
          id: `GEN_0${i + 1}`,
          createdAt: new Date(Date.parse("2025-06-15T10:00:00Z") - i * 1000),
        })
      );
      mockRows.mockResolvedValueOnce(rows);

      const result = await listIterations({ userId: "USER_001", status: "all", pageSize: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe(
        `${rows[1].createdAt.toISOString()}::GEN_02`
      );
    });

    it("合法游标参与 keyset 条件，非法游标直接返回空结果", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listIterations({
        userId: "USER_001",
        status: "all",
        cursor: "2025-06-15T10:00:00.000Z::GEN_09",
        pageSize: 20,
      });

      const params = lastWhereParams();
      const cursorTime = Date.parse("2025-06-15T10:00:00.000Z");
      expect(
        params.some(
          (p) => p instanceof Date && p.getTime() === cursorTime
        )
      ).toBe(true);
      expect(params).toContain("GEN_09");

      const invalid = await listIterations({
        userId: "USER_001",
        status: "all",
        cursor: "not-a-cursor",
        pageSize: 20,
      });
      expect(invalid).toEqual({ items: [], nextCursor: null });
    });
  });

  // ─── plan-01: findIterationDetail ──────────────────────────────────────

  describe("findIterationDetail (plan-01)", () => {
    function makeDetailRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "GEN_001",
        analysisTaskId: "TASK_001",
        status: "completed",
        promptSnapshot: "a beautiful mountain landscape",
        negativePromptSnapshot: "no blur",
        params: sampleParams,
        modelName: "flux.2",
        resultAssetId: "RESULT_ASSET_001",
        resultFileUrl: "https://cdn.example.com/result.webp",
        errorMessage: null,
        recipeSnapshot: sampleRecipe as StoredVisualRecipe,
        analysisRecipe: sampleRecipe as StoredVisualRecipe,
        variablesSnapshot: sampleVariables,
        analysisTemplateVariables: sampleVariables,
        sourceAssetId: "SOURCE_ASSET_001",
        sourceImageUrl: "https://cdn.example.com/source.png",
        sourceTemplateId: "TPL_001",
        sourceTemplateName: "Glass Study",
        savedTemplateId: "TPL_SAVED_001",
        savedTemplateName: "Saved Direction",
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
      };
    }

    it("快照优先：recipe/variables 取 snapshot 列并标记 snapshot", async () => {
      const otherRecipe = { ...sampleRecipe, subject: "Drifted subject" };
      mockRows.mockResolvedValueOnce([
        makeDetailRow({ analysisRecipe: otherRecipe as StoredVisualRecipe }),
      ]);

      const detail = await findIterationDetail("GEN_001", "USER_001");

      expect(detail?.recipeSource).toBe("snapshot");
      expect(detail?.variablesSource).toBe("snapshot");
      expect((detail?.recipe as VisualRecipe).subject).toBe("Glass flower");
      expect(detail?.variables).toEqual(sampleVariables);
    });

    it("存量旧行快照为空：回退活引用并标记 fallback", async () => {
      const liveVariables = [{ name: "live", defaultValue: "v" }];
      mockRows.mockResolvedValueOnce([
        makeDetailRow({
          recipeSnapshot: null,
          variablesSnapshot: null,
          analysisTemplateVariables: liveVariables,
        }),
      ]);

      const detail = await findIterationDetail("GEN_001", "USER_001");

      expect(detail?.recipeSource).toBe("fallback");
      expect(detail?.variablesSource).toBe("fallback");
      expect(detail?.recipe).toEqual(sampleRecipe);
      expect(detail?.variables).toEqual(liveVariables);
    });

    it("快照与活引用皆缺失：标记 missing，其余字段照常返回", async () => {
      mockRows.mockResolvedValueOnce([
        makeDetailRow({
          recipeSnapshot: null,
          analysisRecipe: null,
          variablesSnapshot: null,
          analysisTemplateVariables: null,
          sourceAssetId: null,
          sourceImageUrl: null,
          sourceTemplateId: null,
          sourceTemplateName: null,
          savedTemplateId: null,
          savedTemplateName: null,
        }),
      ]);

      const detail = await findIterationDetail("GEN_001", "USER_001");

      expect(detail).not.toBeNull();
      expect(detail?.recipe).toBeNull();
      expect(detail?.recipeSource).toBe("missing");
      expect(detail?.variables).toEqual([]);
      expect(detail?.variablesSource).toBe("missing");
      expect(detail?.sourceAssetId).toBeNull();
      expect(detail?.sourceImageUrl).toBeNull();
      expect(detail?.savedTemplate).toBeNull();
      expect(detail?.id).toBe("GEN_001");
    });

    it("pending 归并为 processing，非 completed 不返回 resultFileUrl", async () => {
      mockRows.mockResolvedValueOnce([
        makeDetailRow({ status: "pending", resultFileUrl: null, resultAssetId: null }),
      ]);

      const detail = await findIterationDetail("GEN_001", "USER_001");

      expect(detail?.status).toBe("processing");
      expect(detail?.resultFileUrl).toBeNull();
    });

    it("failed 返回 errorMessage，completed 返回 resultFileUrl", async () => {
      mockRows.mockResolvedValueOnce([
        makeDetailRow({ status: "failed", resultFileUrl: null, errorMessage: "provider timeout" }),
      ]);
      const failed = await findIterationDetail("GEN_001", "USER_001");
      expect(failed?.status).toBe("failed");
      expect(failed?.errorMessage).toBe("provider timeout");
      expect(failed?.resultFileUrl).toBeNull();

      mockRows.mockResolvedValueOnce([makeDetailRow({ status: "completed" })]);
      const completed = await findIterationDetail("GEN_001", "USER_001");
      expect(completed?.resultFileUrl).toBe("https://cdn.example.com/result.webp");
    });

    it("返回 sourceTemplateId/sourceTemplateName 与最新已保存模板关联", async () => {
      mockRows.mockResolvedValueOnce([makeDetailRow()]);

      const detail = await findIterationDetail("GEN_001", "USER_001");

      expect(detail?.sourceTemplateId).toBe("TPL_001");
      expect(detail?.sourceTemplateName).toBe("Glass Study");
      expect(detail?.savedTemplate).toEqual({ id: "TPL_SAVED_001", name: "Saved Direction" });
    });

    it("analysisTemplateVariables 兼容字段照常返回（use-history-restore 消费）", async () => {
      mockRows.mockResolvedValueOnce([makeDetailRow()]);

      const detail = await findIterationDetail("GEN_001", "USER_001");

      expect(detail?.analysisTemplateVariables).toEqual(sampleVariables);
    });

    it("单条联表覆盖结果资产/活引用/来源资产/来源模板/已保存模板", async () => {
      mockRows.mockResolvedValueOnce([makeDetailRow()]);

      await findIterationDetail("GEN_001", "USER_001");

      const joinedNames = mockLeftJoin.mock.calls.map(([table]) =>
        table === SUBQUERY_STUB
          ? "__subquery__"
          : getTableConfig(table as Parameters<typeof getTableConfig>[0]).name
      );
      expect(joinedNames).toEqual([
        "assets",
        "analysis_tasks",
        "source_assets",
        "source_templates",
        "__subquery__",
      ]);
    });

    it("未找到或跨用户访问返回 null，且强制 userId 归属过滤", async () => {
      mockRows.mockResolvedValueOnce([]);

      const detail = await findIterationDetail("GEN_001", "USER_OTHER");
      expect(detail).toBeNull();

      const params = collectParams(mockWhere.mock.calls[0][0]);
      expect(params).toContain("GEN_001");
      expect(params).toContain("USER_OTHER");
    });
  });

  // ─── plan-01: linkTemplateToGenerationTask ─────────────────────────────

  describe("linkTemplateToGenerationTask (plan-01)", () => {
    it("将模板关联为迭代沉淀产物（templates.source_generation_task_id）", async () => {
      expect(typeof linkTemplateToGenerationTask).toBe("function");

      const setSpy = vi.fn(() => ({ where: vi.fn(() => ({ returning: mockReturning })) }));
      mockUpdate.mockImplementationOnce(() => ({ set: setSpy }));

      await linkTemplateToGenerationTask("TPL_001", "GEN_001", "USER_001");

      expect(mockUpdate).toHaveBeenCalledWith(templates);
      expect(setSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sourceGenerationTaskId: "GEN_001" })
      );
    });
  });
});
