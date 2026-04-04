---
task_id: "T03"
title: "数据关联与隔离改造"
dimension: backend
phase: 2
status: in-progress
depends_on: ["T01"]
---

# T03: 数据关联与隔离改造（后端）

## 任务概要

- **目标**: 在现有 3 张业务表（assets、analysis_tasks、generation_tasks）中增加 `user_id` 外键列，改造 Repository 层支持 userId 参数（创建时写入、查询时过滤），改造 API Route 从 session 获取 userId 并传递给 Repository
- **依赖**: T01（`auth()` 函数和 users 表可用）
- **所属模块**: 现有业务 Repository（改造）、现有业务 API（改造）
- **前置条件**: T01 已完成；users 表已创建；`auth()` 可返回 session 含 `user.id`
- **不在范围**: Middleware 认证逻辑（T02）、前端 UI（T04）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/schema.sql` | 3 张表各增加 user_id 列和外键约束 |
| modify | `src/lib/repositories/asset-repository.ts` | createAsset 增加 userId 参数 |
| modify | `src/lib/repositories/analysis-task-repository.ts` | createAnalysisTask 增加 userId，findById 增加 userId 过滤 |
| modify | `src/lib/repositories/generation-task-repository.ts` | createGenerationTask 增加 userId，findById 增加 userId 过滤 |
| modify | `src/app/api/upload/presign/route.ts` | 从 session 获取 userId（预留，presign 本身不写 DB） |
| modify | `src/app/api/analysis/route.ts` | 从 session 获取 userId，传递给 createAssetWithId 和 createAnalysisTask |
| modify | `src/app/api/analysis/[id]/route.ts` | 从 session 获取 userId，查询时验证数据归属 |
| modify | `src/app/api/generation/route.ts` | 从 session 获取 userId，传递给 createGenerationTask 和 createAsset |
| modify | `src/app/api/generation/[id]/route.ts` | 从 session 获取 userId，查询时验证数据归属 |

## 实现规格

### 1. Schema 变更（追加到 `src/lib/schema.sql`）

在现有 3 张表的 DDL 中各增加 `user_id` 列：

```sql
-- 为已有表添加 user_id 列（允许 NULL 兼容匿名历史数据，ADR-11）
ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id VARCHAR(26) REFERENCES users(id);
ALTER TABLE analysis_tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(26) REFERENCES users(id);
ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(26) REFERENCES users(id);
```

同时在表的 CREATE TABLE DDL 中也加入 `user_id` 列（供全新建库使用）。

### 2. Repository 改造原则

所有改造遵循 ADR-9 和 ADR-11：
- **创建方法**：新增必选参数 `userId: string`，INSERT 时写入 `user_id`
- **查询方法**：新增必选参数 `userId: string`，WHERE 条件增加 `AND user_id = $N`
- **更新方法**：不改签名（updateAnalysisTask、updateGenerationTask 已通过 ID 定位，且内部调用方已持有 userId）
- user_id 为 NULL 的匿名数据自然被 `WHERE user_id = ?` 排除，无需额外处理

### 3. asset-repository.ts 改造

```typescript
// 改造前
export async function createAsset(data: Omit<Asset, "id" | "createdAt">): Promise<Asset>

// 改造后
export async function createAsset(userId: string, data: Omit<Asset, "id" | "createdAt">): Promise<Asset>
```

- INSERT 语句增加 `user_id` 列
- `rowToAsset` 映射增加 `userId` 字段
- `AssetRow` 接口增加 `user_id: string | null`
- `findAssetById` 不增加 userId 参数（内部调用场景，如 generation 查关联 asset）

### 4. analysis-task-repository.ts 改造

```typescript
// 改造前
export async function createAnalysisTask(data: { sourceAssetId: string }): Promise<AnalysisTask>
export async function findAnalysisTaskById(id: string): Promise<AnalysisTask | null>

