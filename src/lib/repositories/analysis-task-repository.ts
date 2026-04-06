import { eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { analysisTasks } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type {
  AnalysisTask,
  AnalysisTaskErrorStage,
  AnalysisTaskStatus,
  VisionProviderName,
} from "@/types/models";

type AnalysisTaskRow = typeof analysisTasks.$inferSelect;

/** 数据库行 → AnalysisTask 领域对象 */
function rowToAnalysisTask(row: AnalysisTaskRow): AnalysisTask {
  return {
    id: row.id,
    sourceAssetId: row.sourceAssetId,
    status: row.status as AnalysisTaskStatus,
    recipe: row.recipe ?? null,
    promptText: row.promptText,
    negativePromptText: row.negativePromptText,
    rawResponse: row.rawResponse,
    errorMessage: row.errorMessage,
    errorStage: row.errorStage as AnalysisTaskErrorStage | null,
    provider: row.provider as VisionProviderName,
    externalId: row.externalId,
    modelName: row.modelName,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 创建一条 pending 状态的 AnalysisTask */
export async function createAnalysisTask(
  userId: string,
  data: {
    sourceAssetId: string;
    provider?: VisionProviderName;
    modelName?: string;
  }
): Promise<AnalysisTask> {
  const id = generateId();
  const [row] = await db
    .insert(analysisTasks)
    .values({
      id,
      sourceAssetId: data.sourceAssetId,
      provider: data.provider ?? "gemini",
      modelName: data.modelName,
      userId,
    })
    .returning();
  return rowToAnalysisTask(row);
}

/** 按 ID 查询 AnalysisTask（需验证 userId 归属） */
export async function findAnalysisTaskById(
  id: string,
  userId: string
): Promise<AnalysisTask | null> {
  const rows = await db
    .select()
    .from(analysisTasks)
    .where(and(eq(analysisTasks.id, id), eq(analysisTasks.userId, userId)));
  if (rows.length === 0) return null;
  return rowToAnalysisTask(rows[0]);
}

/** 按 ID 查询 AnalysisTask（不校验 userId，仅 Webhook 内部使用） */
export async function findAnalysisTaskByIdInternal(
  id: string
): Promise<AnalysisTask | null> {
  const rows = await db
    .select()
    .from(analysisTasks)
    .where(eq(analysisTasks.id, id));
  if (rows.length === 0) return null;
  return rowToAnalysisTask(rows[0]);
}

/** 可更新的字段子集 */
type AnalysisTaskUpdatable = Partial<
  Pick<
    AnalysisTask,
    | "status"
    | "recipe"
    | "promptText"
    | "negativePromptText"
    | "rawResponse"
    | "errorMessage"
    | "errorStage"
    | "externalId"
  >
>;

/** 更新 AnalysisTask */
export async function updateAnalysisTask(
  id: string,
  updates: AnalysisTaskUpdatable
): Promise<AnalysisTask> {
  const setObj: Record<string, unknown> = {
    updatedAt: sql`NOW()`,
  };

  if (updates.status !== undefined) setObj.status = updates.status;
  if ("recipe" in updates) setObj.recipe = updates.recipe;
  if (updates.promptText !== undefined) setObj.promptText = updates.promptText;
  if (updates.negativePromptText !== undefined)
    setObj.negativePromptText = updates.negativePromptText;
  if (updates.rawResponse !== undefined)
    setObj.rawResponse = updates.rawResponse;
  if (updates.errorMessage !== undefined)
    setObj.errorMessage = updates.errorMessage;
  if (updates.errorStage !== undefined) setObj.errorStage = updates.errorStage;
  if (updates.externalId !== undefined) setObj.externalId = updates.externalId;

  const rows = await db
    .update(analysisTasks)
    .set(setObj)
    .where(eq(analysisTasks.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error(`AnalysisTask not found: ${id}`);
  }

  return rowToAnalysisTask(rows[0]);
}
