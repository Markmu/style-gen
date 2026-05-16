import { eq, and, desc, lt, sql, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import { mergeTemplateVariables } from "@/lib/template-parser";
import type { PromptTemplate, TemplateVariable } from "@/types/models";

type TemplateRow = typeof templates.$inferSelect;

function rowToTemplate(row: TemplateRow): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    variables: row.variables ?? [],
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 创建模板（自动从 content 提取 variables） */
export async function createTemplate(
  userId: string,
  data: {
    name: string;
    content: string;
    variables?: TemplateVariable[];
  }
): Promise<PromptTemplate> {
  const id = generateId();
  const variables = mergeTemplateVariables(data.content, data.variables);

  const [row] = await db
    .insert(templates)
    .values({
      id,
      name: data.name,
      content: data.content,
      variables,
      userId,
    })
    .returning();

  return rowToTemplate(row);
}

/** 查询某用户下是否已存在同名模板 */
export async function findByName(
  userId: string,
  name: string
): Promise<PromptTemplate | null> {
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.userId, userId), eq(templates.name, name)));
  if (rows.length === 0) return null;
  return rowToTemplate(rows[0]);
}

/** 分页查询参数 */
export interface TemplatePaginationParams {
  cursor?: string;
  limit?: number;
  /** 模板名称模糊搜索关键词（ILIKE） */
  search?: string;
}

/** 分页查询结果 */
export interface TemplatePaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * 获取用户模板列表（cursor-based 分页，按创建时间倒序）
 * 返回精简字段，不含完整 content（架构 6.2 原则）
 * 支持 search 参数进行名称模糊匹配（ILIKE）
 */
export async function findAllByUserId(
  userId: string,
  params: TemplatePaginationParams = {}
): Promise<TemplatePaginatedResult<{ id: string; name: string; variableCount: number; createdAt: Date }>> {
  const limit = Math.min(params.limit ?? 10, 50);

  // 构建基础 WHERE 条件：userId + 可选 cursor
  const baseConditions = params.cursor
    ? [eq(templates.userId, userId), lt(templates.createdAt, new Date(params.cursor))]
    : [eq(templates.userId, userId)];

  // 追加 search ILIKE 条件
  if (params.search && params.search.trim().length > 0) {
    baseConditions.push(ilike(templates.name, `%${params.search.trim()}%`));
  }

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      variableCount: sql<number>`COALESCE(jsonb_array_length(${templates.variables}), 0)`,
      createdAt: templates.createdAt,
    })
    .from(templates)
    .where(and(...baseConditions))
    .orderBy(desc(templates.createdAt))
    .limit(limit + 1); // 多查一条判断 hasMore

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    variableCount: row.variableCount ?? 0,
    createdAt: row.createdAt,
  }));

  return {
    items,
    hasMore,
    nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
  };
}

/** 按 ID 查询模板详情（含 content 和 variables） */
export async function findById(
  id: string,
  userId: string
): Promise<PromptTemplate | null> {
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)));
  if (rows.length === 0) return null;
  return rowToTemplate(rows[0]);
}

/** 删除模板（物理删除） */
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

/** 更新模板（自动重新提取 variables） */
export async function updateTemplate(
  id: string,
  userId: string,
  data: { name?: string; content?: string; variables?: TemplateVariable[] }
): Promise<PromptTemplate> {
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

  const rows = await db
    .update(templates)
    .set(updates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .returning();

  return rowToTemplate(rows[0]);
}

/** 复制模板（生成新 ID，名称追加 " (copy)"） */
export async function duplicateTemplate(
  id: string,
  userId: string
): Promise<PromptTemplate> {
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
      userId,
    })
    .returning();

  return rowToTemplate(row);
}
