import { eq, sql, and, desc, lt, or, inArray, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  generationTasks,
  assets,
  analysisTasks,
  templates,
} from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type {
  GenerationParams,
  GenerationTask,
  GenerationTaskStatus,
  ImageGenProviderName,
  IterationContextSource,
  IterationDisplayStatus,
  IterationStatusFilter,
  StoredVisualRecipe,
  TemplateVariable,
} from "@/types/models";

type GenerationTaskRow = typeof generationTasks.$inferSelect;
const sourceAssets = alias(assets, "source_assets");
const sourceTemplates = alias(templates, "source_templates");

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
    recipeSnapshot: row.recipeSnapshot ?? null,
    variablesSnapshot: row.variablesSnapshot ?? null,
    sourceTemplateId: row.sourceTemplateId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 创建一条 pending 状态的 GenerationTask（plan-01: 同时固化提交时上下文快照） */
export async function createGenerationTask(
  userId: string,
  data: {
    analysisTaskId: string;
    promptSnapshot: string;
    negativePromptSnapshot: string;
    params: GenerationParams;
    modelName: string;
    provider?: ImageGenProviderName;
    /** ADR-2: 服务端从所引用 analysis task 固化的配方快照 */
    recipeSnapshot?: StoredVisualRecipe | null;
    /** ADR-2: 服务端从所引用 analysis task 固化的变量快照 */
    variablesSnapshot?: TemplateVariable[] | null;
    /** AC-02: 工作台当前应用的 Style Memory id */
    sourceTemplateId?: string | null;
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
      ...(data.recipeSnapshot !== undefined
        ? { recipeSnapshot: data.recipeSnapshot }
        : {}),
      ...(data.variablesSnapshot !== undefined
        ? { variablesSnapshot: data.variablesSnapshot }
        : {}),
      ...(data.sourceTemplateId !== undefined
        ? { sourceTemplateId: data.sourceTemplateId }
        : {}),
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
  recipe?: StoredVisualRecipe | null;
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  variables: TemplateVariable[];
  analysisTemplateVariables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 列出用户Done的Generation Task（历史列表）
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
      const [cursorAt, cursorId] = parts;
      const cursorDate = new Date(cursorAt);
      if (Number.isNaN(cursorDate.getTime()) || !cursorId) {
        return { items: [], nextCursor: null };
      }
      // keyset 分页：排序为 created_at DESC, id DESC，因此下一页取游标之后的数据。
      const cursorCondition = or(
        lt(generationTasks.createdAt, cursorDate),
        and(eq(generationTasks.createdAt, cursorDate), lt(generationTasks.id, cursorId))
      );
      if (cursorCondition) baseConditions.push(cursorCondition);
    } else {
      return { items: [], nextCursor: null };
    }
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
 * 根据 ID 查询Generation Task详情（含关联 Recipe）
 * LEFT JOIN analysis_tasks 获取 recipe/source context
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
      sourceAssetId: analysisTasks.sourceAssetId,
      sourceImageUrl: sourceAssets.fileUrl,
      analysisTemplateVariables: analysisTasks.analysisTemplateVariables,
      createdAt: generationTasks.createdAt,
      updatedAt: generationTasks.updatedAt,
    })
    .from(generationTasks)
    .leftJoin(assets, eq(generationTasks.resultAssetId, assets.id))
    .leftJoin(analysisTasks, eq(generationTasks.analysisTaskId, analysisTasks.id))
    .leftJoin(sourceAssets, eq(analysisTasks.sourceAssetId, sourceAssets.id))
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
    sourceAssetId: row.sourceAssetId ?? null,
    sourceImageUrl: row.sourceImageUrl ?? null,
    variables: row.analysisTemplateVariables ?? [],
    analysisTemplateVariables: row.analysisTemplateVariables ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── plan-01: Iteration Memory 读链路 ─────────────────────────────────

/** 仓库层迭代列表条目（DTO 同形，createdAt 为 Date，路由负责 ISO 序列化） */
export interface IterationListItemRow {
  id: string;
  status: IterationDisplayStatus;
  promptSummary: string;
  resultFileUrl: string | null;
  params: GenerationParams;
  createdAt: Date;
}

