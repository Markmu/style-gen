import { eq, and, or, desc, lt, sql, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { templates, generationTasks, assets } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import { mergeTemplateVariables } from "@/lib/template-parser";
import { ruleSetsChanged } from "@/lib/style-memory-rules";
import type {
  PromptTemplate,
  TemplateVariable,
  TemplateVerificationStatus,
  StyleMemoryRecord,
  StyleMemoryListItem,
  StyleMemoryDetail,
  RepresentativeCandidate,
} from "@/types/models";

type TemplateRow = typeof templates.$inferSelect;

/** 验证状态白名单（架构 §7.6：与 CHECK 约束同口径） */
const VERIFICATION_STATUSES: ReadonlySet<string> = new Set([
  "user_verified",
  "pending_verification",
]);

/**
 * 时间戳 → ISO 字符串。原生 sql 表达式字段（LATERAL 聚合等）在驱动层
 * 可能返回 ISO 字符串而非 Date（drizzle 不对无 codec 的 sql 字段做时间戳解析），
 * 统一经 Date 归一，兼容 Date（mock/测试）与 string（真实驱动）两种形态。
 */
function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function rowToStyleMemory(row: TemplateRow): StyleMemoryRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    variables: row.variables ?? [],
    retainedRules: row.retainedRules ?? [],
    negativeConstraints: row.negativeConstraints ?? [],
    styleTokens: row.styleTokens ?? [],
    enhancementHints: row.enhancementHints ?? [],
    verificationStatus: row.verificationStatus,
    representativeGenerationTaskId: row.representativeGenerationTaskId,
    sourceAssetId: row.sourceAssetId,
    sourceImageUrl: row.sourceImageUrl,
    sourceGenerationTaskId: row.sourceGenerationTaskId,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 创建模板（自动从 content 提取 variables）。
 * plan-01（架构 §7.4）：验证状态由服务端派生——带代表结果 → user_verified，否则 pending_verification。
 * representative 合法性由 API 层校验，repository 不重复查任务表。
 */
export async function createTemplate(
  userId: string,
  data: {
    name: string;
    content: string;
    variables?: TemplateVariable[];
    sourceAssetId?: string | null;
    sourceImageUrl?: string | null;
    description?: string | null;
    retainedRules?: string[];
    negativeConstraints?: string[];
    styleTokens?: string[];
    enhancementHints?: string[];
    representativeGenerationTaskId?: string | null;
  }
): Promise<StyleMemoryRecord> {
  const id = generateId();
  const variables = mergeTemplateVariables(data.content, data.variables);
  const representativeGenerationTaskId =
    data.representativeGenerationTaskId ?? null;

  const [row] = await db
    .insert(templates)
    .values({
      id,
      name: data.name,
      content: data.content,
      variables,
      description: data.description ?? null,
      retainedRules: data.retainedRules ?? [],
      negativeConstraints: data.negativeConstraints ?? [],
      styleTokens: data.styleTokens ?? [],
      enhancementHints: data.enhancementHints ?? [],
      representativeGenerationTaskId,
      verificationStatus:
        representativeGenerationTaskId !== null
          ? "user_verified"
          : "pending_verification",
      sourceAssetId: data.sourceAssetId ?? null,
      sourceImageUrl: data.sourceImageUrl ?? null,
      userId,
    })
    .returning();

  return rowToStyleMemory(row);
}

/** 查询某用户下是否已存在同名模板 */
export async function findByName(
  userId: string,
  name: string
): Promise<StyleMemoryRecord | null> {
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.userId, userId), eq(templates.name, name)));
  if (rows.length === 0) return null;
  return rowToStyleMemory(rows[0]);
}

/** 分页查询参数 */
export interface TemplatePaginationParams {
  cursor?: string;
  limit?: number;
  /** 模板名称/说明/规则/变量名模糊搜索（ILIKE，架构 §6.1 七路谓词） */
  search?: string;
  /** 验证状态筛选（白名单 user_verified | pending_verification） */
  verificationStatus?: TemplateVerificationStatus;
}

