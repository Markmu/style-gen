import { templates, generationTasks, assets } from "@/lib/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGenerateId } = vi.hoisted(() => ({
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

// Mock Drizzle db with chainable API.
// select 链（from -> leftJoin* -> where -> orderBy -> limit -> as）共用一个 thenable chain，
// await 链时通过 mockRows 解析行数据（plan-01 列表联查 / 详情 / 候选查询均走该链）。
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockWhere = vi.fn();
const mockLeftJoin = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockAs = vi.fn();
const mockRows = vi.fn();

/** LATERAL / 子查询在 mock 下的稳定替身（.as() 的返回值） */
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

const mockDeleteWhere = vi.fn();
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));
const mockUpdateSet = vi.fn(() => ({
  where: vi.fn(() => ({ returning: mockReturning })),
}));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/db/schema", async (importOriginal) => {
  return await importOriginal();
});

vi.mock("@/lib/template-parser", () => ({
  extractVariables: vi.fn((content: string) =>
    content.includes("{{")
      ? [{ name: "var1", defaultValue: "" }]
      : []
  ),
  mergeTemplateVariables: vi.fn((content: string, providedVariables?: Array<{ name: string; defaultValue: string }>) =>
    providedVariables && providedVariables.length > 0
      ? providedVariables.filter((variable) => content.includes(`{{${variable.name}}}`))
      : content.includes("{{")
        ? [{ name: "var1", defaultValue: "" }]
        : []
  ),
}));

import {
  createTemplate,
  findByName,
  findAllByUserId,
  findById,
  deleteTemplate,
  updateTemplate,
  duplicateTemplate,
  findStyleMemoryDetail,
  setRepresentativeResult,
  listRepresentativeCandidates,
} from "@/lib/repositories/template-repository";

const NOW = new Date("2025-01-01T00:00:00Z");

function makeTemplateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "TPL_001",
    name: "My Template",
    content: "Hello {{name}}!",
    variables: [{ name: "name", defaultValue: "" }],
    sourceAssetId: null,
    sourceImageUrl: null,
    // plan-01 新增列（架构 §7.2 StyleMemoryRecord）
    description: null,
    retainedRules: [] as string[],
    negativeConstraints: [] as string[],
    styleTokens: [] as string[],
    enhancementHints: [] as string[],
    verificationStatus: "pending_verification",
    representativeGenerationTaskId: null,
    sourceGenerationTaskId: null,
    userId: "USER_001",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

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

/** 取最近一次 where 调用的完整条件，渲染为带占位符的 SQL 文本 */
function lastWhereSql(): { sql: string; params: unknown[] } {
  const dialect = new PgDialect();
  const lastCall = mockWhere.mock.calls.at(-1);
  return dialect.sqlToQuery(lastCall?.[0] as never);
}