/** 仓库层迭代详情（DTO 同形，createdAt/updatedAt 为 Date） */
export interface IterationDetailRow {
  id: string;
  analysisTaskId: string;
  status: IterationDisplayStatus;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  resultAssetId: string | null;
  resultFileUrl: string | null;
  errorMessage: string | null;
  recipe: StoredVisualRecipe | null;
  recipeSource: IterationContextSource;
  variables: TemplateVariable[];
  variablesSource: IterationContextSource;
  sourceImageUrl: string | null;
  sourceAssetId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateName: string | null;
  savedTemplate: { id: string; name: string } | null;
  analysisTemplateVariables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
}

/** 数据库四值状态 → 展示态三值（pending 归并 processing，架构 §7.6） */
function toDisplayStatus(status: string): IterationDisplayStatus {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "processing";
}

/**
 * plan-01: 全状态迭代列表（架构 §6.1）
 * - 状态过滤：all 不加条件；processing → IN ('pending','processing')
 * - q 非空时 prompt_snapshot / 来源模板名 ILIKE 双字段命中（LEFT JOIN templates）
 * - 排序 created_at DESC, id DESC；keyset 游标沿用 listCompleted 的 "createdAt::id"
 */
export async function listIterations(params: {
  userId: string;
  q?: string;
  status?: IterationStatusFilter;
  cursor?: string | null;
  pageSize?: number;
}): Promise<{ items: IterationListItemRow[]; nextCursor: string | null }> {
  const { userId, q, cursor } = params;
  const status = params.status ?? "completed";
  // clamp pageSize 到 [1, 50]（架构 §8.3）
  const size = Math.max(1, Math.min(50, Math.trunc(params.pageSize ?? 20)));

  const conditions = [eq(generationTasks.userId, userId)];

  if (status === "processing") {
    conditions.push(
      inArray(generationTasks.status, ["pending", "processing"])
    );
  } else if (status === "completed" || status === "failed") {
    conditions.push(eq(generationTasks.status, status));
  }
  // status === "all" 不加状态条件

  const trimmedQ = q?.trim();
  if (trimmedQ) {
    const pattern = `%${trimmedQ}%`;
    const qCondition = or(
      ilike(generationTasks.promptSnapshot, pattern),
      ilike(templates.name, pattern)
    );
    if (qCondition) conditions.push(qCondition);
  }

  // cursor 解码：格式为 "createdAt::id"（与 listCompleted 一致）
  if (cursor) {
    const parts = cursor.split("::");
    if (parts.length === 2) {
      const [cursorAt, cursorId] = parts;
      const cursorDate = new Date(cursorAt);
      if (Number.isNaN(cursorDate.getTime()) || !cursorId) {
        return { items: [], nextCursor: null };
      }
      // keyset 分页：排序为 created_at DESC, id DESC，下一页取游标之后的数据
      const cursorCondition = or(
        lt(generationTasks.createdAt, cursorDate),
        and(
          eq(generationTasks.createdAt, cursorDate),
          lt(generationTasks.id, cursorId)
        )
      );
      if (cursorCondition) conditions.push(cursorCondition);
    } else {
      return { items: [], nextCursor: null };
    }
  }

  const rows = await db
    .select({
      id: generationTasks.id,
      status: generationTasks.status,
      promptSnapshot: generationTasks.promptSnapshot,
      params: generationTasks.params,
      resultFileUrl: assets.fileUrl,
      createdAt: generationTasks.createdAt,
    })
    .from(generationTasks)
    .leftJoin(assets, eq(generationTasks.resultAssetId, assets.id))
    .leftJoin(templates, eq(generationTasks.sourceTemplateId, templates.id))
    .where(and(...conditions))
    .orderBy(desc(generationTasks.createdAt), desc(generationTasks.id))
    .limit(size + 1); // 多查一条判断是否有下一页

  const items: IterationListItemRow[] = rows.slice(0, size).map((row) => ({
    id: row.id,
    status: toDisplayStatus(row.status),
    promptSummary: row.promptSnapshot.slice(0, 120),
    resultFileUrl:
      row.status === "completed" ? row.resultFileUrl ?? null : null,
    params: row.params,
    createdAt: row.createdAt,
  }));

  const nextCursor =
    rows.length > size
      ? `${rows[size - 1].createdAt.toISOString()}::${rows[size - 1].id}`
      : null;

  return { items, nextCursor };
}

/**
 * plan-01: 全状态迭代详情（架构 §6.2）
 * 单条联表：活引用 analysis task、结果资产、来源资产、来源模板、最新已保存模板；
 * 组装算法逐字段显式：快照优先 → 活引用回退 → 缺失标记。
 */
