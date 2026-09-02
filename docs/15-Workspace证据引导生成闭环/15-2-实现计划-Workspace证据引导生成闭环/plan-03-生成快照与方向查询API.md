---
feat_id: "plan-03"
title: "生成快照与方向查询 API"
dimension: backend
phase: 2
status: done
depends_on: ["plan-01"]
---

# plan-03: 生成快照与方向查询 API

## 功能概要

- **目标**: 扩展 GenerationTask 持久化与现有 API，固化 Prompt 控制快照，提供按分析方向分组的 completed/active/latestFailure feed，保证 Provider 启动异常落入终态，并允许用户自己的生成 Asset 直接开始新分析。
- **完成后可观察结果**: 任一新 Iteration 都能恢复当时的意图、表达、变量、调整与生成参数；旧任务没有快照时诚实返回全文降级。方向查询始终返回最近五个成功结果，进行中和最近失败不会挤占名额。Provider 在启动/提交阶段抛错时任务会变为 failed 而非永久 processing；用户可用自己生成的 Asset 启动新分析，其他用户资产始终不可访问。
- **依赖**: plan-01（共享类型、快照和画幅校验）
- **关联验收标准**: [AC-01, AC-04, AC-07]
- **涉及架构模块**: Analysis & Generation Routes、Persistence & Repositories
- **前置条件**: 本地 PostgreSQL 可启动；现有 analysis/generation route 与 repository 测试基线通过。
- **不在范围**: 方向结果 UI（plan-05）；快速授权客户端 effect（plan-02）；Style Memory UI（plan-06）。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/db/schema.ts` | generation_tasks 新增 nullable prompt_control_snapshot JSONB |
| create | `drizzle/0006_*.sql` | `pnpm db:generate` 生成的只增列迁移（basename 以工具输出为准） |
| create | `drizzle/meta/0006_snapshot.json` | Drizzle 生成快照 |
| modify | `drizzle/meta/_journal.json` | Drizzle 迁移日志 |
| modify | `src/lib/repositories/generation-task-repository.ts` | 保存/读取快照与 getDirectionIterationFeed 三组查询 |
| modify | `src/lib/repositories/__tests__/generation-task-repository.test.ts` | 快照、隔离、排序与配额测试 |
| modify | `src/lib/repositories/asset-repository.ts` | 新增 findAssetByIdForUser |
| modify | `src/lib/repositories/__tests__/asset-repository.test.ts` | 资产归属测试 |
| modify | `src/app/api/generation/route.ts` | direction GET、快照校验、trigger、Provider 异常终态与日志 |
| modify | `src/app/api/generation/__tests__/route.test.ts` | 请求校验、方向 feed、429 与 Provider 抛错测试 |
| modify | `src/app/api/generation/[id]/route.ts` | 返回 promptControlSnapshot 与旧任务 null |
| modify | `src/app/api/generation/[id]/__tests__/route.test.ts` | 新旧详情契约测试 |
| modify | `src/app/api/analysis/route.ts` | 增加 sourceAssetId 判别联合与服务端元数据读取 |
| modify | `src/app/api/analysis/__tests__/route.test.ts` | 已有 Asset、越权、非法联合与限流测试 |

## 实现规格

### 后端部分

#### 1. Schema 与迁移

- `generation_tasks.prompt_control_snapshot JSONB NULL`；不回填旧行、不新增表/方向实体/版本表。
- 运行 `pnpm db:generate` 产生 0006 SQL 与 meta；人工确认只有目标列变化，在可丢弃本地库执行 apply/reset，记录实际命令与结果。

#### 2. Repository 契约

- create/read GenerationTask 透传 `PromptControlSnapshot | null`；详情旧记录保持 null，不从 promptSnapshot 推测控制值。
- `getDirectionIterationFeed(userId, analysisTaskId, pageSize=5)` 执行三个有界数据库查询：completed 5、pending/processing 最新 1、failed 最新 1；全部 createdAt/id 倒序并强制 userId/analysisTaskId。
- completed/active/latestFailure 不共享配额；DTO 返回 resultAssetId、真实 URL 与截断 errorMessage，不在内存先取混合五条再分组。

#### 3. Generation API

- `GET ?view=direction&analysisTaskId&pageSize=5`：字段来源均为 frontend_computed；userId/auth derived；方向 pageSize 仅 1-5。未带 direction view 保持既有 status/cursor 契约。
- `POST`：analysisTaskId/sourceTemplateId 为 frontend_computed，prompt/negative/params 为 user_input+derived，promptControlSnapshot/trigger 为 derived；服务端校验模型、画幅、枚举、最大 20 变量、10 adjustments、单值 200、customTemplate 6000、Recipe invariant/variable ID。
- task 创建并进入 processing 后，Provider 启动/提交放入显式 try/catch；异常先 best-effort 写 failed+安全错误摘要，再返回可重试错误。终态写入失败输出 `generation_failed_status_write_failed` critical 日志，含 taskId/analysisTaskId/provider，不含 Prompt。
- 保留现有认证、用户级 rate limit、同步/Replicate webhook/超时行为：同步生成超时固定为 `120_000ms`，Replicate 异步 task 在提交成功后调用既有 timeout timer 并固定为 `300_000ms`；重试永远创建新 task。Provider 启动异常捕获不得覆盖先前已写入的 failed/completed 终态。

#### 4. 已有 Asset 分析

- `/api/analysis` 使用判别联合：上传模式沿用 assetId/fileUrl/width/height/mimeType；已有资产模式只接 frontend_computed `sourceAssetId`。
- 服务端 `findAssetByIdForUser` 派生 URL/尺寸/MIME，拒绝不归属、缺失、非图片或客户端混入元数据；不复制 Asset，不改 type。

#### 5. 安全与可观测性（架构 §8.3/§8.5）

- 所有资源按认证 userId 隔离；快照不参与权限决定；错误文本输出前截断；凭据与完整 Prompt 不进日志。
- 结构化事件：`analysis_existing_asset_started`、`direction_iterations_queried`（duration/completedCount/hasActive/hasLatestFailure）、`generation_request_received`（trigger）、`prompt_control_snapshot_rejected`、`generation_provider_start_failed`、critical 写终态失败。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：repository/API 契约与超时测试 | backend | done | 五成功独立配额、旧快照、越权、Provider 异常、120000/300000ms fake-timer 断言 |
| 2 | Schema + 0006 迁移生成与审查 | backend | done | 只增 nullable JSONB，不回填 |
| 3 | 扩展 Generation repository | backend | done | 快照与三组有界查询 |
| 4 | 扩展 Asset repository | backend | done | user-scoped read |
| 5 | 实现 generation GET/POST/detail | backend | done | 校验、终态、日志、兼容列表 |
| 6 | 实现 analysis sourceAssetId 分支 | backend | done | 服务端派生元数据 |
| 7 | 迁移 fresh apply/reset 与 green 测试 | backend | done | 仅在确认可丢弃的本地开发库执行 reset→push，保存 SQL/meta 审查和 fresh apply 结果 |
| 8 | fast gate | backend | done | type/lint/unit/workflow 全绿 |

## 验收标准

### API 与数据验收

- [x] AC-04 同一方向有 ≥6 completed 且夹杂 processing/failed 时，feed 仍返回最近 5 个 completed + 独立 active/latestFailure。
- [x] AC-04 direction feed 不泄露其他用户/方向；普通 Iteration cursor/status 行为不变。
- [x] AC-01 新 task 持久化 promptControlSnapshot、params、trigger，详情可回证快速确认值；旧 task 返回 null 并由消费端全文降级。
- [x] AC-07 Provider 启动/提交抛错后 task 为 failed；failed 写入异常产生 critical 日志且不泄露敏感内容。
- [x] AC-07 fake-timer/mock 回归锁定同步 `120_000ms` 与 Replicate 异步 `300_000ms`：同步超时不覆盖已落 failed/completed 的终态，异步成功提交调用 `startTimeoutTimer(..., 300_000)`。
- [x] AC-07 sourceAssetId 仅可读取当前用户真实图片元数据，混合请求/越权/缺失返回稳定错误且不调用分析 Provider。
- [x] 认证、枚举、长度、Recipe 引用、429 和 Provider 不被调用的拒绝路径均有自动化测试。
- [x] 迁移 SQL/meta 只包含目标 nullable JSONB 增量；在经确认可丢弃的本地开发库完成 `db:reset → db:push` fresh apply，并在本功能执行证据中记录命令、目标环境和结果。

### 性能验收（架构 §8.1）

- [x] 单用户 ≤500 generation rows 时三个有界方向查询合计 p95 ≤300ms；记录 scoped repository benchmark/EXPLAIN 证据，超目标才评估复合索引。

### E2E 适用性

- [x] 本功能是服务端契约，独立 UI E2E 不适用；以 route/repository 集成测试作为 red/green 门，用户可观察结果由 plan-05/07 E2E 覆盖。
- [x] `pnpm verify:fast` 通过。

## 验证命令

```bash
pnpm vitest --run src/lib/repositories/__tests__/generation-task-repository.test.ts src/lib/repositories/__tests__/asset-repository.test.ts src/app/api/generation/__tests__/route.test.ts 'src/app/api/generation/[id]/__tests__/route.test.ts' src/app/api/analysis/__tests__/route.test.ts
pnpm db:generate
# 破坏性本地验证：仅在操作者已确认当前 DATABASE_URL 指向可丢弃开发库后执行。
pnpm db:reset
pnpm db:push
pnpm verify:fast
```

## 交接上下文

- **架构章节**: ADR-4/5/6、§6.4、§6.6、§7.2/7.3/7.4、§8.2/8.3/8.5
- **相关代码**: `src/app/api/generation/route.ts`、`src/lib/repositories/generation-task-repository.ts`、`src/app/api/analysis/route.ts`
- **契约 / 数据对象**: `PromptControlSnapshot`、`DirectionIterationFeed`、GenerationTask 状态机
- **下游消费方**: plan-05、plan-06、plan-07

## 风险与边界

- **执行顺序**: red tests → schema/migration → repositories → routes → DB 演练 → green。
- **验证失败排查方向**: 迁移 meta 漂移、Drizzle status 条件、route 捕获层级、mock Provider 是否在拒绝路径被错误调用。
- **允许修改的额外文件**: `src/lib/ai/log.ts`（仅当现有结构化 logger 需要增加事件类型）。
- **暂停条件**: 迁移出现目标列之外的 destructive SQL；现有 Provider 生命周期无法在 route 中捕获启动异常；需要新增方向表。
- **E2E 不适用说明**: 后端基础功能，由集成测试替代，UI E2E 在 plan-05/07。
- **风险备注**: 数据库完全不可用时 failed 写入不保证成功，但必须 critical 告警；不得承诺跨实例内存计时器强一致。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 旧 generation task 快照为 null | 详情原样返回 null，不推测意图/变量 | done |
| completed 缺 resultAssetId | 不提供比较/首选动作，DTO 诚实显示来源异常 | done |
| active 转 failed/completed | 下次 feed 刷新清 active 并进入对应分组 | done |
| Provider 在 task processing 后同步抛错 | 回写 failed 后返回可重试错误 | done |
| failed 回写本身失败 | critical 日志，保留 task 标识供运维修复 | done |
| sourceAssetId 属于其他用户 | 404/稳定权限错误，不泄露存在性 | done |

## 执行证据（implement，2026-09-01）

- **Red**: `docs/e2e/evidence/plan-03-e2e-red-20260901.md`（42 failed / 131 passed，判定「预期失败，测试有效」）。
- **Green**: `pnpm vitest --run` 五个测试文件 173/173 通过（42 个 red 全部转绿；123 个既有用例 + 8 个即绿回归锁全部保持）。
- **迁移审查**: `drizzle/0006_pale_darkhawk.sql` 由 `pnpm db:generate` 生成；SQL 仅 `ALTER TABLE "generation_tasks" ADD COLUMN "prompt_control_snapshot" jsonb;`；`meta/0006_snapshot.json` 与 0005 的 diff 仅 `public.generation_tasks` 新增该 nullable jsonb 列；`_journal.json` 追加 idx 6。无 destructive SQL、无回填、无新表/索引。
- **Fresh apply（可丢弃本地开发库）**: 目标环境为 `DATABASE_URL=postgresql://user:***@localhost:5433/style_gen`（Docker 容器 `style-gen-db`，已确认本地可丢弃开发库）。执行 `pnpm db:reset`（重建 volume 与容器）→ `pnpm db:push`（首次因容器预热失败一次，重试输出 `Changes applied`）→ `information_schema.columns` 确认 `prompt_control_snapshot / jsonb / is_nullable=YES`。
- **性能验收（架构 §8.1）**: 种子 500 rows（单用户单方向：480 completed + 6 pending + 6 processing + 8 failed，completed 各带结果资产）。三查询合计 50 次采样：avg 0.415ms / max 3.365ms / **p95 0.389ms ≤ 300ms**。EXPLAIN (ANALYZE, BUFFERS)：active 查询命中既有部分索引 `idx_generation_tasks_status`，completed/failed 为 top-N heapsort + hash left join，均远低于目标，按护栏不新增复合索引。种子数据已清理（generation_tasks/assets/users 归零）。
- **fast gate**: `pnpm verify:fast`（workflow:check + test:workflow + type-check + lint + test 112 文件 / 1122 用例）exit 0。
- **测试 fixture 修复（3 处，均为测试 bug，未改任何断言语义）**:
  1. `src/app/api/generation/__tests__/route.test.ts` direction describe `beforeEach` 缺 `mockListIterations.mockReset()`：`vi.restoreAllMocks()` 不清除 `vi.fn()` 调用记录，上一 describe 末次列表调用泄漏进 `not.toHaveBeenCalled()` 断言（实现无论正确与否必失败，隔离运行可复现）。
  2. 同文件多 POST 用例共享单次 `mockResolvedValueOnce(v2RecipeAnalysisTask)`，固化「快照结构/枚举/上限/长度校验必须先于分析任务读取，仅 Recipe 引用校验在其后」的实现顺序（该顺序亦被引用类用例交叉验证）。
  3. `src/lib/repositories/__tests__/generation-task-repository.test.ts`：`makeDetailRow` 声明在 plan-01 describe 块内导致 plan-03 同级 describe `ReferenceError`（red 阶段即存在的测试错误），提升至外层作用域；既有「正常创建」精确匹配对象补 `promptControlSnapshot: null`（red 证据「测试中固化的新契约」要求 GenerationTask 携带该字段，存量行为 null）。
- **范围备注**: `src/types/models.ts` 未列入本功能文件清单，但 red 证据「测试中固化的新契约」明确要求 `GenerationTask`/`IterationDetail` 增加 `promptControlSnapshot: PromptControlSnapshot | null`，且 production `pnpm type-check` 必须通过，故对该文件做了仅增加两个字段的最小修改。