// 改造后
export async function createAnalysisTask(userId: string, data: { sourceAssetId: string }): Promise<AnalysisTask>
export async function findAnalysisTaskById(id: string, userId: string): Promise<AnalysisTask | null>
```

- `createAnalysisTask` INSERT 增加 `user_id`
- `findAnalysisTaskById` WHERE 增加 `AND user_id = $2`
- `AnalysisTaskRow` 增加 `user_id: string | null`
- `rowToAnalysisTask` 映射增加 `userId`
- `updateAnalysisTask` 不改签名

### 5. generation-task-repository.ts 改造

```typescript
// 改造前
export async function createGenerationTask(data: { ... }): Promise<GenerationTask>
export async function findGenerationTaskById(id: string): Promise<GenerationTask | null>

// 改造后
export async function createGenerationTask(userId: string, data: { ... }): Promise<GenerationTask>
export async function findGenerationTaskById(id: string, userId: string): Promise<GenerationTask | null>
```

- 同上模式

### 6. API Route 改造

所有业务 API Route 需要在处理逻辑开头获取 session：

```typescript
import { auth } from "@/auth";

// 在 POST/GET handler 中
const session = await auth();
const userId = session!.user.id;
// 注意：此时 middleware（T02）已保证 session 存在，所以用 ! 断言安全
// 如果 T02 尚未完成，可临时加 if (!session) return 401 的防御代码
```

#### POST /api/analysis（`src/app/api/analysis/route.ts`）

- 获取 `userId`
- `createAssetWithId` 的 INSERT 语句增加 `user_id` 参数
- `createAnalysisTask` 调用增加 `userId` 参数
- **事务化**（架构 8.2）：`createAssetWithId` 和 `createAnalysisTask` 应在同一个数据库事务中执行，使用 `const client = await pool.connect(); await client.query('BEGIN'); ... await client.query('COMMIT');`，失败时 `ROLLBACK`，避免创建孤立 Asset

#### GET /api/analysis/[id]（`src/app/api/analysis/[id]/route.ts`）

- 获取 `userId`
- `findAnalysisTaskById(id, userId)` — 如果任务不属于当前用户，返回 404（而非 403，避免信息泄露）

#### POST /api/generation（`src/app/api/generation/route.ts`）

- 获取 `userId`
- `findAnalysisTaskById` 调用增加 `userId` — 确认分析任务属于当前用户
- `createGenerationTask` 调用增加 `userId`
- `createAsset`（生成图 Asset）调用增加 `userId`

#### GET /api/generation/[id]（`src/app/api/generation/[id]/route.ts`）

- 获取 `userId`
- `findGenerationTaskById(id, userId)` — 如果任务不属于当前用户，返回 404

#### POST /api/upload/presign（`src/app/api/upload/presign/route.ts`）

- 获取 `userId` 并记录到日志中（presign 本身不直接写业务表，Asset 记录在 POST /api/analysis 中创建）
- 如果后续需要在 presign 阶段就创建 Asset，预留 userId

### 7. 类型模型更新

在 `src/types/models.ts`（或对应位置）中，为 `Asset`、`AnalysisTask`、`GenerationTask` 接口增加 `userId: string | null` 字段。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 更新 `src/lib/schema.sql`，3 张表增加 user_id 列 | done | CREATE TABLE 和 ALTER TABLE |
| 2 | 在本地数据库执行 ALTER TABLE 语句 | done | `pnpm db:reset` 或手动 ALTER |
| 3 | 改造 `asset-repository.ts` | done | createAsset 增加 userId |
| 4 | 改造 `analysis-task-repository.ts` | done | createAnalysisTask + findById 增加 userId |
| 5 | 改造 `generation-task-repository.ts` | done | createGenerationTask + findById 增加 userId |
| 6 | 更新类型定义，增加 userId 字段 | done | Asset、AnalysisTask、GenerationTask 接口 |
| 7 | 改造 `POST /api/analysis` route | done | 获取 session userId，传入 repo |
| 8 | 改造 `GET /api/analysis/[id]` route | done | 验证数据归属 |
| 9 | 改造 `POST /api/generation` route | done | 获取 session userId，传入 repo |
| 10 | 改造 `GET /api/generation/[id]` route | done | 验证数据归属 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 单元测试（现有测试需适配 userId 参数）
pnpm test

# 构建
pnpm build

# 数据库验证
docker exec -it style-gen-db psql -U user -d style_gen -c "\d assets" | grep user_id
docker exec -it style-gen-db psql -U user -d style_gen -c "\d analysis_tasks" | grep user_id
docker exec -it style-gen-db psql -U user -d style_gen -c "\d generation_tasks" | grep user_id
```

