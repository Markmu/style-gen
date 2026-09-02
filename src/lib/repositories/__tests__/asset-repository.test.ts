import type { AssetType } from "@/types/models";

const { mockGenerateId } = vi.hoisted(() => ({
  mockGenerateId: vi.fn(),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: mockGenerateId,
}));

// Mock Drizzle db with chainable API
const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({
  returning: mockReturning,
  onConflictDoUpdate: mockOnConflictDoUpdate,
}));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/lib/db/schema", async (importOriginal) => {
  return await importOriginal();
});

import {
  createAsset,
  findAssetById,
  findAssetByIdForUser,
  upsertAsset,
} from "@/lib/repositories/asset-repository";

/** 从 Drizzle 条件对象中递归收集绑定参数（eq 的 Param.value） */
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
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectParams(item, out);
    return out;
  }
  const record = node as Record<string, unknown>;
  if ("value" in record) {
    const value = record.value;
    if (value === null || typeof value !== "object") {
      out.push(value);
    }
  }
  if (Array.isArray(record.queryChunks)) {
    collectParams(record.queryChunks, out);
  }
  return out;
}

function makeCamelCaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ASSET_ID_001",
    type: "reference" as AssetType,
    fileUrl: "https://cdn.example.com/image.png",
    thumbnailUrl: "https://cdn.example.com/thumb.png",
    width: 1920,
    height: 1080,
    mimeType: "image/png",
    userId: "USER_001",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("asset-repository", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockValues.mockClear();
    mockReturning.mockClear();
    mockOnConflictDoUpdate.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockGenerateId.mockReset();
    mockGenerateId.mockReturnValue("ASSET_ID_001");
  });

  describe("createAsset", () => {
    const inputData = {
      type: "reference" as AssetType,
      fileUrl: "https://cdn.example.com/image.png",
      thumbnailUrl: "https://cdn.example.com/thumb.png",
      width: 1920,
      height: 1080,
      mimeType: "image/png",
    };

    it("正常创建", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      const asset = await createAsset("USER_001", inputData);

      expect(asset).toEqual({
        id: "ASSET_ID_001",
        type: "reference",
        fileUrl: "https://cdn.example.com/image.png",
        thumbnailUrl: "https://cdn.example.com/thumb.png",
        width: 1920,
        height: 1080,
        mimeType: "image/png",
        userId: "USER_001",
        createdAt: new Date("2025-01-01T00:00:00Z"),
      });
    });

    it("调用 db.insert 并传入正确参数", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      await createAsset("USER_001", inputData);

      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledWith({
        id: "ASSET_ID_001",
        type: "reference",
        fileUrl: "https://cdn.example.com/image.png",
        thumbnailUrl: "https://cdn.example.com/thumb.png",
        width: 1920,
        height: 1080,
        mimeType: "image/png",
        userId: "USER_001",
      });
    });

    it("thumbnailUrl 为 null", async () => {
      const row = makeCamelCaseRow({ thumbnailUrl: null });
      mockReturning.mockResolvedValueOnce([row]);

      const asset = await createAsset("USER_001", {
        ...inputData,
        thumbnailUrl: null,
      });

      expect(asset.thumbnailUrl).toBeNull();
    });
  });

  describe("findAssetById", () => {
    it("找到记录", async () => {
      const row = makeCamelCaseRow();
      mockWhere.mockResolvedValueOnce([row]);

      const asset = await findAssetById("ASSET_ID_001");

      expect(asset).not.toBeNull();
      expect(asset!.id).toBe("ASSET_ID_001");
      expect(asset!.fileUrl).toBe("https://cdn.example.com/image.png");
      expect(asset!.mimeType).toBe("image/png");
    });

    it("未找到返回 null", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const asset = await findAssetById("NON_EXISTENT");

      expect(asset).toBeNull();
    });
  });

  describe("upsertAsset", () => {
    it("正常 upsert", async () => {
      const row = makeCamelCaseRow();
      mockReturning.mockResolvedValueOnce([row]);

      const asset = await upsertAsset("USER_001", "ASSET_ID_001", {
        fileUrl: "https://cdn.example.com/image.png",
        width: 1920,
        height: 1080,
        mimeType: "image/png",
      });

      expect(asset.id).toBe("ASSET_ID_001");
      expect(asset.type).toBe("reference");
      expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ─── plan-03: findAssetByIdForUser（ADR-6 / §4 已有资产分析） ───────────

  describe("findAssetByIdForUser (plan-03)", () => {
    it("返回归属当前用户的 Asset（含完整元数据供服务端派生）", async () => {
      const generatedRow = makeCamelCaseRow({
        id: "ASSET_GEN_001",
        type: "generated",
        fileUrl: "https://cdn.example.com/generated/result.webp",
        thumbnailUrl: null,
        width: 1024,
        height: 576,
        mimeType: "image/webp",
      });
      mockWhere.mockResolvedValueOnce([generatedRow]);

      const asset = await findAssetByIdForUser("ASSET_GEN_001", "USER_001");

      expect(asset).not.toBeNull();
      expect(asset!.id).toBe("ASSET_GEN_001");
      expect(asset!.type).toBe("generated");
      expect(asset!.fileUrl).toBe("https://cdn.example.com/generated/result.webp");
      expect(asset!.mimeType).toBe("image/webp");
      expect(asset!.width).toBe(1024);
      expect(asset!.height).toBe(576);
    });

    it("未找到返回 null", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const asset = await findAssetByIdForUser("NON_EXISTENT", "USER_001");

      expect(asset).toBeNull();
    });

    it("查询条件同时绑定 asset id 与 userId（跨用户资产不可见，不泄露存在性）", async () => {
      mockWhere.mockResolvedValueOnce([]);

      await findAssetByIdForUser("ASSET_GEN_001", "USER_OTHER");

      expect(mockWhere).toHaveBeenCalledTimes(1);
      const params = collectParams(mockWhere.mock.calls[0][0]);
      expect(params).toContain("ASSET_GEN_001");
      expect(params).toContain("USER_OTHER");
    });
  });
});
