---
task_id: "T02"
title: "数据模型与访问层"
dimension: backend
phase: 1
status: ready-to-dev
depends_on: ["T01"]
---

# T02: 数据模型与访问层（后端）

## 任务概要

- **目标**: 创建 PostgreSQL 表结构、TypeScript 领域模型接口、ULID 工具和 Repository 层，为所有 API 提供数据访问能力
- **依赖**: T01（项目脚手架已就绪）
- **所属模块**: 数据访问层
- **前置条件**: PostgreSQL 实例可用，DATABASE_URL 已配置
- **不在范围**: API 端点实现、R2 集成、AI 模型调用

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/db.ts` | PostgreSQL 连接池 |
| create | `src/lib/schema.sql` | DDL：assets、analysis_tasks、generation_tasks 表 |
| create | `src/types/models.ts` | TypeScript 接口：Asset、VisualRecipe、AnalysisTask、GenerationTask、GenerationParams |
| create | `src/lib/ulid.ts` | ULID 生成工具 |
| create | `src/lib/repositories/asset-repository.ts` | Asset CRUD |
| create | `src/lib/repositories/analysis-task-repository.ts` | AnalysisTask CRUD |
| create | `src/lib/repositories/generation-task-repository.ts` | GenerationTask CRUD |

## 实现规格

### 1. 数据库连接（db.ts）

- 使用 `pg` 的 `Pool` 创建连接池
- 从 `DATABASE_URL` 环境变量读取连接串
- 导出 `query` 和 `getClient` 方法
- 连接池配置：max 10，idleTimeoutMillis 30000

### 2. DDL（schema.sql）

三张表，数据库命名使用 snake_case：

```sql
-- assets 表
CREATE TABLE assets (
  id          VARCHAR(26) PRIMARY KEY,  -- ULID
  type        VARCHAR(20) NOT NULL,     -- 'reference' | 'generated'
  file_url    TEXT NOT NULL,
  thumbnail_url TEXT,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  mime_type   VARCHAR(50) NOT NULL,     -- image/jpeg, image/png, image/webp
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- analysis_tasks 表
CREATE TABLE analysis_tasks (
  id                   VARCHAR(26) PRIMARY KEY,
  source_asset_id      VARCHAR(26) NOT NULL REFERENCES assets(id),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  recipe               JSONB,           -- VisualRecipe JSON
  prompt_text          TEXT,
  negative_prompt_text TEXT,
  raw_response         TEXT,            -- 视觉模型原始返回
  error_message        TEXT,
  error_stage          VARCHAR(20),     -- 'vision' | 'llm'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- generation_tasks 表
CREATE TABLE generation_tasks (
  id                     VARCHAR(26) PRIMARY KEY,
  analysis_task_id       VARCHAR(26) NOT NULL REFERENCES analysis_tasks(id),
  status                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  prompt_snapshot        TEXT NOT NULL,
  negative_prompt_snapshot TEXT NOT NULL,
  params                 JSONB NOT NULL,    -- GenerationParams
  model_name             VARCHAR(100) NOT NULL,
  result_asset_id        VARCHAR(26) REFERENCES assets(id),
  error_message          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3. TypeScript 接口（models.ts）

严格对齐架构文档 7.2 节定义的 Schema：

- `Asset`：id, type, fileUrl, thumbnailUrl, width, height, mimeType, createdAt
- `VisualRecipe`：imageSummary, subject, scene, composition, cameraLanguage, lighting, color, texture, styleTags, mood, visualKeywords, mustKeep, replaceable
- `AnalysisTask`：id, sourceAssetId, status, recipe, promptText, negativePromptText, rawResponse, errorMessage, errorStage, createdAt, updatedAt
- `GenerationParams`：aspectRatio, quality
- `GenerationTask`：id, analysisTaskId, status, promptSnapshot, negativePromptSnapshot, params, modelName, resultAssetId, errorMessage, createdAt, updatedAt

API / JSON 命名使用 camelCase。

### 4. ULID 工具（ulid.ts）

- 导出 `generateId(): string` 函数
- 使用 `ulid` 包生成

### 5. Repository 层

每个 Repository 导出纯函数，接收 `Pool` 或使用模块级连接池：

**AssetRepository**：
- `createAsset(data): Promise<Asset>` — 插入记录
- `findAssetById(id): Promise<Asset | null>` — 按 ID 查询

**AnalysisTaskRepository**：
- `createAnalysisTask(data): Promise<AnalysisTask>` — 创建 pending 状态任务
- `findAnalysisTaskById(id): Promise<AnalysisTask | null>` — 按 ID 查询（含 recipe JSON 解析）
- `updateAnalysisTask(id, updates): Promise<AnalysisTask>` — 更新状态、recipe、prompt 等

**GenerationTaskRepository**：
- `createGenerationTask(data): Promise<GenerationTask>` — 创建 pending 状态任务
- `findGenerationTaskById(id): Promise<GenerationTask | null>` — 按 ID 查询
- `updateGenerationTask(id, updates): Promise<GenerationTask>` — 更新状态、resultAssetId 等

所有 Repository 需要做 snake_case（DB）与 camelCase（TS）的字段映射。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 db.ts 连接池 | todo | PostgreSQL Pool 配置 |
| 2 | 编写 schema.sql | todo | 三张表的 DDL |
| 3 | 定义 TypeScript 接口 | todo | models.ts，对齐架构 7.2 节 |
| 4 | 实现 ULID 工具 | todo | ulid.ts |
| 5 | 实现 AssetRepository | todo | create + findById |
| 6 | 实现 AnalysisTaskRepository | todo | create + findById + update |
| 7 | 实现 GenerationTaskRepository | todo | create + findById + update |
| 8 | 验证 DDL 可执行 | todo | 手动或脚本执行 schema.sql |

## 验证命令

```bash
pnpm type-check
pnpm build
# 手动执行 DDL
psql $DATABASE_URL -f src/lib/schema.sql
```

## 预期结果

- `pnpm type-check` 通过，所有接口和 Repository 无类型错误
- `pnpm build` 成功
- `schema.sql` 可在 PostgreSQL 中成功执行，三张表创建完成
- Repository 函数签名与架构文档 7.2 节领域对象完全对齐

## 交接上下文

- **架构章节**: 7.1 核心对象、7.2 推荐最小 Schema、7.5 数据边界、7.6 命名与标识规则
- **相关代码**: `src/lib/db.ts`（T01 不创建，本任务创建）
- **契约 / 数据对象**: Asset, VisualRecipe, AnalysisTask, GenerationTask, GenerationParams
- **提供给下游的契约摘要**:

```typescript
// src/types/models.ts - 完整接口定义
// src/lib/repositories/asset-repository.ts
export function createAsset(data: Omit<Asset, 'id' | 'createdAt'>): Promise<Asset>;
export function findAssetById(id: string): Promise<Asset | null>;

// src/lib/repositories/analysis-task-repository.ts
export function createAnalysisTask(data: { sourceAssetId: string }): Promise<AnalysisTask>;
export function findAnalysisTaskById(id: string): Promise<AnalysisTask | null>;
export function updateAnalysisTask(id: string, updates: Partial<AnalysisTask>): Promise<AnalysisTask>;

// src/lib/repositories/generation-task-repository.ts
export function createGenerationTask(data: {
  analysisTaskId: string;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
}): Promise<GenerationTask>;
export function findGenerationTaskById(id: string): Promise<GenerationTask | null>;
export function updateGenerationTask(id: string, updates: Partial<GenerationTask>): Promise<GenerationTask>;
```

## 执行指引

- **工具链**: pnpm, pg, ulid, psql
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 数据库连接不可用时暂停并报告；如果 `pg` 包安装失败，检查 Node.js 版本
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 DATABASE_URL 格式、PostgreSQL 版本兼容性、SQL 语法
- **允许修改的额外文件**: `package.json`（如需添加遗漏依赖）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- VisualRecipe 存为 JSONB 字段，需确保 Repository 层正确序列化/反序列化
- snake_case ↔ camelCase 映射是常见出错点，建议写一个通用的行映射工具函数
