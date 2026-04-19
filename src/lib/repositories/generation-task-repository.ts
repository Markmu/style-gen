import { eq, sql, and, desc, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationTasks, assets, analysisTasks } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type {
  GenerationParams,
  GenerationTask,
  GenerationTaskStatus,
  ImageGenProviderName,
  VisualRecipe,
} from "@/types/models";

type GenerationTaskRow = typeof generationTasks.$inferSelect;

/** 数据库行 → GenerationTask 领域对象 */
function rowToGenerationTask(row: GenerationTaskRow): GenerationTask {
  return {
    id: row.id,
    analysisTaskId: row.analysisTaskId,
    status: row.status as GenerationTaskStatus,
    promptSnapshot: row.promptSnapshot,
    negativePromptSnapshot: row.negativePromptSnapshot,
    params: row.params,
    modelName: row.modelName,
    provider: row.provider as ImageGenProviderName,
    externalId: row.externalId,
    resultAssetId: row.resultAssetId,
    errorMessage: row.errorMessage,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 创建一条 pending 状态的 GenerationTask */
export async function createGenerationTask(
  userId: string,
  data: {
    analysisTaskId: string;
    promptSnapshot: string;
    negativePromptSnapshot: string;
    params: GenerationParams;
    modelName: string;
    provider?: ImageGenProviderName;
  }
): Promise<GenerationTask> {
  const id = generateId();
  const [row] = await db
    .insert(generationTasks)
    .values({
      id,
      analysisTaskId: data.analysisTaskId,
      promptSnapshot: data.promptSnapshot,
      negativePromptSnapshot: data.negativePromptSnapshot,
      params: data.params,
      modelName: data.modelName,
      provider: data.provider ?? "fal",
      userId,
    })
    .returning();
  return rowToGenerationTask(row);
}

/** 按 ID 查询 GenerationTask（需验证 userId 归属） */
export async function findGenerationTaskById(
  id: string,
  userId: string
): Promise<GenerationTask | null> {
  const rows = await db
    .select()
    .from(generationTasks)
    .where(
      and(eq(generationTasks.id, id), eq(generationTasks.userId, userId))
    );
  if (rows.length === 0) return null;
  return rowToGenerationTask(rows[0]);
}

/** 按 ID 查询 GenerationTask（不校验 userId，仅 Webhook 内部使用） */
export async function findGenerationTaskByIdInternal(
  id: string
): Promise<GenerationTask | null> {
  const rows = await db
    .select()
    .from(generationTasks)
    .where(eq(generationTasks.id, id));
  if (rows.length === 0) return null;
  return rowToGenerationTask(rows[0]);
}

/** 可更新的字段子集 */
type GenerationTaskUpdatable = Partial<
  Pick<
    GenerationTask,
    "status" | "resultAssetId" | "errorMessage" | "externalId"
  >
>;

/** 更新 GenerationTask */
export async function updateGenerationTask(
  id: string,
  updates: GenerationTaskUpdatable
): Promise<GenerationTask> {
  const setObj: Record<string, unknown> = {
    updatedAt: sql`NOW()`,
  };

  if (updates.status !== undefined) setObj.status = updates.status;
  if (updates.resultAssetId !== undefined)
    setObj.resultAssetId = updates.resultAssetId;
  if (updates.errorMessage !== undefined)
    setObj.errorMessage = updates.errorMessage;
  if (updates.externalId !== undefined) setObj.externalId = updates.externalId;

  const rows = await db
    .update(generationTasks)
    .set(setObj)
    .where(eq(generationTasks.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error(`GenerationTask not found: ${id}`);
  }

  return rowToGenerationTask(rows[0]);
}

// ─── FEAT-02: 历史面板相关方法 ────────────────────────────────────────

/** 历史面板列表项 */
export interface GenerationHistoryItem {
  id: string;
  resultFileUrl: string;
  createdAt: Date;
}

/** 历史恢复详情（含关联 Recipe） */
export interface GenerationTaskDetail {
  id: string;
  analysisTaskId: string;
  status: "completed";
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  resultAssetId: string;
  resultFileUrl: string;
  recipe?: VisualRecipe | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 列出用户已完成的生成任务（历史列表）
 * cursor 分页：基于 created_at + id 组合游标
 */
export async function listCompleted(
  userId: string,
  cursor: string | null,
  pageSize: number = 20
): Promise<{ items: GenerationHistoryItem[]; nextCursor: string | null }> {
  // clamp pageSize 到 [1, 50]
  const size = Math.max(1, Math.min(50, pageSize));

  const baseConditions = [
    eq(generationTasks.userId, userId),
    eq(generationTasks.status, "completed"),
  ];

  // cursor 解码：格式为 "created_at::id"
  if (cursor) {
    const parts = cursor.split("::");
    if (parts.length === 2) {
      const [cursorAt, _cursorId] = parts;
      // keyset 分页：取 created_at < cursorAt OR (created_at = cursorAt AND id > cursorId)
      // 简化实现：使用 created_at < cursorAt 作为主要条件，避免复杂 OR
      baseConditions.push(
        lt(generationTasks.createdAt, new Date(cursorAt))
      );
    }
    // 无效 cursor 视为无更多数据
  }

  const rows = await db
    .select({
      id: generationTasks.id,
      fileUrl: assets.fileUrl,
      createdAt: generationTasks.createdAt,
    })
    .from(generationTasks)
    .innerJoin(assets, eq(generationTasks.resultAssetId, assets.id))
    .where(and(...baseConditions))
    .orderBy(desc(generationTasks.createdAt), desc(generationTasks.id))
    .limit(size + 1); // 多查一条判断是否有下一页

  const items: GenerationHistoryItem[] = rows.slice(0, size).map((row) => ({
    id: row.id,
    resultFileUrl: row.fileUrl,
    createdAt: row.createdAt,
  }));

  const nextCursor = rows.length > size
    ? `${rows[size - 1].createdAt.toISOString()}::${rows[size - 1].id}`
    : null;

  return { items, nextCursor };
}

/**
 * 根据 ID 查询生成任务详情（含关联 Recipe）
 * LEFT JOIN analysis_tasks 获取 recipe
 */
export async function findByIdWithRecipe(
  id: string,
  userId: string
): Promise<GenerationTaskDetail | null> {
  const rows = await db
    .select({
      id: generationTasks.id,
      analysisTaskId: generationTasks.analysisTaskId,
      status: generationTasks.status,
      promptSnapshot: generationTasks.promptSnapshot,
      negativePromptSnapshot: generationTasks.negativePromptSnapshot,
      params: generationTasks.params,
      modelName: generationTasks.modelName,
      resultAssetId: generationTasks.resultAssetId,
      assetFileUrl: assets.fileUrl,
      recipe: analysisTasks.recipe,
      createdAt: generationTasks.createdAt,
      updatedAt: generationTasks.updatedAt,
    })
    .from(generationTasks)
    .leftJoin(assets, eq(generationTasks.resultAssetId, assets.id))
    .leftJoin(analysisTasks, eq(generationTasks.analysisTaskId, analysisTasks.id))
    .where(
      and(eq(generationTasks.id, id), eq(generationTasks.userId, userId))
    );

  if (rows.length === 0) return null;

  const row = rows[0];

  // 仅 completed 状态返回详情
  if (row.status !== "completed") return null;

  return {
    id: row.id,
    analysisTaskId: row.analysisTaskId,
    status: row.status as "completed",
    promptSnapshot: row.promptSnapshot,
    negativePromptSnapshot: row.negativePromptSnapshot,
    params: row.params,
    modelName: row.modelName,
    resultAssetId: row.resultAssetId ?? "",
    resultFileUrl: row.assetFileUrl ?? "",
    recipe: row.recipe,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
