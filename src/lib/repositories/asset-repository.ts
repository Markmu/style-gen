import { query } from "@/lib/db";
import { generateId } from "@/lib/ulid";
import type { Asset, AssetType } from "@/types/models";

/** 数据库行 → Asset 领域对象 */
function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    type: row.type,
    fileUrl: row.file_url,
    thumbnailUrl: row.thumbnail_url,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

interface AssetRow {
  id: string;
  type: AssetType;
  file_url: string;
  thumbnail_url: string | null;
  width: number;
  height: number;
  mime_type: string;
  created_at: Date;
}

/** 创建一条 Asset 记录 */
export async function createAsset(
  data: Omit<Asset, "id" | "createdAt">
): Promise<Asset> {
  const id = generateId();
  const result = await query<AssetRow>(
    `INSERT INTO assets (id, type, file_url, thumbnail_url, width, height, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, data.type, data.fileUrl, data.thumbnailUrl, data.width, data.height, data.mimeType]
  );
  return rowToAsset(result.rows[0]);
}

/** 按 ID 查询 Asset */
export async function findAssetById(id: string): Promise<Asset | null> {
  const result = await query<AssetRow>(
    "SELECT * FROM assets WHERE id = $1",
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToAsset(result.rows[0]);
}
