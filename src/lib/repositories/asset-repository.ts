import { and, eq } from "drizzle-orm";
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
    userId: row.userId,
    createdAt: row.createdAt,
  };
}

/** 创建一条 Asset 记录 */
export async function createAsset(
  userId: string,
  data: Omit<Asset, "id" | "createdAt" | "userId">
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
      userId,
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

/**
 * plan-03（ADR-6 / 架构 §6.6）: 按 id + userId 查询当前用户拥有的 Asset。
 * 已有资产分析分支的唯一元数据来源：跨用户/不存在统一返回 null（不泄露存在性），
 * 不改变现有 findAssetById 内部消费方。
 */
export async function findAssetByIdForUser(
  id: string,
  userId: string
): Promise<Asset | null> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.userId, userId)));
  if (rows.length === 0) return null;
  return rowToAsset(rows[0]);
}

/** Upsert Asset（使用前端预分配的 ULID） */
export async function upsertAsset(
  userId: string,
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
      userId,
    })
    .onConflictDoUpdate({
      target: assets.id,
      set: {
        fileUrl: data.fileUrl,
        width: data.width,
        height: data.height,
        mimeType: data.mimeType,
        userId,
      },
    })
    .returning();
  return rowToAsset(row);
}
