import { query } from "@/lib/db";
import { generateId } from "@/lib/ulid";
import type {
  AnalysisTask,
  AnalysisTaskErrorStage,
  AnalysisTaskStatus,
  VisualRecipe,
} from "@/types/models";

interface AnalysisTaskRow {
  id: string;
  source_asset_id: string;
  status: AnalysisTaskStatus;
  recipe: VisualRecipe | null;
  prompt_text: string | null;
  negative_prompt_text: string | null;
  raw_response: string | null;
  error_message: string | null;
  error_stage: AnalysisTaskErrorStage | null;
  created_at: Date;
  updated_at: Date;
}

/** 数据库行 → AnalysisTask 领域对象 */
function rowToAnalysisTask(row: AnalysisTaskRow): AnalysisTask {
  return {
    id: row.id,
    sourceAssetId: row.source_asset_id,
    status: row.status,
    recipe: row.recipe,
    promptText: row.prompt_text,
    negativePromptText: row.negative_prompt_text,
    rawResponse: row.raw_response,
    errorMessage: row.error_message,
    errorStage: row.error_stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 创建一条 pending 状态的 AnalysisTask */
export async function createAnalysisTask(data: {
  sourceAssetId: string;
}): Promise<AnalysisTask> {
  const id = generateId();
  const result = await query<AnalysisTaskRow>(
    `INSERT INTO analysis_tasks (id, source_asset_id)
     VALUES ($1, $2)
     RETURNING *`,
    [id, data.sourceAssetId]
  );
  return rowToAnalysisTask(result.rows[0]);
}

/** 按 ID 查询 AnalysisTask（recipe JSONB 自动解析） */
export async function findAnalysisTaskById(
  id: string
): Promise<AnalysisTask | null> {
  const result = await query<AnalysisTaskRow>(
    "SELECT * FROM analysis_tasks WHERE id = $1",
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToAnalysisTask(result.rows[0]);
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

/** camelCase 字段名 → snake_case 列名映射 */
const columnMap: Record<string, string> = {
  status: "status",
  recipe: "recipe",
  promptText: "prompt_text",
  negativePromptText: "negative_prompt_text",
  rawResponse: "raw_response",
  errorMessage: "error_message",
  errorStage: "error_stage",
};

/** 更新 AnalysisTask */
export async function updateAnalysisTask(
  id: string,
  updates: AnalysisTaskUpdatable
): Promise<AnalysisTask> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    const column = columnMap[key];
    if (!column) continue;

    if (key === "recipe") {
      setClauses.push(`${column} = $${paramIndex}::jsonb`);
      values.push(value === null ? null : JSON.stringify(value));
    } else {
      setClauses.push(`${column} = $${paramIndex}`);
      values.push(value);
    }
    paramIndex++;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query<AnalysisTaskRow>(
    `UPDATE analysis_tasks SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error(`AnalysisTask not found: ${id}`);
  }

  return rowToAnalysisTask(result.rows[0]);
}
