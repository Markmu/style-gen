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
  upsertAsset,
} from "@/lib/repositories/asset-repository";

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
});