export async function findIterationDetail(
  id: string,
  userId: string
): Promise<IterationDetailRow | null> {
  // 每个来源迭代取 created_at 最新一条模板（ADR-5，容忍 1:N 只呈现最新）
  const latestSavedTemplates = db
    .selectDistinctOn([templates.sourceGenerationTaskId], {
      id: templates.id,
      name: templates.name,
      sourceGenerationTaskId: templates.sourceGenerationTaskId,
    })
    .from(templates)
    .orderBy(templates.sourceGenerationTaskId, desc(templates.createdAt))
    .as("latest_saved_templates");

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
      resultFileUrl: assets.fileUrl,
      errorMessage: generationTasks.errorMessage,
      recipeSnapshot: generationTasks.recipeSnapshot,
      analysisRecipe: analysisTasks.recipe,
      variablesSnapshot: generationTasks.variablesSnapshot,
      analysisTemplateVariables: analysisTasks.analysisTemplateVariables,
      sourceAssetId: analysisTasks.sourceAssetId,
      sourceImageUrl: sourceAssets.fileUrl,
      sourceTemplateId: generationTasks.sourceTemplateId,
      sourceTemplateName: sourceTemplates.name,
      savedTemplateId: latestSavedTemplates.id,
      savedTemplateName: latestSavedTemplates.name,
      createdAt: generationTasks.createdAt,
      updatedAt: generationTasks.updatedAt,
    })
    .from(generationTasks)
    .leftJoin(assets, eq(generationTasks.resultAssetId, assets.id))
    .leftJoin(
      analysisTasks,
      eq(generationTasks.analysisTaskId, analysisTasks.id)
    )
    .leftJoin(sourceAssets, eq(analysisTasks.sourceAssetId, sourceAssets.id))
    .leftJoin(
      sourceTemplates,
      eq(generationTasks.sourceTemplateId, sourceTemplates.id)
    )
    .leftJoin(
      latestSavedTemplates,
      eq(
        latestSavedTemplates.sourceGenerationTaskId,
        generationTasks.id
      )
    )
    .where(and(eq(generationTasks.id, id), eq(generationTasks.userId, userId)));

  if (rows.length === 0) return null;

  const row = rows[0];

  // 上下文组装算法（架构 §6.2，逐字段显式）
  const recipe = row.recipeSnapshot ?? row.analysisRecipe ?? null;
  const recipeSource: IterationContextSource = row.recipeSnapshot
    ? "snapshot"
    : row.analysisRecipe
      ? "fallback"
      : "missing";
  const variables = row.variablesSnapshot ?? row.analysisTemplateVariables ?? [];
  const variablesSource: IterationContextSource = row.variablesSnapshot
    ? "snapshot"
    : row.analysisTemplateVariables
      ? "fallback"
      : "missing";

  return {
    id: row.id,
    analysisTaskId: row.analysisTaskId,
    status: toDisplayStatus(row.status),
    promptSnapshot: row.promptSnapshot,
    negativePromptSnapshot: row.negativePromptSnapshot,
    params: row.params,
    modelName: row.modelName,
    resultAssetId: row.resultAssetId ?? null,
    resultFileUrl:
      row.status === "completed" ? row.resultFileUrl ?? null : null,
    errorMessage: row.errorMessage,
    recipe,
    recipeSource,
    variables,
    variablesSource,
    sourceImageUrl: row.sourceImageUrl ?? null,
    sourceAssetId: row.sourceAssetId ?? null,
    sourceTemplateId: row.sourceTemplateId ?? null,
    sourceTemplateName: row.sourceTemplateName ?? null,
    savedTemplate: row.savedTemplateId
      ? { id: row.savedTemplateId, name: row.savedTemplateName ?? "" }
      : null,
    analysisTemplateVariables: row.analysisTemplateVariables ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * plan-01: 将已创建模板关联为迭代沉淀产物（templates.source_generation_task_id，ADR-5）。
 * 写入点唯一（保存动作创建模板后调用），模板被删除时关联自然消失。
 */
export async function linkTemplateToGenerationTask(
  templateId: string,
  generationTaskId: string,
  userId: string
): Promise<void> {
  await db
    .update(templates)
    .set({
      sourceGenerationTaskId: generationTaskId,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)));
}