/** 分页查询结果 */
export interface TemplatePaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ─── 游标编码：(sortTs, id) 双键（架构 §6.1；跨页同 sortTs 时 id 保证稳定排序） ───

const CURSOR_SEPARATOR = "::";

function encodeCursor(sortTs: Date | string, id: string): string {
  return `${toIsoString(sortTs)}${CURSOR_SEPARATOR}${id}`;
}

function decodeCursor(cursor: string): { sortTs: Date; id: string } | null {
  const separatorIndex = cursor.lastIndexOf(CURSOR_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex + CURSOR_SEPARATOR.length >= cursor.length) {
    return null;
  }
  const sortTs = Date.parse(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + CURSOR_SEPARATOR.length);
  if (Number.isNaN(sortTs) || id.length === 0) return null;
  return { sortTs: new Date(sortTs), id };
}

// ─── 使用聚合 LATERAL 子查询（架构 §6.1 / ADR-4：读时聚合，不落列） ───

/**
 * 构建使用情况聚合子查询：max(created_at) 为最近使用时间，count(*) 为派生迭代数。
 * 以 `LEFT JOIN LATERAL` 挂入主查询（drizzle 经 sql 包裹渲染 lateral 关键字），
 * 关联条件 source_template_id = templates.id 由子查询 WHERE 承载。
 */
function buildUsageLateral() {
  return db
    .select({
      lastUsed: sql<Date | null>`max(${generationTasks.createdAt})`.as("last_used"),
      derivedCount: sql<number>`count(*)::int`.as("derived_count"),
    })
    .from(generationTasks)
    .where(eq(generationTasks.sourceTemplateId, templates.id))
    .as("usage");
}

// ─── 搜索谓词（架构 §6.1：单子串 ILIKE，七路命中） ───

/**
 * search 谓词：name OR description OR array_to_string(规则四元组 ×4)
 * OR 变量聚合子查询（coalesce(v->>'label', v->>'name')，只匹配变量名与标签，
 * 不含 defaultValue 内容与 JSON 键名，避免英文键名假阳性）。
 */
function buildSearchPredicate(search: string) {
  const pattern = `%${search}%`;
  return sql`(
    ${templates.name} ilike ${pattern}
    or ${templates.description} ilike ${pattern}
    or array_to_string(${templates.retainedRules}, ' ') ilike ${pattern}
    or array_to_string(${templates.negativeConstraints}, ' ') ilike ${pattern}
    or array_to_string(${templates.styleTokens}, ' ') ilike ${pattern}
    or array_to_string(${templates.enhancementHints}, ' ') ilike ${pattern}
    or (
      select string_agg(coalesce(v->>'label', v->>'name'), ' ')
      from jsonb_array_elements(${templates.variables}) v
    ) ilike ${pattern}
  )`;
}

/**
 * 获取用户 Style Memory 列表（架构 §6.1 列表联查）。
 * 单条 SQL：使用聚合 LATERAL + 代表结果两跳 JOIN，
 * 排序 COALESCE(last_used, updated_at) DESC, id DESC，(sortTs, id) 双键游标分页。
 * 返回 StyleMemoryListItem（retainedRulesPreview 取前 2 条）。
 */
