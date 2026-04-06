---
task_id: "T02"
title: "Schema 扩展与 Repository"
dimension: backend
phase: 1
status: done
depends_on: []
---

# T02: Schema 扩展与 Repository（后端）

## 任务概要

- **目标**: 在 analysis_tasks 和 generation_tasks 表上新增 provider、externalId、modelName（仅 analysis_tasks）字段，更新 Drizzle Schema 定义、领域类型和 Repository 层
- **依赖**: 无
- **所属模块**: DB Schema 扩展
- **前置条件**: 本地 PostgreSQL 运行中（`pnpm db:up`）
- **不在范围**: API 路由改造；Webhook 处理逻辑

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/db/schema.ts` | 新增 provider、externalId、modelName 字段 |
| modify | `src/types/models.ts` | 新增 Provider 类型定义，扩展 AnalysisTask / GenerationTask 接口 |
| modify | `src/lib/repositories/analysis-task-repository.ts` | 更新 createAnalysisTask 和 updateAnalysisTask 支持新字段 |
| modify | `src/lib/repositories/generation-task-repository.ts` | 更新 createGenerationTask 和 updateGenerationTask 支持新字段 |

## 实现规格

### 1. Schema 变更 (`schema.ts`)

在 `analysisTasks` 表定义中新增：

```typescript
provider: varchar("provider", { length: 20 }).notNull().default("gemini"),
externalId: varchar("external_id", { length: 255 }),
modelName: varchar("model_name", { length: 100 }),
```

在 `generationTasks` 表定义中新增：

```typescript
provider: varchar("provider", { length: 20 }).notNull().default("fal"),
externalId: varchar("external_id", { length: 255 }),
```

注意：`generationTasks` 已有 `modelName` 字段，无需再加。

新增 check 约束：

```typescript
// analysisTasks
check("analysis_tasks_provider_check", sql`${table.provider} IN ('replicate', 'gemini')`)

// generationTasks
check("generation_tasks_provider_check", sql`${table.provider} IN ('replicate', 'fal')`)
```

### 2. 类型扩展 (`types/models.ts`)

新增类型：

```typescript
/** 视觉分析 Provider */
export type VisionProviderName = 'replicate' | 'gemini';

/** 图像生成 Provider */
export type ImageGenProviderName = 'replicate' | 'fal';
```

扩展 `AnalysisTask` 接口：

```typescript
export interface AnalysisTask {
  // ... 现有字段 ...
  provider: VisionProviderName;
  externalId: string | null;
  modelName: string | null;
}
```

扩展 `GenerationTask` 接口：

```typescript
export interface GenerationTask {
  // ... 现有字段 ...
  provider: ImageGenProviderName;
  externalId: string | null;
}
```

### 3. Repository 更新

**analysis-task-repository.ts**:

- `rowToAnalysisTask()`: 映射新增 `provider`、`externalId`、`modelName` 字段
- `createAnalysisTask()`: `data` 参数新增可选 `provider`、`modelName`；insert values 包含这些字段
- `AnalysisTaskUpdatable`: 新增 `externalId` 为可更新字段
- `updateAnalysisTask()`: 处理 `externalId` 更新

**generation-task-repository.ts**:

- `rowToGenerationTask()`: 映射新增 `provider`、`externalId` 字段
- `createGenerationTask()`: `data` 参数新增可选 `provider`；insert values 包含该字段
- `GenerationTaskUpdatable`: 新增 `externalId` 为可更新字段
- `updateGenerationTask()`: 处理 `externalId` 更新

新增一个无 userId 查询的函数（Webhook 回调时使用）：

```typescript
/** 按 ID 查询 AnalysisTask（不校验 userId，仅 Webhook 内部使用） */
export async function findAnalysisTaskByIdInternal(id: string): Promise<AnalysisTask | null>;

/** 按 ID 查询 GenerationTask（不校验 userId，仅 Webhook 内部使用） */
export async function findGenerationTaskByIdInternal(id: string): Promise<GenerationTask | null>;
```

### 4. 数据库推送

使用 `pnpm db:push` 将 Schema 变更推送到本地数据库（开发阶段直接 push，不生成迁移文件）。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 更新 `types/models.ts` 新增 Provider 类型和扩展接口 | done | VisionProviderName / ImageGenProviderName + 接口扩展 |
| 2 | 更新 `schema.ts` 新增字段和 check 约束 | done | provider、externalId、modelName |
| 3 | 更新 `analysis-task-repository.ts` | done | rowToAnalysisTask、createAnalysisTask、updateAnalysisTask + findByIdInternal |
| 4 | 更新 `generation-task-repository.ts` | done | rowToGenerationTask、createGenerationTask、updateGenerationTask + findByIdInternal |
| 5 | 执行 `pnpm db:push` 推送 Schema | done | 确认字段创建成功 |
| 6 | 运行 type-check 和现有测试验证 | done | 确认改动不破坏现有代码 |

## 验证命令

```bash
pnpm type-check
pnpm db:push
pnpm test
```

## 预期结果

- Schema 新增字段成功推送到本地 PostgreSQL
- `provider` 字段有默认值（analysis_tasks 默认 'gemini'，generation_tasks 默认 'fal'），现有数据和流程不受影响
- TypeScript 类型检查通过
- 现有单元测试全部通过（Repository 测试如有则包含新字段验证）

## 交接上下文

- **架构章节**: 7.1（核心对象变更）、7.2（新增 Schema）
- **相关代码**: `src/lib/db/schema.ts`、`src/types/models.ts`、`src/lib/repositories/`
- **契约 / 数据对象**: AnalysisTask（+provider, externalId, modelName）、GenerationTask（+provider, externalId）
- **提供给下游的契约摘要**:

```typescript
// analysis-task-repository.ts 新增
export async function findAnalysisTaskByIdInternal(id: string): Promise<AnalysisTask | null>;

// generation-task-repository.ts 新增
export async function findGenerationTaskByIdInternal(id: string): Promise<GenerationTask | null>;

// createAnalysisTask data 参数新增
{ sourceAssetId: string; provider?: VisionProviderName; modelName?: string }

// createGenerationTask data 参数新增
{ ...; provider?: ImageGenProviderName }

// updateAnalysisTask 新增可更新字段
{ ...; externalId?: string | null }

// updateGenerationTask 新增可更新字段
{ ...; externalId?: string | null }
```

## 执行指引

- **工具链**: pnpm, Drizzle ORM, drizzle-kit
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果 `pnpm db:push` 失败，检查 PostgreSQL 是否运行以及 DATABASE_URL 配置
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: Schema push 失败可能是已有数据与新约束冲突（如 provider 字段 NOT NULL 但已有行无默认值）；检查 default 值是否正确设置
- **允许修改的额外文件**: `drizzle.config.ts`（仅限配置调整）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 新增字段使用 `default` 值确保向后兼容：analysis_tasks 默认 `'gemini'`（保持现有行为），generation_tasks 默认 `'fal'`（保持现有行为）
- `externalId` 允许 null（非 Replicate Provider 时为空）
- `findByIdInternal` 函数不校验 userId，仅供 Webhook 回调等服务端内部场景使用

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | Schema 变更幂等（已有字段不重复添加），db:push 自动处理 | done |
| 超时处理 | db:push 操作无特殊超时需求 | waived | 开发阶段本地 DB，不涉及超时 |
| 重试场景 | db:push 可安全重复执行 | done |
| 并发冲突 | 新增字段有默认值，不影响并发写入 | done |
| 空/无效输入 | provider 字段有 check 约束限制合法值 | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
