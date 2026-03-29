import { eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationTasks } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type {
  GenerationParams,
  GenerationTask,
  GenerationTaskStatus,
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

/** 可更新的字段子集 */
type GenerationTaskUpdatable = Partial<
  Pick<GenerationTask, "status" | "resultAssetId" | "errorMessage">
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