export async function findAllByUserId(
  userId: string,
  params: TemplatePaginationParams = {}
): Promise<TemplatePaginatedResult<StyleMemoryListItem>> {
  const limit = Math.min(params.limit ?? 10, 50);

  const usage = buildUsageLateral();
  const rep = alias(generationTasks, "rep");
  const repAsset = alias(assets, "rep_asset");
  const sortTs = sql`coalesce(${usage.lastUsed}, ${templates.updatedAt})`;

  const conditions = [eq(templates.userId, userId)];

  if (
    params.verificationStatus &&
    VERIFICATION_STATUSES.has(params.verificationStatus)
  ) {
    conditions.push(eq(templates.verificationStatus, params.verificationStatus));
  }

  if (params.search && params.search.trim().length > 0) {
    conditions.push(buildSearchPredicate(params.search.trim()));
  }

  let cursorFilter: ReturnType<typeof or> | undefined;
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (!decoded) {
      return { items: [], hasMore: false, nextCursor: null };
    }
    cursorFilter = or(
      sql`${sortTs} < ${decoded.sortTs}`,
      and(sql`${sortTs} = ${decoded.sortTs}`, lt(templates.id, decoded.id))
    );
    if (cursorFilter) conditions.push(cursorFilter);
  }

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      verificationStatus: templates.verificationStatus,
      retainedRules: templates.retainedRules,
      variableCount: sql<number>`COALESCE(jsonb_array_length(${templates.variables}), 0)`,
      sourceImageUrl: templates.sourceImageUrl,
      representativeImageUrl: repAsset.fileUrl,
      lastUsedAt: usage.lastUsed,
      updatedAt: templates.updatedAt,
      sortTs: sql<Date>`${sortTs}`.as("sort_ts"),
    })
    .from(templates)
    .leftJoin(sql`lateral ${usage}`, sql`true`)
    .leftJoin(rep, eq(rep.id, templates.representativeGenerationTaskId))
    .leftJoin(repAsset, eq(repAsset.id, rep.resultAssetId))
    .where(and(...conditions))
    .orderBy(desc(sql`${sortTs}`), desc(templates.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items: StyleMemoryListItem[] = rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    verificationStatus: row.verificationStatus,
    retainedRulesPreview: (row.retainedRules ?? []).slice(0, 2),
    variableCount: row.variableCount ?? 0,
    sourceImageUrl: row.sourceImageUrl ?? null,
    representativeImageUrl: row.representativeImageUrl ?? null,
    lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
    updatedAt: toIsoString(row.updatedAt),
  }));

  return {
    items,
    hasMore,
    nextCursor:
      hasMore && items.length > 0
        ? encodeCursor(rows[limit - 1].sortTs, rows[limit - 1].id)
        : null,
  };
}

/** 按 ID 查询模板详情（含 content 和 variables） */
export async function findById(
  id: string,
  userId: string
): Promise<StyleMemoryRecord | null> {
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)));
  if (rows.length === 0) return null;
  return rowToStyleMemory(rows[0]);
}

/**
 * 组装 Style Memory 详情 DTO（架构 §6.2）：规则四元组、来源迭代、代表结果、usage 聚合。
 * 读时防御降级：user_verified 且代表结果引用为空 → DTO 返回 pending_verification。
 */
