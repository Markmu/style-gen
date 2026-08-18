---
feat_id: "plan-01"
title: "迭代数据层与 API 扩展"
dimension: backend
phase: 1
status: done
depends_on: []
---

# plan-01: 迭代数据层与 API 扩展

## 功能概要

- **目标**: 为 Iteration Memory 提供全部后端能力——`generation_tasks` 内嵌提交时上下文快照列与来源模板关联、`templates` 来源迭代关联、全状态迭代列表/详情读接口、生成与模板写链路扩展；近期迭代条的既有调用保持向后兼容。
- **完成后可观察结果**: 以任意状态（进行中/已完成/失败）调用 `GET /api/generation?status=all&q=...` 能按创建时间倒序拿到带状态、提示摘要与设置摘要的分页条目；`GET /api/generation/[id]` 对三种状态都返回完整上下文（新记录带快照、旧记录回退活引用并标记来源）。新建生成任务时，当时的配方与变量被服务端固化为快照。携带 `sourceGenerationTaskId` 保存 Style Memory 时能建立反向关联并被校验。近期迭代条（无参数默认调用）行为与现在完全一致。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-06]
- **涉及架构模块**: 生成任务仓库、生成读链路 API、生成写链路、入口与沉淀（templates 写接口部分）
- **前置条件**: 本地 PostgreSQL 可用（`pnpm db:up`）；架构文档 §6/§7 已定稿
- **不在范围**: 前端页面与组件（plan-02 起）；删除/批量/保留期管理；全文检索引擎；Provider、Webhook、分析链路的任何改动

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/db/schema.ts` | generation_tasks 增 3 列 + 索引；templates 增 1 列 + 索引 |
| create | `drizzle/<生成时间戳>-iteration_memory.sql` | `pnpm db:generate` 产物（文件名以工具输出为准），人工审查后本地应用 |
| modify | `src/types/models.ts` | IterationListItem / IterationDetail / GenerationTask 扩展字段 |
| modify | `src/lib/repositories/generation-task-repository.ts` | listIterations、findIterationDetail、createGenerationTask 快照写入 |
| modify | `src/app/api/generation/route.ts` | GET 参数扩展与条目 DTO；POST 快照固化与 sourceTemplateId |
| modify | `src/app/api/generation/[id]/route.ts` | 全状态详情 DTO |
| modify | `src/app/api/templates/route.ts` | sourceGenerationTaskId 校验与落库 |
| modify | `src/lib/repositories/__tests__/generation-task-repository.test.ts` | 仓库相邻测试 |
| modify | `src/app/api/generation/__tests__/route.test.ts` | 列表/创建路由相邻测试 |
| modify | `src/app/api/generation/[id]/__tests__/route.test.ts` | 详情路由相邻测试 |
| modify | `src/app/api/templates/__tests__/route.test.ts` | 模板路由相邻测试 |

## 实现规格

### 后端部分

#### 1. Schema 扩展（`src/lib/db/schema.ts`）

- `generation_tasks` 新增：`recipe_snapshot` jsonb `$type<StoredVisualRecipe | null>()`、`variables_snapshot` jsonb `$type<TemplateVariable[] | null>()`、`source_template_id` varchar(26) 可空外键 → `templates.id`。
- `templates` 新增：`source_generation_task_id` varchar(26) 可空外键 → `generation_tasks.id`，索引 `idx_templates_source_generation`。
- `generation_tasks` 新增索引 `idx_generation_tasks_user_created (user_id, created_at DESC, id DESC)` 支撑列表游标查询。
- 循环外键处理：两表互相引用时 Drizzle 生成可能报循环引用。若失败，`source_template_id` 保留 FK，`source_generation_task_id` 以普通列 + 索引落地，并在迁移 SQL 中手工补 `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`；最终选择记录在 Task 2 说明中。
- 仅新增可空列与索引，不回填、不改既有列，迁移对存量数据无破坏。

#### 2. 类型（`src/types/models.ts`）

- `IterationListItem`、`IterationDetail` 按架构 §7.2 定义（详情含 `sourceAssetId: string | null` 与 `recipeSource`/`variablesSource: "snapshot" | "fallback" | "missing"`）。
- `IterationDetail` 额外含 `sourceTemplateId: string | null`（与 `sourceTemplateName` 同一联表来源；供恢复链路还原工作台"当前应用模板"，消费方见 plan-04）。
- `GenerationTask` 增 `recipeSnapshot`、`variablesSnapshot`、`sourceTemplateId`。
- 展示态状态类型 `"processing" | "completed" | "failed"`（`pending` 归并为 `processing`）与查询参数类型 `"all" | "processing" | "completed" | "failed"`。

#### 3. 仓库 listIterations（`generation-task-repository.ts`）

- 入参 `{ userId, q, status, cursor, pageSize }`；条件：`user_id = :userId` + 状态（`all` 不加；`processing` → `status IN ('pending','processing')`）+ `q` 非空时 `(prompt_snapshot ILIKE :pattern OR templates.name ILIKE :pattern)`（LEFT JOIN templates ON `source_template_id`，`:pattern = '%' + q + '%'`）。
- 排序 `created_at DESC, id DESC`；keyset 游标沿用 `listCompleted` 的 `"createdAt::id"` 格式与边界处理；`LIMIT size + 1` 判断更早记录。
- 条目映射：`promptSummary = promptSnapshot.slice(0, 120)`；`resultFileUrl` 仅 completed 且结果资产联表有值，否则 null。

**安全要求（架构 §8.3）**：`q` trim 后长度 ≤ 100（超出返回 400，不做静默截断）、`status` 白名单、`pageSize` clamp [1, 50]、全部查询强制 `userId` 归属过滤。

**可观测性（架构 §8.5）**：GET 成功路径输出结构化日志 `iteration_list_queried { duration, itemCount, hasQ, statusFilter, userId }`。

#### 4. 仓库 findIterationDetail

- 单条联表：generation_tasks LEFT JOIN analysis_tasks（活引用）、assets（结果）、assets alias（来源图）、templates（来源名，ON `source_template_id`）、templates（已保存，ON `source_generation_task_id = generation_tasks.id` 取 `created_at` 最新一条）。
- 组装算法（架构 §6.2，逐字段显式）：`recipe = recipe_snapshot ?? analysis.recipe` → `recipeSource = snapshot | fallback`，两者皆无 → `missing`；`variables` 同算法；`sourceAssetId = analysis.source_asset_id ?? null`；`sourceImageUrl = 来源资产.file_url ?? null`；`savedTemplate = 最新关联模板 { id, name } ?? null`。
- `pending` 归并为 `processing`；completed 返回 `resultFileUrl`，其余返回 null + `errorMessage`。

**可观测性（架构 §8.5）**：输出 `iteration_detail_queried { status, recipeSource, hasSavedTemplate }`。

#### 5. createGenerationTask 快照写入 + POST /api/generation

- POST 在校验 analysis task（存在、归属、completed）后，将 `analysisTask.recipe` 与 `analysisTask.analysisTemplateVariables` 固化写入 `recipe_snapshot` / `variables_snapshot`（system_generated，服务端权威，ADR-2）。
- 请求体新增可选 `sourceTemplateId`（frontend_computed：工作台当前应用的 Style Memory id）；服务端校验该模板存在且属于当前 `userId`，否则 400 `INVALID_REQUEST`。

#### 6. GET /api/generation 列表扩展

- 解析 `q` / `status`；`status` 缺省时默认 `completed`（近期迭代条兼容，`useHistoryList` 既有行为不变）。
- 响应条目为 IterationListItem（增补 `status` / `promptSummary` / `params`），保留既有字段 `id` / `resultFileUrl` / `createdAt` 与 `nextCursor` 结构。

#### 7. GET /api/generation/[id] 全状态详情

- 统一改走 `findIterationDetail`（替代 completed-only 的 `findByIdWithRecipe` 分支 + 回退分支）；404 与错误结构保持。
- 响应为既有字段超集（架构 §7.3"既有轮询消费方向后兼容"）：保留 `resultAssetId`、`analysisTemplateVariables` 等既有消费字段——`use-history-restore.ts` 依赖 `analysisTemplateVariables` 做变量回退；新增字段只增不删。

#### 8. POST /api/templates 来源迭代关联

- `CreateTemplateRequest` 增可选 `sourceGenerationTaskId`（frontend_computed：当前迭代 id）；校验：任务存在、归属当前用户、`status === 'completed'` 且 `resultAssetId` 非空，否则 400 `INVALID_REQUEST`；通过则随 `createTemplate` 落库。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | schema 列与索引 | backend | done | 按 §1 规格；4 个可空列 + 2 索引 + 2 FK |
| 2 | 生成并审查迁移 | backend | done | 实际文件 `drizzle/0003_swift_nitro.sql`；循环 FK 未触发 Drizzle 报错，两条 FK 均以惰性引用直接生成并 `pnpm db:push` 应用（无需备选的普通列 + 手工 ALTER 方案），TypeScript 侧用 `AnyPgColumn` 注解打断循环类型推断；已 psql 验证列/索引/FK 落地 |
| 3 | models 类型扩展 | backend | done | IterationListItem / IterationDetail（含 sourceTemplateId）/ GenerationTask 字段与三值展示态类型 |
| 4 | listIterations + 单测 | backend | done | 状态过滤（含 pending 归并 IN 条件绑定参数级断言）、q 双字段 ILIKE、keyset 游标、跨用户隔离（userId 条件断言）、pageSize clamp |
| 5 | findIterationDetail + 单测 | backend | done | 快照/回退/缺失三来源、savedTemplate 最新关联（DISTINCT ON 子查询）、三状态返回 |
| 6 | POST 快照固化与 sourceTemplateId + 单测 | backend | done | 服务端固化 recipe/variables 快照；非法 sourceTemplateId 400（归属校验经 template-repository.findById） |
| 7 | GET 列表参数扩展 + 兼容断言 | backend | done | 默认 completed 兼容断言；q/status 白名单校验 400；iteration_list_queried 日志 |
| 8 | GET [id] 全状态详情 + 单测 | backend | done | 三状态 DTO、既有字段超集（resultAssetId/analysisTemplateVariables）、404/401/500 保持；iteration_detail_queried 日志 |
| 9 | POST /api/templates sourceGenerationTaskId + 单测 | backend | done | 归属/completed/结果资产校验与 400 分支；落库说明：`template-repository.ts` 不在本功能文件清单内，"随 createTemplate 落库"以清单内 generation-task-repository 的 `linkTemplateToGenerationTask`（createTemplate 成功后立即 UPDATE templates.source_generation_task_id + userId 归属过滤）实现，语义等价，留待 task-review 决定是否后续收拢进 createTemplate |
| 10 | 全量自检 | backend | done | 相邻测试 105/105 绿、`pnpm test` 737/737 绿、`pnpm type-check` 零错误、`pnpm lint` 0 errors、近期条默认 completed 兼容断言绿；性能验收计时见 green 证据 |

## 验收标准

### 后端验收

- [x] AC-01 `GET /api/generation?status=all` 返回全部状态条目，`pending` 归并为 `processing`，按创建时间倒序
- [x] AC-01 无 `status` 参数的默认调用仍只返回 completed，且 `id` / `resultFileUrl` / `createdAt` 字段保留（近期迭代条 `useHistoryList` 兼容）
- [x] AC-02 `q` 命中 `promptSnapshot` 或来源模板名（ILIKE 大小写不敏感），与 `status` 可组合生效
- [x] AC-03 新任务创建即固化 recipe/variables 快照；存量旧行回退活引用并返回 `recipeSource/variablesSource = fallback`；两者皆无返回 `missing`
- [x] AC-03 详情返回 `sourceAssetId` / `sourceImageUrl`，来源资产缺失时为 null（前端缺失标记依据）
- [x] `GET /api/generation/[id]` 响应为既有字段超集：`resultAssetId`、`analysisTemplateVariables` 等既有字段保留（`use-history-restore` 消费不破坏，相邻测试断言）
- [x] AC-06 `POST /api/templates` 携带 `sourceGenerationTaskId` 时校验归属 + completed + resultAssetId，非法返回 400
- [x] `POST /api/generation` 携带非法 `sourceTemplateId` 返回 400
- [x] 未登录请求 401 结构 `{ error, code: "UNAUTHORIZED", retryable: false }` 保持
- [x] keyset 游标翻页无重复无遗漏；`q` 超 100 字符返回 400；`pageSize` clamp [1, 50]
- [x] 相邻仓库/路由测试全绿；`pnpm type-check` 通过

### 性能验收（架构 §8.1 目标）

- [x] 本地 seed 250 条记录后直接 SQL 计时（各 50 次取 P95）：列表 P95 0.90ms（< 500ms）、详情 P95 0.60ms（< 300ms）；方法与数字见 `docs/e2e/evidence/plan-01-e2e-green-2026-08-17.md`

## 验证命令

```bash
pnpm db:generate                 # 生成迁移，人工审查产物
pnpm db:push                     # 本地应用
pnpm vitest --run src/lib/repositories/__tests__/generation-task-repository.test.ts src/app/api/generation/__tests__/route.test.ts "src/app/api/generation/[id]/__tests__/route.test.ts" src/app/api/templates/__tests__/route.test.ts
pnpm type-check
```

### 验证记录

- Red 证据（相邻 Vitest，E2E 不适用 waiver）: `docs/e2e/evidence/plan-01-e2e-red-2026-08-17.md`
- Green 证据（含性能验收计时）: `docs/e2e/evidence/plan-01-e2e-green-2026-08-17.md`

## 交接上下文

- **架构章节**: §5 ADR-1/2/3/5、§6.1/6.2/6.4、§7（契约与 Schema）、§8.1/8.3/8.5
- **相关代码**: `src/lib/db/schema.ts`、`src/lib/repositories/generation-task-repository.ts`（现有 `listCompleted` 的游标实现是 listIterations 的参照）、`src/app/api/generation/route.ts`
- **契约 / 数据对象**: `IterationListItem`、`IterationDetail`（架构 §7.2）；游标格式 `"createdAt::id"`
- **下游消费方**: plan-02（列表接口）、plan-03（详情接口）、plan-05（templates sourceGenerationTaskId）；近期迭代条（默认参数兼容）

## 风险与边界

- **执行顺序**: 按 Task 列表顺序执行
- **验证失败排查方向**: 迁移失败先看 `drizzle/` 产物与 `pnpm db:logs`；列表测试失败优先检查 join 条件与游标比较符；详情测试失败优先检查快照回退三元逻辑
- **允许修改的额外文件**: `drizzle/` 下由 `pnpm db:generate` 产生的新迁移文件（属交付物）
- **暂停条件**: Drizzle 循环 FK 两种方案均无法生成合法迁移、需要修改既有列约束或类型、或发现必须改动 webhook/analysis 链路才能实现时，停止并请求确认
- **E2E 不适用说明**: 纯后端功能，无直接用户界面；接口行为以相邻路由/仓库 Vitest 为直接质量门，用户可观察行为由 plan-02/03 的页面 E2E 通过同一接口间接承接
- **风险备注**: ILIKE 随数据量增长的性能风险已知（架构 §8.6，演进 pg_trgm）；快照 jsonb 增加单行体积，可接受

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| `q` 为空串或纯空白 | trim 后视为无搜索条件 | done |
| `q` 超过 100 字符 | 400 INVALID_REQUEST | done |
| 非法 `status` 值 | 400 INVALID_REQUEST | done |
| `pageSize` 越界（0 / 负数 / > 50） | clamp 到 [1, 50] | done |
| 跨用户访问他人迭代 id | 404 NOT_FOUND | done |
| 存量记录快照列为空 | 回退活引用 + `fallback` 标记 | done |
| 活引用也缺失（analysis 无 recipe） | `missing` 标记，其余字段照常返回 | done |
| `sourceGenerationTaskId` 指向非 completed 或无结果任务 | 400 INVALID_REQUEST | done |
| `sourceTemplateId` 不属于当前用户 | 400 INVALID_REQUEST | done |
| 迁移在已有数据库执行 | 仅新增可空列与索引，无回填无破坏 | done |