## 预期结果

- `pnpm type-check` 无错误
- `pnpm test` 所有测试通过（现有测试需适配新参数）
- `pnpm build` 成功
- 3 张表均有 `user_id` 列，类型为 `VARCHAR(26)`，可为 NULL
- 已登录用户创建的数据 `user_id` 正确写入
- 查询 API 只返回当前用户的数据，不返回其他用户或匿名数据

## 交接上下文

- **架构章节**: ADR-9 数据关联、ADR-11 匿名数据策略、7.2 推荐最小 Schema、7.3 API 边界
- **相关代码**: `src/auth.ts`（T01 产出）、所有 repository 文件、所有 API route 文件
- **契约 / 数据对象**: `Asset`（+userId）、`AnalysisTask`（+userId）、`GenerationTask`（+userId）
- **提供给下游的契约摘要**:

```typescript
// Repository 新签名
createAsset(userId: string, data: Omit<Asset, "id" | "createdAt">): Promise<Asset>
createAnalysisTask(userId: string, data: { sourceAssetId: string }): Promise<AnalysisTask>
createGenerationTask(userId: string, data: { ... }): Promise<GenerationTask>
findAnalysisTaskById(id: string, userId: string): Promise<AnalysisTask | null>
findGenerationTaskById(id: string, userId: string): Promise<GenerationTask | null>

// API Route 行为变更
// 所有业务 API 从 session 获取 userId，传递给 Repository
// 查询 API 仅返回属于当前用户的数据
// 不属于当前用户的数据返回 404
```

## 执行指引

- **工具链**: pnpm, PostgreSQL, Next.js App Router
- **执行顺序**: Task 列表按序执行；Task 3-5（Repository 改造）可并行；Task 7-10（API Route 改造）可并行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 现有单元测试可能因 Repository 函数签名变化而失败，需要更新 mock 和调用方式；检查 SQL 语法（ALTER TABLE IF NOT EXISTS）；检查 `auth()` 在 API Route 中是否正确返回 session
- **允许修改的额外文件**: `src/types/models.ts`（类型定义）、现有单元测试文件（适配新参数）、`src/app/api/analysis/route.ts` 中的 `createAssetWithId` 内联函数（增加 user_id）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 这是改造量最大的任务（9 个文件），但每个文件的改动模式统一，复杂度可控
- 现有单元测试大概率需要适配：mock 的 Repository 函数签名变化，测试中需要传入 userId 参数
- `createAssetWithId` 是 `analysis/route.ts` 中的内联函数（不在 asset-repository 中），需要单独改造其 INSERT 语句增加 user_id
- 查询不匹配时返回 404 而非 403，避免信息泄露（不让攻击者知道资源是否存在）
- T02 和 T03 可并行执行：T02 负责 middleware 层拦截，T03 负责数据层改造。即使 T02 未完成，T03 在 API Route 中仍应加 `if (!session) return 401` 的防御代码

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | `createAssetWithId` 已使用 `ON CONFLICT DO UPDATE`，增加 user_id 后仍幂等 | todo |
| 超时处理 | 数据库操作依赖连接池超时配置，无额外超时需求 | todo |
| 重试场景 | 用户重试创建任务时，新任务使用新 ID，不影响已有数据 | todo |
| 并发冲突 | 同一用户并发创建任务无冲突（每次生成新 ULID） | todo |
| 空/无效输入 | userId 从 session 获取，由 Auth.js 保证合法性 | todo |