export async function findStyleMemoryDetail(
  id: string,
  userId: string
): Promise<StyleMemoryDetail | null> {
  const usage = buildUsageLateral();
  const sourceIteration = alias(generationTasks, "source_iteration");
  const rep = alias(generationTasks, "rep");
  const repAsset = alias(assets, "rep_asset");

  const rows = await db
    .select({
      ...getTableColumns(templates),
      sourceIterationCreatedAt: sourceIteration.createdAt,
      representativeImageUrl: repAsset.fileUrl,
      representativeCreatedAt: rep.createdAt,
      lastUsedAt: usage.lastUsed,
      derivedIterationCount: usage.derivedCount,
    })
    .from(templates)
    .leftJoin(sql`lateral ${usage}`, sql`true`)
    .leftJoin(
      sourceIteration,
      eq(sourceIteration.id, templates.sourceGenerationTaskId)
    )
    .leftJoin(rep, eq(rep.id, templates.representativeGenerationTaskId))
    .leftJoin(repAsset, eq(repAsset.id, rep.resultAssetId))
    .where(and(eq(templates.id, id), eq(templates.userId, userId)));

  if (rows.length === 0) return null;
  const row = rows[0];

  const record = rowToStyleMemory(row);
  const verificationStatus: TemplateVerificationStatus =
    record.verificationStatus === "user_verified" &&
    record.representativeGenerationTaskId === null
      ? "pending_verification"
      : record.verificationStatus;

  return {
    ...record,
    verificationStatus,
    sourceGenerationTask:
      record.sourceGenerationTaskId && row.sourceIterationCreatedAt
        ? {
            id: record.sourceGenerationTaskId,
            createdAt: toIsoString(row.sourceIterationCreatedAt),
          }
        : null,
    representativeResult: record.representativeGenerationTaskId
      ? {
          iterationId: record.representativeGenerationTaskId,
          imageUrl: row.representativeImageUrl ?? null,
          // 引用存在 ⇒ 任务行存在（FK SET NULL 保证）；兜底取记录自身时间戳以维持非空契约
          createdAt: toIsoString(row.representativeCreatedAt ?? record.createdAt),
        }
      : null,
    usage: {
      lastUsedAt: row.lastUsedAt ? toIsoString(row.lastUsedAt) : null,
      derivedIterationCount: Number(row.derivedIterationCount ?? 0),
    },
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

/**
 * 原子更新代表结果（架构 §6.4）：单条 UPDATE 同时写引用与 user_verified。
 * 候选集归属校验由 API 层完成（§6.4 相关集定义）。
 */
export async function setRepresentativeResult(
  templateId: string,
  userId: string,
  generationTaskId: string
): Promise<StyleMemoryRecord> {
  const rows = await db
    .update(templates)
    .set({
      representativeGenerationTaskId: generationTaskId,
      verificationStatus: "user_verified",
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .returning();

  if (rows.length === 0) {
    throw new Error(`Template not found or not owned by user: ${templateId}`);
  }
  return rowToStyleMemory(rows[0]);
}

/**
 * 代表结果候选列表（架构 §6.4 相关集）：本 Memory 派生的迭代或来源迭代自身，
 * 且 completed 且有结果资产；created_at DESC 双键游标分页。
 */
export async function listRepresentativeCandidates(
  templateId: string,
  userId: string,
  cursor?: string | null,
  limit?: number
): Promise<TemplatePaginatedResult<RepresentativeCandidate>> {
  const effectiveLimit = Math.min(limit ?? 10, 50);

  const conditions = [
    eq(generationTasks.userId, userId),
    eq(generationTasks.status, "completed"),
    sql`${generationTasks.resultAssetId} IS NOT NULL`,
    or(
      eq(generationTasks.sourceTemplateId, templateId),
      sql`${generationTasks.id} = (
        select ${templates.sourceGenerationTaskId} from ${templates}
        where ${templates.id} = ${templateId}
      )`
    ),
  ];

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) {
      return { items: [], hasMore: false, nextCursor: null };
    }
    conditions.push(
      or(
        lt(generationTasks.createdAt, decoded.sortTs),
        and(
          eq(generationTasks.createdAt, decoded.sortTs),
          lt(generationTasks.id, decoded.id)
        )
      )
    );
  }

  const rows = await db
    .select({
      id: generationTasks.id,
      imageUrl: assets.fileUrl,
      promptSnapshot: generationTasks.promptSnapshot,
      createdAt: generationTasks.createdAt,
    })
    .from(generationTasks)
    .leftJoin(assets, eq(assets.id, generationTasks.resultAssetId))
    .where(and(...conditions))
    .orderBy(desc(generationTasks.createdAt), desc(generationTasks.id))
    .limit(effectiveLimit + 1);

  const hasMore = rows.length > effectiveLimit;
  const items: RepresentativeCandidate[] = rows.slice(0, effectiveLimit).map((row) => ({
    id: row.id,
    imageUrl: row.imageUrl ?? null,
    promptSummary: (row.promptSnapshot ?? "").slice(0, 120),
    createdAt: toIsoString(row.createdAt),
  }));

  return {
    items,
    hasMore,
    nextCursor:
      hasMore && rows.length > 0
        ? encodeCursor(
            rows[effectiveLimit - 1].createdAt,
            rows[effectiveLimit - 1].id
          )
        : null,
  };
}

/** 删除模板（物理删除；generation_tasks.source_template_id 由 FK SET NULL 解链） */
export async function deleteTemplate(
  id: string,
  userId: string
): Promise<void> {
  const result = await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)));

  if (result.rowCount === 0) {
    throw new Error(`Template not found or not owned by user: ${id}`);
  }
}

