import { query } from "@/lib/db";
import { generateId } from "@/lib/ulid";
import type {
  GenerationParams,
  GenerationTask,
  GenerationTaskStatus,
} from "@/types/models";

interface GenerationTaskRow {
  id: string;
  analysis_task_id: string;
  status: GenerationTaskStatus;
  prompt_snapshot: string;
  negative_prompt_snapshot: string;
  params: GenerationParams;
  model_name: string;
  result_asset_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

/** 数据库行 → GenerationTask 领域对象 */
function rowToGenerationTask(row: GenerationTaskRow): GenerationTask {
  return {
    id: row.id,
    analysisTaskId: row.analysis_task_id,
    status: row.status,
    promptSnapshot: row.prompt_snapshot,
    negativePromptSnapshot: row.negative_prompt_snapshot,
    params: row.params,
    modelName: row.model_name,
    resultAssetId: row.result_asset_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 创建一条 pending 状态的 GenerationTask */
export async function createGenerationTask(data: {
  analysisTaskId: string;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
}): Promise<GenerationTask> {
  const id = generateId();
  const result = await query<GenerationTaskRow>(
    `INSERT INTO generation_tasks (id, analysis_task_id, prompt_snapshot, negative_prompt_snapshot, params, model_name)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      id,
      data.analysisTaskId,
      data.promptSnapshot,
      data.negativePromptSnapshot,
      JSON.stringify(data.params),
      data.modelName,
    ]
  );
  return rowToGenerationTask(result.rows[0]);
}

/** 按 ID 查询 GenerationTask */
export async function findGenerationTaskById(
  id: string
): Promise<GenerationTask | null> {
  const result = await query<GenerationTaskRow>(
    "SELECT * FROM generation_tasks WHERE id = $1",
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToGenerationTask(result.rows[0]);
}

/** 可更新的字段子集 */
type GenerationTaskUpdatable = Partial<
  Pick<GenerationTask, "status" | "resultAssetId" | "errorMessage">
>;

/** camelCase 字段名 → snake_case 列名映射 */
const columnMap: Record<string, string> = {
  status: "status",
  resultAssetId: "result_asset_id",
  errorMessage: "error_message",
};

/** 更新 GenerationTask */
export async function updateGenerationTask(
  id: string,
  updates: GenerationTaskUpdatable
): Promise<GenerationTask> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    const column = columnMap[key];
    if (!column) continue;
    setClauses.push(`${column} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query<GenerationTaskRow>(
    `UPDATE generation_tasks SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error(`GenerationTask not found: ${id}`);
  }

  return rowToGenerationTask(result.rows[0]);
}
