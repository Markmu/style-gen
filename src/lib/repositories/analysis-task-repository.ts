import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { analysisTasks } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type {
  AnalysisTask,
  AnalysisTaskErrorStage,
  AnalysisTaskStatus,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 创建一条 pending 状态的 AnalysisTask */
export async function createAnalysisTask(data: {
  sourceAssetId: string;
}): Promise<AnalysisTask> {
  const id = generateId();
  const [row] = await db
    .insert(analysisTasks)
    .values({
      id,
      sourceAssetId: data.sourceAssetId,
    })
    .returning();
  return rowToAnalysisTask(row);
}

/** 按 ID 查询 AnalysisTask */
export async function findAnalysisTaskById(
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