/**
 * 更新模板（自动重新提取 variables）。
 * plan-01（架构 §6.4）：retainedRules / negativeConstraints 任一集合实质变化
 * （ruleSetsChanged 集合语义：改序、空白差异不算）→ 回退 pending_verification；
 * 代表结果引用保留不清除；description / content 不触发回退。
 */
export async function updateTemplate(
  id: string,
  userId: string,
  data: {
    name?: string;
    content?: string;
    variables?: TemplateVariable[];
    sourceAssetId?: string | null;
    sourceImageUrl?: string | null;
    description?: string | null;
    retainedRules?: string[];
    negativeConstraints?: string[];
  }
): Promise<StyleMemoryRecord> {
  const existing = await findById(id, userId);
  if (!existing) throw new Error(`Template not found: ${id}`);

  const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (data.name !== undefined) updates.name = data.name;
  if (data.content !== undefined) {
    updates.content = data.content;
    updates.variables = mergeTemplateVariables(data.content, data.variables);
  } else if (data.variables !== undefined) {
    updates.variables = mergeTemplateVariables(existing.content, data.variables);
  }
  if (data.sourceAssetId !== undefined) updates.sourceAssetId = data.sourceAssetId;
  if (data.sourceImageUrl !== undefined) updates.sourceImageUrl = data.sourceImageUrl;
  if (data.description !== undefined) updates.description = data.description;

  let ruleSetsMutated = false;
  if (data.retainedRules !== undefined) {
    updates.retainedRules = data.retainedRules;
    if (ruleSetsChanged(existing.retainedRules, data.retainedRules)) {
      ruleSetsMutated = true;
    }
  }
  if (data.negativeConstraints !== undefined) {
    updates.negativeConstraints = data.negativeConstraints;
    if (ruleSetsChanged(existing.negativeConstraints, data.negativeConstraints)) {
      ruleSetsMutated = true;
    }
  }
  if (ruleSetsMutated) {
    updates.verificationStatus = "pending_verification";
  }

  const rows = await db
    .update(templates)
    .set(updates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .returning();

  return rowToStyleMemory(rows[0]);
}

/**
 * 复制模板（生成新 ID，名称追加 " (copy)"）。
 * plan-01（架构 §6.4）：复制 content / variables / description / 规则四元组 /
 * sourceAssetId / sourceImageUrl / sourceGenerationTaskId（后两项 description 与
 * sourceGenerationTaskId 为本期新增复制项）；不复制代表结果引用，
 * 复制品固定 pending_verification。
 */
export async function duplicateTemplate(
  id: string,
  userId: string
): Promise<StyleMemoryRecord> {
  const existing = await findById(id, userId);
  if (!existing) throw new Error(`Template not found: ${id}`);

  const newId = generateId();
  let newName = `${existing.name} (copy)`;

  // 处理重复 copy 名称
  let suffix = 2;
  while (await findByName(userId, newName)) {
    newName = `${existing.name} (copy ${suffix})`;
    suffix++;
  }

  const [row] = await db
    .insert(templates)
    .values({
      id: newId,
      name: newName,
      content: existing.content,
      variables: existing.variables,
      description: existing.description,
      retainedRules: existing.retainedRules,
      negativeConstraints: existing.negativeConstraints,
      styleTokens: existing.styleTokens,
      enhancementHints: existing.enhancementHints,
      sourceAssetId: existing.sourceAssetId,
      sourceImageUrl: existing.sourceImageUrl,
      sourceGenerationTaskId: existing.sourceGenerationTaskId,
      representativeGenerationTaskId: null,
      verificationStatus: "pending_verification",
      userId,
    })
    .returning();

  return rowToStyleMemory(row);
}

// 兼容导出：既有调用方以 PromptTemplate 口径消费记录（StyleMemoryRecord 为其超集）
export type { PromptTemplate };