describe("template-repository", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockValues.mockClear();
    mockReturning.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockLeftJoin.mockClear();
    mockOrderBy.mockClear();
    mockLimit.mockClear();
    mockAs.mockClear();
    mockRows.mockReset();
    mockDelete.mockClear();
    mockDeleteWhere.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("TPL_001");

    mockSelect.mockImplementation(() => ({ from: mockFrom }));
    mockFrom.mockImplementation(() => queryChain);
    mockLeftJoin.mockImplementation(() => queryChain);
    mockWhere.mockImplementation(() => queryChain);
    mockOrderBy.mockImplementation(() => queryChain);
    mockLimit.mockImplementation(() => queryChain);
    mockAs.mockImplementation(() => SUBQUERY_STUB);
  });

  describe("createTemplate", () => {
    it("正常创建模板", async () => {
      const row = makeTemplateRow();
      mockReturning.mockResolvedValueOnce([row]);

      const template = await createTemplate("USER_001", {
        name: "My Template",
        content: "Hello {{name}}!",
      });

      expect(template).toEqual({
        id: "TPL_001",
        name: "My Template",
        content: "Hello {{name}}!",
        variables: [{ name: "name", defaultValue: "" }],
        sourceAssetId: null,
        sourceImageUrl: null,
        description: null,
        retainedRules: [],
        negativeConstraints: [],
        styleTokens: [],
        enhancementHints: [],
        verificationStatus: "pending_verification",
        representativeGenerationTaskId: null,
        sourceGenerationTaskId: null,
        userId: "USER_001",
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(mockValues.mock.calls[0][0]).not.toHaveProperty("sourceAnalysisTaskId");
    });

    it("保存模板时写入关联引用图", async () => {
      const row = makeTemplateRow({
        sourceAssetId: "ASSET_001",
        sourceImageUrl: "https://cdn.example.com/reference.png",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const template = await createTemplate("USER_001", {
        name: "My Template",
        content: "Hello {{name}}!",
        sourceAssetId: "ASSET_001",
        sourceImageUrl: "https://cdn.example.com/reference.png",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAssetId: "ASSET_001",
          sourceImageUrl: "https://cdn.example.com/reference.png",
        })
      );
      expect(template.sourceImageUrl).toBe("https://cdn.example.com/reference.png");
    });

    it("保存请求提供 variables 时保留默认值", async () => {
      const variables = [
        { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" },
      ];
      const row = makeTemplateRow({ variables });
      mockReturning.mockResolvedValueOnce([row]);

      await createTemplate("USER_001", {
        name: "My Template",
        content: "Hello {{subject}}!",
        variables,
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          variables,
        })
      );
    });
  });

  // ─── plan-01: createTemplate 新增列读写与状态派生 ───────────────────────

  describe("createTemplate (plan-01)", () => {
    it("写入 description 与规则四元组，representative 非空派生 user_verified", async () => {
      const row = makeTemplateRow({
        description: "Editorial glass study",
        retainedRules: ["rim light"],
        negativeConstraints: ["no text"],
        styleTokens: ["glass"],
        enhancementHints: ["macro lens"],
        representativeGenerationTaskId: "GEN_009",
        verificationStatus: "user_verified",
      });
      mockReturning.mockResolvedValueOnce([row]);

      const template = await createTemplate("USER_001", {
        name: "My Template",
        content: "Hello {{name}}!",
        description: "Editorial glass study",
        retainedRules: ["rim light"],
        negativeConstraints: ["no text"],
        styleTokens: ["glass"],
        enhancementHints: ["macro lens"],
        representativeGenerationTaskId: "GEN_009",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Editorial glass study",
          retainedRules: ["rim light"],
          negativeConstraints: ["no text"],
          styleTokens: ["glass"],
          enhancementHints: ["macro lens"],
          representativeGenerationTaskId: "GEN_009",
          verificationStatus: "user_verified",
        })
      );
      expect(template.verificationStatus).toBe("user_verified");
      expect(template.representativeGenerationTaskId).toBe("GEN_009");
      expect(template.retainedRules).toEqual(["rim light"]);
      expect(template.description).toBe("Editorial glass study");
    });

    it("不带 representative 时派生 pending_verification 且引用为空", async () => {
      mockReturning.mockResolvedValueOnce([makeTemplateRow()]);

      const template = await createTemplate("USER_001", {
        name: "My Template",
        content: "Hello {{name}}!",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationStatus: "pending_verification",
          representativeGenerationTaskId: null,
        })
      );
      expect(template.verificationStatus).toBe("pending_verification");
    });

    it("规则数组缺省时落空数组默认值", async () => {
      mockReturning.mockResolvedValueOnce([makeTemplateRow()]);

      await createTemplate("USER_001", {
        name: "My Template",
        content: "Hello {{name}}!",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          retainedRules: [],
          negativeConstraints: [],
          styleTokens: [],
          enhancementHints: [],
          description: null,
        })
      );
    });
  });

  describe("findByName", () => {
    it("找到同名模板", async () => {
      mockRows.mockResolvedValueOnce([makeTemplateRow()]);

      const result = await findByName("USER_001", "My Template");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("TPL_001");
      expect(result!.name).toBe("My Template");
    });

    it("未找到返回 null", async () => {
      mockRows.mockResolvedValueOnce([]);

      const result = await findByName("USER_001", "Nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findAllByUserId", () => {
    function makeListRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "TPL_001",
        name: "My Template",
        verificationStatus: "pending_verification",
        retainedRules: [] as string[],
        variableCount: 1,
        sourceImageUrl: null,
        representativeImageUrl: null,
        lastUsedAt: null,
        updatedAt: NOW,
        sortTs: NOW,
        createdAt: NOW,
        ...overrides,
      };
    }

    it("返回分页结果并映射 StyleMemoryListItem（无游标）", async () => {
      mockRows.mockResolvedValueOnce([
        makeListRow({
          id: "TPL_001",
          verificationStatus: "user_verified",
          retainedRules: ["rim light", "low key", "glass texture"],
          representativeImageUrl: "https://cdn.example.com/rep.webp",
          lastUsedAt: new Date("2025-02-01T00:00:00Z"),
          updatedAt: new Date("2025-03-01T00:00:00Z"),
        }),
        makeListRow({ id: "TPL_002" }),
      ]);

      const result = await findAllByUserId("USER_001", { limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: "TPL_001",
        name: "My Template",
        verificationStatus: "user_verified",
        retainedRulesPreview: ["rim light", "low key"],
        variableCount: 1,
        sourceImageUrl: null,
        representativeImageUrl: "https://cdn.example.com/rep.webp",
        lastUsedAt: "2025-02-01T00:00:00.000Z",
        updatedAt: "2025-03-01T00:00:00.000Z",
      });
      // 无使用时 lastUsedAt 为 null，预览为空数组（AC-01）
      expect(result.items[1].lastUsedAt).toBeNull();
      expect(result.items[1].retainedRulesPreview).toEqual([]);
      expect(result.items[1].representativeImageUrl).toBeNull();
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("hasMore 为 true 时返回 nextCursor（末条 (sortTs, id) 双键编码）", async () => {
      const rows = Array.from({ length: 3 }, (_, i) =>
        makeListRow({
          id: `TPL_00${i + 1}`,
          sortTs: new Date(Date.parse("2025-06-15T10:00:00Z") - i * 1000),
          createdAt: new Date(Date.parse("2025-06-15T10:00:00Z") - i * 1000),
        })
      );
      mockRows.mockResolvedValueOnce(rows);

      const result = await findAllByUserId("USER_001", { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(
        `${rows[1].sortTs.toISOString()}::TPL_002`
      );
    });

    it("合法游标解码为 (sortTs, id) 双键 keyset 条件，非法游标返回空结果", async () => {
      mockRows.mockResolvedValueOnce([]);

      await findAllByUserId("USER_001", {
        cursor: "2025-06-15T10:00:00.000Z::TPL_09",
        limit: 10,
      });

      const params = lastWhereParams();
      const cursorTime = Date.parse("2025-06-15T10:00:00.000Z");
      expect(
        params.some(
          (p) => p instanceof Date && p.getTime() === cursorTime
        )
      ).toBe(true);
      expect(params).toContain("TPL_09");

      mockRows.mockResolvedValueOnce([]);
      const invalid = await findAllByUserId("USER_001", {
        cursor: "not-a-cursor",
        limit: 10,
      });
      expect(invalid).toEqual({ items: [], hasMore: false, nextCursor: null });
    });
  });

  // ─── plan-01: findAllByUserId 列表联查（架构 §6.1） ──────────────────────

  describe("findAllByUserId (plan-01)", () => {
    it("verificationStatus 筛选参与 WHERE（白名单值），未传时不加状态条件", async () => {
      mockRows.mockResolvedValueOnce([]);

      await findAllByUserId("USER_001", {
        verificationStatus: "user_verified",
        limit: 10,
      });

      let params = lastWhereParams();
      expect(params).toContain("USER_001");
      expect(params).toContain("user_verified");

      mockRows.mockResolvedValueOnce([]);
      await findAllByUserId("USER_001", { limit: 10 });

      params = lastWhereParams();
      expect(params).toContain("USER_001");
      expect(params).not.toContain("user_verified");
      expect(params).not.toContain("pending_verification");
    });

    it("search 谓词覆盖七路 ILIKE（名称/说明/四组规则数组/变量名与标签）", async () => {
      mockRows.mockResolvedValueOnce([]);

      await findAllByUserId("USER_001", { search: " rim light ", limit: 10 });

      const { sql: sqlText, params } = lastWhereSql();
      // trim 后的单一子串模式
      expect(params).toContain("%rim light%");
      // 架构 §6.1：name OR description OR array_to_string(×4) OR 变量聚合子查询，共 7 路
      expect((sqlText.match(/ilike/g) ?? []).length).toBe(7);
      expect((sqlText.match(/array_to_string/g) ?? []).length).toBe(4);
      // 变量聚合：coalesce(label, name)，匹配变量名与标签
      expect(sqlText).toContain("->>'label'");
      expect(sqlText).toContain("->>'name'");
      expect(sqlText).toContain("string_agg");
      expect(sqlText).toContain("jsonb_array_elements");
      // 不匹配 defaultValue 内容与 JSON 键名（防假阳性）
      expect(sqlText).not.toContain("defaultValue");
      expect(sqlText).not.toContain("default_value");
    });

    it("列表联查包含 usage 聚合与代表结果 JOIN（架构 §6.1 / ADR-4）", async () => {
      mockRows.mockResolvedValueOnce([]);

      await findAllByUserId("USER_001", { limit: 10 });

      // LATERAL 聚合子查询从 generation_tasks 取 max(created_at)/count(*)
      expect(mockFrom).toHaveBeenCalledWith(generationTasks);
      // 子查询以 .as() 挂入主查询
      expect(mockAs).toHaveBeenCalled();
      // 主查询从 templates 出发；LEFT JOIN 至少 3 个（usage lateral + rep + 代表结果 assets）
      expect(mockFrom).toHaveBeenCalledWith(templates);
      expect(mockLeftJoin.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("排序使用 COALESCE(last_used, updated_at) DESC, id DESC 双键", async () => {
      mockRows.mockResolvedValueOnce([]);

      await findAllByUserId("USER_001", { limit: 10 });

      const orderArgs = mockOrderBy.mock.calls.at(-1) ?? [];
      expect(orderArgs.length).toBe(2);
      const dialect = new PgDialect();
      const firstOrderSql = dialect.sqlToQuery(orderArgs[0] as never).sql;
      expect(firstOrderSql.toLowerCase()).toContain("coalesce");
    });
  });

  describe("findById", () => {
    it("找到模板详情", async () => {
      mockRows.mockResolvedValueOnce([makeTemplateRow()]);

      const result = await findById("TPL_001", "USER_001");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("TPL_001");
      expect(result!.content).toBe("Hello {{name}}!");
      expect(result!.variables).toEqual([{ name: "name", defaultValue: "" }]);
    });

    it("未找到返回 null", async () => {
      mockRows.mockResolvedValueOnce([]);

      const result = await findById("NON_EXISTENT", "USER_001");

      expect(result).toBeNull();
    });
  });

  describe("deleteTemplate", () => {
    it("成功Delete模板", async () => {
      mockDeleteWhere.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        deleteTemplate("TPL_001", "USER_001")
      ).resolves.not.toThrow();
    });

    it("未找到时抛出异常", async () => {
      mockDeleteWhere.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        deleteTemplate("NON_EXISTENT", "USER_001")
      ).rejects.toThrow("Template not found or not owned by user: NON_EXISTENT");
    });
  });

  describe("updateTemplate", () => {
    it("仅更新 variables 时使用 existing.content 合并默认值", async () => {
      const variables = [
        { name: "name", defaultValue: "Alice", label: "Name", sourceField: "subject" },
      ];
      mockRows.mockResolvedValueOnce([makeTemplateRow()]);
      mockReturning.mockResolvedValueOnce([makeTemplateRow({ variables })]);

      const result = await updateTemplate("TPL_001", "USER_001", {
        variables,
      });

      expect(result.variables).toEqual(variables);
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.variables).toEqual(variables);
    });

    it("可更新模板关联引用图", async () => {
      mockRows.mockResolvedValueOnce([makeTemplateRow()]);
      mockReturning.mockResolvedValueOnce([
        makeTemplateRow({
          sourceAssetId: "ASSET_002",
          sourceImageUrl: "https://cdn.example.com/updated.png",
        }),
      ]);

      const result = await updateTemplate("TPL_001", "USER_001", {
        sourceAssetId: "ASSET_002",
        sourceImageUrl: "https://cdn.example.com/updated.png",
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.sourceAssetId).toBe("ASSET_002");
      expect(setArg.sourceImageUrl).toBe("https://cdn.example.com/updated.png");
      expect(result.sourceImageUrl).toBe("https://cdn.example.com/updated.png");
    });
  });

  // ─── plan-01: updateTemplate 规则变更回退（架构 §6.4 / ADR-1） ──────────

  describe("updateTemplate (plan-01)", () => {
    function verifiedRow(overrides: Partial<Record<string, unknown>> = {}) {
      return makeTemplateRow({
        verificationStatus: "user_verified",
        retainedRules: ["rule a", "rule b"],
        negativeConstraints: ["no text"],
        representativeGenerationTaskId: "GEN_009",
        ...overrides,
      });
    }

    it("retainedRules 实质变化 → 回退 pending_verification 且保留代表结果引用", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({
          retainedRules: ["rule a", "rule c"],
          verificationStatus: "pending_verification",
        }),
      ]);

      const result = await updateTemplate("TPL_001", "USER_001", {
        retainedRules: ["rule a", "rule c"],
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.retainedRules).toEqual(["rule a", "rule c"]);
      expect(setArg.verificationStatus).toBe("pending_verification");
      // 代表结果引用保留不清除（§6.4）
      expect(setArg).not.toHaveProperty("representativeGenerationTaskId");
      expect(result.verificationStatus).toBe("pending_verification");
    });

    it("negativeConstraints 实质变化同样触发回退", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({
          negativeConstraints: ["no text", "no watermark"],
          verificationStatus: "pending_verification",
        }),
      ]);

      await updateTemplate("TPL_001", "USER_001", {
        negativeConstraints: ["no text", "no watermark"],
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.negativeConstraints).toEqual(["no text", "no watermark"]);
      expect(setArg.verificationStatus).toBe("pending_verification");
    });

    it("仅改序不回退（ruleSetsChanged 集合语义）", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({ retainedRules: ["rule b", "rule a"] }),
      ]);

      const result = await updateTemplate("TPL_001", "USER_001", {
        retainedRules: ["rule b", "rule a"],
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.retainedRules).toEqual(["rule b", "rule a"]);
      expect(setArg.verificationStatus).toBeUndefined();
      expect(result.verificationStatus).toBe("user_verified");
    });

    it("仅空白差异（trim）不回退", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({ retainedRules: [" rule a ", "rule b"] }),
      ]);

      await updateTemplate("TPL_001", "USER_001", {
        retainedRules: [" rule a ", "rule b"],
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.retainedRules).toEqual([" rule a ", "rule b"]);
      expect(setArg.verificationStatus).toBeUndefined();
    });

    it("description 更新写入但不触发回退", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({ description: "new desc" }),
      ]);

      await updateTemplate("TPL_001", "USER_001", {
        description: "new desc",
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.description).toBe("new desc");
      expect(setArg.verificationStatus).toBeUndefined();
    });

    it("content 更新不触发回退（验证只对规则集合成立）", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({ content: "Hello {{updated}}!" }),
      ]);

      await updateTemplate("TPL_001", "USER_001", {
        content: "Hello {{updated}}!",
      });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.content).toBe("Hello {{updated}}!");
      expect(setArg.verificationStatus).toBeUndefined();
    });

    it("规则集合未提供时不写规则列、不回退", async () => {
      mockRows.mockResolvedValueOnce([verifiedRow()]);
      mockReturning.mockResolvedValueOnce([
        verifiedRow({ name: "Renamed" }),
      ]);

      await updateTemplate("TPL_001", "USER_001", { name: "Renamed" });

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg).not.toHaveProperty("retainedRules");
      expect(setArg).not.toHaveProperty("negativeConstraints");
      expect(setArg.verificationStatus).toBeUndefined();
    });
  });

  // ─── plan-01: duplicateTemplate 复制边界（架构 §6.4） ───────────────────

  describe("duplicateTemplate (plan-01)", () => {
    it("复制 description、规则四元组与 sourceGenerationTaskId，不复制代表结果，状态固定 pending_verification", async () => {
      const existing = makeTemplateRow({
        description: "Editorial glass study",
        retainedRules: ["rim light"],
        negativeConstraints: ["no text"],
        styleTokens: ["glass"],
        enhancementHints: ["macro lens"],
        sourceGenerationTaskId: "GEN_001",
        representativeGenerationTaskId: "GEN_009",
        verificationStatus: "user_verified",
      });
      mockRows.mockResolvedValueOnce([existing]); // findById
      mockRows.mockResolvedValueOnce([]); // findByName("(copy)") 冲突检查
      mockReturning.mockResolvedValueOnce([
        makeTemplateRow({
          id: "TPL_002",
          name: "My Template (copy)",
          description: "Editorial glass study",
          retainedRules: ["rim light"],
          negativeConstraints: ["no text"],
          styleTokens: ["glass"],
          enhancementHints: ["macro lens"],
          sourceGenerationTaskId: "GEN_001",
        }),
      ]);

      const duplicate = await duplicateTemplate("TPL_001", "USER_001");

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          content: existing.content,
          variables: existing.variables,
          description: "Editorial glass study",
          retainedRules: ["rim light"],
          negativeConstraints: ["no text"],
          styleTokens: ["glass"],
          enhancementHints: ["macro lens"],
          sourceAssetId: existing.sourceAssetId,
          sourceImageUrl: existing.sourceImageUrl,
          sourceGenerationTaskId: "GEN_001",
          // 复制边界：不携带验证字段（§6.4）
          representativeGenerationTaskId: null,
          verificationStatus: "pending_verification",
        })
      );
      expect(duplicate.verificationStatus).toBe("pending_verification");
      expect(duplicate.representativeGenerationTaskId).toBeNull();
      expect(duplicate.sourceGenerationTaskId).toBe("GEN_001");
    });

    it("名称冲突时沿用既有 (copy N) 去重算法", async () => {
      const existing = makeTemplateRow({ name: "My Template" });
      mockRows.mockResolvedValueOnce([existing]); // findById
      mockRows.mockResolvedValueOnce([makeTemplateRow()]); // "My Template (copy)" 已存在
      mockRows.mockResolvedValueOnce([]); // "My Template (copy 2)" 空闲
      mockReturning.mockResolvedValueOnce([
        makeTemplateRow({ id: "TPL_003", name: "My Template (copy 2)" }),
      ]);

      await duplicateTemplate("TPL_001", "USER_001");

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My Template (copy 2)" })
      );
    });
  });

  // ─── plan-01: findStyleMemoryDetail 详情组装（架构 §6.2） ────────────────

  describe("findStyleMemoryDetail (plan-01)", () => {
    function makeDetailRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        ...makeTemplateRow(),
        // 联查产物：来源迭代、代表结果、usage 聚合
        sourceIterationCreatedAt: null,
        representativeImageUrl: null,
        representativeCreatedAt: null,
        lastUsedAt: null,
        derivedIterationCount: 0,
        ...overrides,
      };
    }

    it("组装 StyleMemoryDetail：规则四元组、来源迭代、代表结果、usage", async () => {
      mockRows.mockResolvedValueOnce([
        makeDetailRow({
          description: "Editorial glass study",
          retainedRules: ["rim light"],
          negativeConstraints: ["no text"],
          styleTokens: ["glass"],
          enhancementHints: ["macro lens"],
          verificationStatus: "user_verified",
          representativeGenerationTaskId: "GEN_009",
          representativeImageUrl: "https://cdn.example.com/rep.webp",
          representativeCreatedAt: new Date("2024-12-05T00:00:00Z"),
          sourceGenerationTaskId: "GEN_001",
          sourceIterationCreatedAt: new Date("2024-12-01T00:00:00Z"),
          lastUsedAt: new Date("2025-01-15T00:00:00Z"),
          derivedIterationCount: 3,
        }),
      ]);

      const detail = await findStyleMemoryDetail("TPL_001", "USER_001");

      expect(detail).not.toBeNull();
      expect(detail).toMatchObject({
        id: "TPL_001",
        verificationStatus: "user_verified",
        description: "Editorial glass study",
        retainedRules: ["rim light"],
        negativeConstraints: ["no text"],
        styleTokens: ["glass"],
        enhancementHints: ["macro lens"],
        representativeGenerationTaskId: "GEN_009",
        sourceGenerationTask: { id: "GEN_001", createdAt: "2024-12-01T00:00:00.000Z" },
        representativeResult: {
          iterationId: "GEN_009",
          imageUrl: "https://cdn.example.com/rep.webp",
          createdAt: "2024-12-05T00:00:00.000Z",
        },
        usage: { lastUsedAt: "2025-01-15T00:00:00.000Z", derivedIterationCount: 3 },
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
    });

    it("读时防御降级：user_verified 且代表结果引用为空 → pending_verification（§6.2）", async () => {
      mockRows.mockResolvedValueOnce([
        makeDetailRow({
          verificationStatus: "user_verified",
          representativeGenerationTaskId: null,
        }),
      ]);

      const detail = await findStyleMemoryDetail("TPL_001", "USER_001");

      expect(detail).not.toBeNull();
      expect(detail!.verificationStatus).toBe("pending_verification");
      expect(detail!.representativeResult).toBeNull();
    });

    it("pending_verification 不因缺失代表结果而变化；无使用时 usage 为空值", async () => {
      mockRows.mockResolvedValueOnce([makeDetailRow()]);

      const detail = await findStyleMemoryDetail("TPL_001", "USER_001");

      expect(detail!.verificationStatus).toBe("pending_verification");
      expect(detail!.representativeResult).toBeNull();
      expect(detail!.sourceGenerationTask).toBeNull();
      expect(detail!.usage).toEqual({ lastUsedAt: null, derivedIterationCount: 0 });
    });

    it("未找到返回 null", async () => {
      mockRows.mockResolvedValueOnce([]);

      const detail = await findStyleMemoryDetail("NON_EXISTENT", "USER_001");

      expect(detail).toBeNull();
    });
  });

  // ─── plan-01: setRepresentativeResult 原子更新（架构 §6.4） ─────────────

  describe("setRepresentativeResult (plan-01)", () => {
    it("单条 UPDATE 原子写代表结果引用并置 user_verified", async () => {
      mockReturning.mockResolvedValueOnce([
        makeTemplateRow({
          representativeGenerationTaskId: "GEN_009",
          verificationStatus: "user_verified",
        }),
      ]);

      const updated = await setRepresentativeResult(
        "TPL_001",
        "USER_001",
        "GEN_009"
      );

      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.representativeGenerationTaskId).toBe("GEN_009");
      expect(setArg.verificationStatus).toBe("user_verified");
      expect(updated.representativeGenerationTaskId).toBe("GEN_009");
      expect(updated.verificationStatus).toBe("user_verified");
    });
  });

  // ─── plan-01: listRepresentativeCandidates 相关集查询（架构 §6.4） ───────

  describe("listRepresentativeCandidates (plan-01)", () => {
    function makeCandidateRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "GEN_001",
        imageUrl: "https://cdn.example.com/result.webp",
        promptSnapshot: "a beautiful mountain landscape",
        createdAt: NOW,
        ...overrides,
      };
    }

    it("映射 RepresentativeCandidate 并截断 promptSummary 为 120 字符", async () => {
      mockRows.mockResolvedValueOnce([
        makeCandidateRow({ id: "GEN_02", promptSnapshot: "x".repeat(200) }),
        makeCandidateRow({ id: "GEN_01", imageUrl: null }),
      ]);

      const result = await listRepresentativeCandidates("TPL_001", "USER_001");

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: "GEN_02",
        imageUrl: "https://cdn.example.com/result.webp",
        promptSummary: "x".repeat(120),
        createdAt: NOW.toISOString(),
      });
      expect(result.items[1].imageUrl).toBeNull();
      expect(result.nextCursor).toBeNull();
    });

    it("相关集条件：source_template_id 或 source_generation_task_id，completed 且有结果资产", async () => {
      mockRows.mockResolvedValueOnce([]);

      await listRepresentativeCandidates("TPL_001", "USER_001");

      const { sql: sqlText, params } = lastWhereSql();
      const lowerSql = sqlText.toLowerCase();
      expect(params).toContain("completed");
      expect(params).toContain("TPL_001");
      expect(params).toContain("USER_001");
      expect(lowerSql).toContain("source_template_id");
      expect(lowerSql).toContain("source_generation_task_id");
      expect(lowerSql).toContain("result_asset_id");
      expect(lowerSql).toContain("is not null");
      // 候选图来自 assets 联查
      const joinedTables = mockLeftJoin.mock.calls.map((call) => call[0]);
      expect(joinedTables).toContain(assets);
    });

    it("游标分页：created_at DESC 双键游标，limit 探测下一页", async () => {
      const rows = Array.from({ length: 3 }, (_, i) =>
        makeCandidateRow({
          id: `GEN_0${i + 1}`,
          createdAt: new Date(Date.parse("2025-06-15T10:00:00Z") - i * 1000),
        })
      );
      mockRows.mockResolvedValueOnce(rows);

      const result = await listRepresentativeCandidates(
        "TPL_001",
        "USER_001",
        null,
        2
      );

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe(
        `${rows[1].createdAt.toISOString()}::GEN_02`
      );
      expect(mockLimit).toHaveBeenLastCalledWith(3);
    });
  });
});
