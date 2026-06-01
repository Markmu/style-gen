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
const mockLimit = vi.fn();
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere, orderBy: mockOrderBy }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
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
    userId: "USER_001",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("template-repository", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockValues.mockClear();
    mockReturning.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockDelete.mockClear();
    mockDeleteWhere.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("TPL_001");
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

  describe("findByName", () => {
    it("找到同名模板", async () => {
      const row = makeTemplateRow();
      mockWhere.mockResolvedValueOnce([row]);

      const result = await findByName("USER_001", "My Template");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("TPL_001");
      expect(result!.name).toBe("My Template");
    });

    it("未找到返回 null", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await findByName("USER_001", "Nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findAllByUserId", () => {
    it("返回分页结果（无游标）", async () => {
      const rows = [
        makeTemplateRow({ id: "TPL_001", createdAt: new Date("2025-01-02T00:00:00Z") }),
        makeTemplateRow({ id: "TPL_002", createdAt: new Date("2025-01-01T00:00:00Z") }),
      ];
      // select().from().where() -> need orderBy -> limit chain
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockLimit.mockResolvedValueOnce(rows);

      const result = await findAllByUserId("USER_001", { limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          sourceAssetId: null,
          sourceImageUrl: null,
        })
      );
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("hasMore 为 true 时返回 nextCursor", async () => {
      const rows = Array.from({ length: 11 }, (_, i) =>
        makeTemplateRow({
          id: `TPL_${String(i).padStart(3, "0")}`,
          createdAt: new Date(`2025-01-${String(10 - i).padStart(2, "0")}T00:00:00Z`),
        })
      );
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockLimit.mockResolvedValueOnce(rows);

      const result = await findAllByUserId("USER_001", { limit: 10 });

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("带游标查询", async () => {
      const rows = [makeTemplateRow()];
      mockWhere.mockReturnValue({ orderBy: mockOrderBy });
      mockLimit.mockResolvedValueOnce(rows);

      const cursor = "2025-01-01T00:00:00.000Z";
      await findAllByUserId("USER_001", { cursor, limit: 10 });

      // Verify the where clause was called with cursor condition
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe("findById", () => {
    it("找到模板详情", async () => {
      const row = makeTemplateRow();
      mockWhere.mockResolvedValueOnce([row]);

      const result = await findById("TPL_001", "USER_001");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("TPL_001");
      expect(result!.content).toBe("Hello {{name}}!");
      expect(result!.variables).toEqual([{ name: "name", defaultValue: "" }]);
    });

    it("未找到返回 null", async () => {
      mockWhere.mockResolvedValueOnce([]);

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
      mockWhere.mockResolvedValueOnce([makeTemplateRow()]);
      mockReturning.mockResolvedValueOnce([makeTemplateRow({ variables })]);

      const result = await updateTemplate("TPL_001", "USER_001", {
        variables,
      });

      expect(result.variables).toEqual(variables);
      const setArg = mockUpdateSet.mock.calls[0][0];
      expect(setArg.variables).toEqual(variables);
    });

    it("可更新模板关联引用图", async () => {
      mockWhere.mockResolvedValueOnce([makeTemplateRow()]);
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
});
