---
task_id: "T01"
title: "模板数据层"
dimension: backend
phase: 1
status: done
depends_on: []
---

# T01: 模板数据层（后端）

## 任务概要

- **目标**: 建立 `templates` 表的 Drizzle Schema 定义、Repository 数据访问层和变量解析纯函数模块，为 API 端点提供完整的数据基础设施
- **依赖**: 无
- **所属模块**: Template Repository + 变量解析模块 (`lib/template-parser`)
- **前置条件**: PostgreSQL 数据库已启动（`pnpm db:up`）
- **不在范围**: API 端点实现（T02）、前端组件、P1 变量向导

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/db/schema.ts` | 新增 `templates` 表定义（在 generationTasks 之后） |
| create | `src/lib/template-parser.ts` | 变量提取/替换纯函数模块 |
| create | `src/lib/repositories/template-repository.ts` | 模板 CRUD Repository |
| modify | `src/types/models.ts` | 新增 `PromptTemplate` / `TemplateVariable` 类型定义 |
| create | `src/lib/__tests__/template-parser.test.ts` | 变量解析单元测试 |
| create | `src/lib/repositories/__tests__/template-repository.test.ts` | Repository 单元测试 |

## 实现规格

### 1. 类型定义（`src/types/models.ts`）

在文件末尾追加：

```typescript
/** 模板变量定义 */
export interface TemplateVariable {
  name: string;           // 变量名，匹配 [a-zA-Z_]\w* 格式
  defaultValue: string;   // 默认值，用户未填值时使用
}

