import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type { Asset, AssetType } from "@/types/models";

type AssetRow = typeof assets.$inferSelect;

/** 数据库行 → Asset 领域对象 */
function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    type: row.type as AssetType,
    fileUrl: row.fileUrl,
    thumbnailUrl: row.thumbnailUrl,
    width: row.width,
    height: row.height,
    mimeType: row.mimeType,
    createdAt: row.createdAt,
  };
}

/** 创建一条 Asset 记录 */
export async function createAsset(
  data: Omit<Asset, "id" | "createdAt">
): Promise<Asset> {
  const id = generateId();
  const [row] = await db
    .insert(assets)
    .values({
      id,
      type: data.type,
      fileUrl: data.fileUrl,
      thumbnailUrl: data.thumbnailUrl,
      width: data.width,
      height: data.height,
      mimeType: data.mimeType,
    })
    .returning();
  return rowToAsset(row);
}

/** 按 ID 查询 Asset */
export async function findAssetById(id: string): Promise<Asset | null> {
  const rows = await db.select().from(assets).where(eq(assets.id, id));
  if (rows.length === 0) return null;
  return rowToAsset(rows[0]);
}

/** Upsert Asset（使用前端预分配的 ULID） */
export async function upsertAsset(
  id: string,
  data: { fileUrl: string; width: number; height: number; mimeType: string }
): Promise<Asset> {
  const [row] = await db
    .insert(assets)
    .values({
      id,
      type: "reference",
      fileUrl: data.fileUrl,
      width: data.width,
      height: data.height,
      mimeType: data.mimeType,
    })
    .onConflictDoUpdate({
      target: assets.id,
      set: {
        fileUrl: data.fileUrl,
        width: data.width,
        height: data.height,
        mimeType: data.mimeType,
      },
    })
    .returning();
  return rowToAsset(row);
}
