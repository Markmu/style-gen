import type { AssetType } from "@/types/models";

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

import { createAsset, findAssetById } from "@/lib/repositories/asset-repository";

// Helper to build a fake database row
function makeAssetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ASSET_ID_001",
    type: "reference" as AssetType,
    file_url: "https://cdn.example.com/image.png",
    thumbnail_url: "https://cdn.example.com/thumb.png",
    width: 1920,
    height: 1080,
    mime_type: "image/png",
    created_at: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("asset-repository", () => {
  beforeEach(() => {
    mockQuery.mockReset();
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
      const row = makeAssetRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const asset = await createAsset(inputData);

      expect(asset).toEqual({
        id: "ASSET_ID_001",
        type: "reference",
        fileUrl: "https://cdn.example.com/image.png",
        thumbnailUrl: "https://cdn.example.com/thumb.png",
        width: 1920,
        height: 1080,
        mimeType: "image/png",
        createdAt: new Date("2025-01-01T00:00:00Z"),
      });
    });

    it("SQL 参数正确", async () => {
      const row = makeAssetRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      await createAsset(inputData);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO assets");
      expect(sql).toContain("RETURNING *");
      expect(params).toEqual([
        "ASSET_ID_001",
        "reference",
        "https://cdn.example.com/image.png",
        "https://cdn.example.com/thumb.png",
        1920,
        1080,
        "image/png",
      ]);
    });

    it("snake_case 到 camelCase 映射", async () => {
      const row = makeAssetRow({
        file_url: "https://cdn.example.com/file.jpg",
        thumbnail_url: "https://cdn.example.com/thumb.jpg",
        mime_type: "image/jpeg",
        created_at: new Date("2025-06-15T12:00:00Z"),
      });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const asset = await createAsset({
        ...inputData,
        fileUrl: "https://cdn.example.com/file.jpg",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        mimeType: "image/jpeg",
      });

      expect(asset.fileUrl).toBe("https://cdn.example.com/file.jpg");
      expect(asset.thumbnailUrl).toBe("https://cdn.example.com/thumb.jpg");
      expect(asset.mimeType).toBe("image/jpeg");
      expect(asset.createdAt).toEqual(new Date("2025-06-15T12:00:00Z"));
    });

    it("thumbnailUrl 为 null", async () => {
      const row = makeAssetRow({ thumbnail_url: null });
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const asset = await createAsset({
        ...inputData,
        thumbnailUrl: null,
      });

      expect(asset.thumbnailUrl).toBeNull();
      const params = mockQuery.mock.calls[0][1];
      expect(params[3]).toBeNull();
    });
  });

  describe("findAssetById", () => {
    it("找到记录", async () => {
      const row = makeAssetRow();
      mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const asset = await findAssetById("ASSET_ID_001");

      expect(asset).not.toBeNull();
      expect(asset!.id).toBe("ASSET_ID_001");
      expect(asset!.fileUrl).toBe("https://cdn.example.com/image.png");
      expect(asset!.mimeType).toBe("image/png");
    });

    it("未找到返回 null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const asset = await findAssetById("NON_EXISTENT");

      expect(asset).toBeNull();
    });

    it("SQL 正确", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await findAssetById("ASSET_ID_001");

      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT * FROM assets WHERE id = $1",
        ["ASSET_ID_001"]
      );
    });
  });
});