/** Prompt 模板 */
export interface PromptTemplate {
  id: string;                        // ULID
  name: string;                      // 模板名称，1-50 字符
  content: string;                   // 模板正文（含 {{var}} 标记的 prompt 文本）
  variables: TemplateVariable[];     // 变量定义列表（从 content 自动提取）
  sourceAnalysisTaskId: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. Schema 定义（`src/lib/db/schema.ts`）

在 `generationTasks` 表定义之后新增 `templates` 表：

```typescript
import type { TemplateVariable } from "@/types/models";

/** templates 表 */
export const templates = pgTable(
  "templates",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    content: text("content").notNull(),
    variables: jsonb("variables").$type<TemplateVariable[]>().notNull().default([]),
    sourceAnalysisTaskId: varchar("source_analysis_task_id", { length: 26 }),
    userId: varchar("user_id", { length: 26 }).references(() => users.id).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_templates_user_id").on(table.userId),
    index("idx_templates_user_name").on(table.userId, table.name),
  ]
);
```

关键约束：
- `name`: varchar(50)，应用层校验 1-50 字符
- `content`: text 非空，应用层校验 <= 10000 字符
- `variables`: JSONB 数组，默认空数组 `[]`
- `sourceAnalysisTaskId`: 可选，不设外键约束（避免跨表耦合）
- **不在数据库层建 UNIQUE 约束**处理同名——同名检测在应用层通过先查询实现（返回 409），避免额外错误码映射

### 3. 变量解析模块（`src/lib/template-parser.ts`）

纯函数模块，不依赖任何外部状态或数据库连接。前后端共享（Next.js server/client 边界对纯函数无影响）。

```typescript
import type { TemplateVariable } from "@/types/models";

/** 变量名正则：匹配 {{variableName}} 格式 */
const VARIABLE_PATTERN = /{{([a-zA-Z_]\w*)}}/g;

/**
 * 从模板正文中提取所有变量标记
 * 返回去重的变量定义列表（按首次出现顺序）
 */
export function extractVariables(content: string): TemplateVariable[] {
  const variables: TemplateVariable[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  VARIABLE_PATTERN.lastIndex = 0;

  while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({ name, defaultValue: "" });
    }
  }

  return variables;
}

/**
 * 用变量值替换模板正文中的 {{var}} 标记
 * 按变量名长度降序执行，避免短变量名误替换长变量名的子串
 */
export function replaceVariables(
  content: string,
  values: Record<string, string>
): string {
  let result = content;

  const sortedKeys = Object.keys(values).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g"),
      values[key] ?? ""
    );
  }

  return result;
}

/**
 * 检测模板正文是否包含变量标记
 */
export function hasVariables(content: string): boolean {
  VARIABLE_PATTERN.lastIndex = 0;
  return VARIABLE_PATTERN.test(content);
}
```

设计要点：
- 正则 `/{{([a-zA-Z_]\w*)}}/g` 与 ADR-2 一致
- `extractVariables`: 去重 + 保持首次出现顺序
- `replaceVariables`: 长变量名优先策略（ADR-2 风险对策）
- `hasVariables`: 前端用于判断是否展示变量向导
- 所有函数均为纯函数，便于测试和前后端共享

### 4. Template Repository（`src/lib/repositories/template-repository.ts`）

遵循现有 Repository 模式（参考 `src/lib/repositories/analysis-task-repository.ts`，130 行）：

```typescript
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import { extractVariables } from "@/lib/template-parser";
import type { PromptTemplate } from "@/types/models";

type TemplateRow = typeof templates.$inferSelect;

function rowToTemplate(row: TemplateRow): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    variables: row.variables ?? [],
    sourceAnalysisTaskId: row.sourceAnalysisTaskId ?? null,
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
    sourceAnalysisTaskId?: string;
  }
): Promise<PromptTemplate> {
  const id = generateId();
  const variables = extractVariables(data.content);

  const [row] = await db
    .insert(templates)
    .values({
      id,
      name: data.name,
      content: data.content,
      variables,
      sourceAnalysisTaskId: data.sourceAnalysisTaskId ?? null,
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
 */
export async function findAllByUserId(
  userId: string,
  params: TemplatePaginationParams = {}
): Promise<TemplatePaginatedResult<{ id: string; name: string; variableCount: number; createdAt: Date }>> {
  const limit = Math.min(params.limit ?? 10, 50);

  const baseQuery = db
    .select({
      id: templates.id,
      name: templates.name,
      variableCount: sql<number>`array_length(${templates.variables}, 1)`,
      createdAt: templates.createdAt,
    })
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.createdAt))
    .limit(limit + 1); // 多查一条判断 hasMore

  if (params.cursor) {
    baseQuery.where(and(
      eq(templates.userId, userId),
      lt(templates.createdAt, new Date(params.cursor))
    ));
  }

  const rows = await baseQuery;
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
```

关键模式：
- `rowToTemplate` 转换函数与现有 Repository 一致
- `createTemplate` 内部调用 `extractVariables` 自动构建变量列表（ADR-4）
- `findAllByUserId` 使用 SQL 投影只返回精简字段 + cursor-based 分页
- 所有查询均带 `userId` WHERE 条件（ADR-6 归属校验）
- `deleteTemplate` 在 rowCount=0 时抛异常（供 API 层转换为 404）

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 在 `src/types/models.ts` 中追加 `PromptTemplate` 和 `TemplateVariable` 类型定义 | done | |
| 2 | 在 `src/lib/db/schema.ts` 中新增 `templates` 表的 pgTable 定义 | done | 含字段、索引、JSONB 类型标注 |
| 3 | 创建 `src/lib/template-parser.ts` 变量解析纯函数模块 | done | extractVariables / replaceVariables / hasVariables |
| 4 | 创建 `src/lib/repositories/template-repository.ts` | done | 5 个导出函数 + rowToTemplate |
| 5 | 创建 `src/lib/__tests__/template-parser.test.ts` | done | 覆盖正常/边界/空输入/特殊字符/大量变量场景 |
| 6 | 创建 `src/lib/repositories/__tests__/template-repository.test.ts` | done | 需要 mock db 或使用测试数据库 |
| 7 | 执行 `pnpm db:push` 推送 schema 到数据库 | done | 确认 templates 表创建成功 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 推送 schema 到数据库
pnpm db:push

# 运行模板解析器单元测试
pnpm vitest --run src/lib/__tests__/template-parser.test.ts

# 运行 Repository 测试
pnpm vitest --run src/lib/repositories/__tests__/template-repository.test.ts

# 全量测试（确认无回归）
pnpm test
```

## 预期结果

1. `pnpm type-check` 通过，无类型错误
2. `pnpm db:push` 成功创建 `templates` 表
3. `extractVariables("Hello {{name}}, welcome to {{place}}!")` 返回 `[{name:"name",defaultValue:""},{name:"place",defaultValue:""}]`
4. `replaceVariables("Hi {{name}}, {{name}} is here", {name: "Alice"})` 返回 `"Hi Alice, Alice is here"`
5. `hasVariables("No variables here")` 返回 `false`
6. Repository 的五个函数均可正确执行（测试覆盖）
7. **[成功标准]** 变量解析准确率 >= 99%（测试覆盖合法格式、空输入、特殊字符、大量变量 >20）
8. **[性能目标]** extractVariables 对典型 prompt（<2000 字符）执行耗时 <= 10ms
9. **[性能目标]** replaceVariables 对典型 prompt（<2000 字符, <10 变量）执行耗时 <= 10ms

## 交接上下文

- **架构章节**: 7.2 推荐最小 Schema、7.3 API 边界、ADR-1/ADR-2/ADR-4/ADR-6
- **相关代码**: `src/lib/db/schema.ts`, `src/lib/repositories/analysis-task-repository.ts`, `src/types/models.ts`
- **契约 / 数据对象**: `PromptTemplate`, `TemplateVariable`
- **提供给下游的契约摘要**:

```typescript
// types/models.ts — 新增类型
interface TemplateVariable {
  name: string;           // [a-zA-Z_]\w*
  defaultValue: string;
}
interface PromptTemplate {
  id: string;             // ULID
  name: string;           // 1-50 chars
  content: string;        // 含 {{var}} 的文本
  variables: TemplateVariable[];  // 自动提取
  sourceAnalysisTaskId: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// template-parser.ts — 导出函数
function extractVariables(content: string): TemplateVariable[]
function replaceVariables(content: string, values: Record<string, string>): string
function hasVariables(content: string): boolean

// template-repository.ts — 导出函数
function createTemplate(userId, {name, content, sourceAnalysisTaskId?}): Promise<PromptTemplate>
function findByName(userId, name): Promise<PromptTemplate | null>
function findAllByUserId(userId, params?): Promise<TemplatePaginatedResult<TemplateListItem>>
function findById(id, userId): Promise<PromptTemplate | null>
function deleteTemplate(id, userId): Promise<void>

// 分页相关类型
interface TemplatePaginationParams { cursor?: string; limit?: number }
interface TemplatePaginatedResult<T> { items: T[]; hasMore: boolean; nextCursor: string | null }
```

## 执行指引

- **工具链**: pnpm, Drizzle ORM, Vitest
- **执行顺序**: Task 列表按序执行（类型 → Schema → 解析器 → Repository → 测试 → db:push）
- **阻塞处理**: `pnpm db:push` 失败时检查 DATABASE_URL 是否正确配置、PostgreSQL 是否运行；遇到 schema 冲突时暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - 类型错误：检查 `TemplateVariable` 是否正确从 `@/types/models` 导入到 schema
  - db:push 失败：检查 PostgreSQL 连接、表是否已存在（可先 `pnpm db:reset` 清理）
  - 测试失败：检查 mock 配置是否与现有测试一致
- **允许修改的额外文件**: `src/lib/db/index.ts`（仅限导出补充）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- `findAllByUserId` 使用了 `sql\`array_length()\`` 进行 PostgreSQL 特有聚合，需确认 drizzle-orm 的 `sql` tag 模板支持此语法
- `variables` JSONB 字段的 `$type<TemplateVariable[]>()` 类型标注需要 Drizzle ORM 支持。如不支持可改为 `jsonb("variables")` 并在 `rowToTemplate` 中手动断言类型
- `findAllByUserId` 采用 cursor-based 分页（基于 createdAt 游标），默认每页 10 条，最大 50 条

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 创建前先调 findByName 检查同名，存在则由 API 层返回 409（本任务只提供 findByName 函数） | todo |
| 超时处理 | 纯数据库操作，无外部依赖超时风险；Drizzle 连接池管理超时 | todo |
| 重试场景 | 用户重试保存时重新调用 createTemplate，生成新 ULID（天然幂等安全） | todo |
| 并发冲突 | 同名校验依赖应用层 findByName + 事务插入；高并发下可能产生竞态，但首版并发 < 20 可接受 | todo |
| 空/无效输入 | extractVariables 对空字符串返回 []；content 为空字符串时 variables 为 []（API 层负责拒绝空 content） | todo |
