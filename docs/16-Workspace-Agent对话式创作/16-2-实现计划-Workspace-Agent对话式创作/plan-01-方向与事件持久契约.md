---
feat_id: "plan-01"
title: "方向与事件持久契约"
dimension: backend
phase: 1
status: done
depends_on: []
review_evidence: "reviews/plan-01-review-2026-09-08.md"
red_evidence: "plan-01-方向与事件持久契约.md#验证记录"
green_evidence: "plan-01-方向与事件持久契约.md#验证记录"
---

# plan-01 方向与事件持久契约

## 功能概要

- **目标**：方向与事件持久契约，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：仓储可以保存方向、完整事件和提交阶段，并在并发写入时拒绝旧版本。重复请求不会增加第二份事实，旧记录仍能读取。此任务只交付内部持久契约，公开路由和页面能力由后续任务接入。
- **依赖**：无；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-06, AC-09, AC-15
- **涉及架构模块**：M5
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/db/schema.ts` | 现有文件；按本任务职责修改 |
| create | `drizzle/0007_workspace_agent.sql` | 本任务首次创建 |
| create | `drizzle/meta/0007_snapshot.json` | 本任务首次创建 |
| modify | `drizzle/meta/_journal.json` | 现有文件；按本任务职责修改 |
| create | `src/lib/workspace/contracts.ts` | 本任务首次创建 |
| create | `src/lib/repositories/workspace-repository.ts` | 本任务首次创建 |
| create | `src/lib/repositories/__tests__/workspace-repository.test.ts` | 本任务首次创建 |
| create | `src/lib/repositories/__tests__/workspace-repository.integration.test.ts` | 本任务首次创建 |
| create | `scripts/test-workspace-db.mjs` | 本任务首次创建 |

## 实现规格

### 1. 完整模型与迁移

按架构 §7.2 原样定义 WorkspaceDirection、WorkspaceEvent、WorkspaceDraft、DraftPatch、ContextReference 和提交字段，沿用 ULID。仅新增两表；analysis/generation 可空关联、预约和 deadline 字段，asset 增 sourceGenerationTaskId 唯一引用。保留旧 null 语义，不回填假消息、快照或验证状态。迁移用 pnpm db:generate --name workspace_agent，预期序号 0007；执行时若已有新迁移，先记录实际序号并更新本任务路径，禁止覆盖别人的迁移。

### 2. 事务与仓储

封装按 userId 读取、创建方向、CAS draftRevision、写事件、稳定分页、按键回执和可组合事务。唯一约束：direction creationRequestKey（用户范围）、event(userId,requestKey)/(directionId,sequence)、非空 generation/analysis(userId,requestKey)、generation 同方向 active/unknown 部分唯一索引、asset.sourceGenerationTaskId。sequence 在方向锁内 max+1；全局预算→用户→方向固定锁序；事务不包外呼。原文请求 hash 白名单排序、保留数组顺序和文本、不纳入临时 token。

### 3. 迁移与并发证据

新增 disposable PostgreSQL 测试运行器，创建独立测试库、应用已提交迁移、执行 integration 测试、finally 清理；只允许明确测试库名，拒绝开发/生产库及 db:reset。验证新库全量应用和旧 schema 升级、唯一索引、CAS 并发、事务回滚、nullable 兼容；回退审阅记录数据保留策略，不自动 drop 新表。 运行器默认执行本期全部workspace/submission/reconciliation的*.integration.test.ts（只匹配已交付文件）；--e2e启动隔离Next服务并为目标spec提供测试DB、随机AUTH_SECRET与端口，复用仓库Playwright项目参数但禁止连接正在运行的开发服务。没有Docker时明确报缺前提，不skip当通过。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 完整模型与迁移 | backend | done | 先对应测试red，再交付规格与green |
| 2 | 事务与仓储 | backend | done | 先对应测试red，再交付规格与green |
| 3 | 迁移与并发证据 | backend | done | 先对应测试red，再交付规格与green |
| 4 | 聚焦验证、项目门与交接证据 | backend | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-06 并发CAS拒绝旧revision且不产生成功回执。
- [x] AC-09 请求唯一键与同方向活跃索引阻止重复持久事实。
- [x] AC-15 完整事件长期存储、稳定分页及nullable旧数据读取。

### 验证方式

内部契约采用有意义的integration red→green，映射见风险与边界。



## 验证命令

```bash
node scripts/test-workspace-db.mjs
pnpm vitest --run src/lib/repositories/__tests__/workspace-repository.test.ts
pnpm verify:fast
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §7.1–7.6、ADR-1/3/4；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-02；交接最终路径、接口差异、未解决边界和真实验证记录。

## 风险与边界

- **执行顺序**：按Task列表；先写本任务可执行测试red，再实现至green，最后独立task-review。若前置契约不符先修本范围适配并记录，不弱化架构。
- **验证失败排查方向**：先查本任务文件、原键/版本/归属与测试隔离；再看数据库、浏览器或外部fixture环境，不以盲重试收费调用排障。
- **允许修改的额外文件**：允许完成本任务必需的邻近测试、类型、fixture和配置，须在验证记录记路径与原因；新增产品行为、公共契约变化及明确禁止文件仍需批准。下游modify前置产物已有明确create owner，不重复创建。
- **暂停条件**：仅实际外部环境无法解除、需要真实付费范围确认、或必须改变批准需求/公共契约；普通测试失败在范围内修复。
- **E2E 不适用说明**：纯内部新增schema/仓储，不接公开路由或页面；浏览器无法增加该独立契约的证据。AC-06由并发CAS integration、AC-09由唯一键/活跃索引 integration、AC-15由完整事件分页 integration替代，结果写本任务验证记录。行为变更仍需integration red→green；后续plan-02/03/05承担公开链路E2E。
- **风险备注**：文档ready-to-dev不表示实现/测试已通过，不能标done或预填执行证据。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 两个请求同时 CAS | 只一方更新；失败事务不产生成功回执 | done |
| 旧记录 null / 多方向共用 analysis | 兼容读取，不合并方向，不推导不存在的请求键 | done |
| 迁移应用中断 | 回滚事务或记录可安全重入状态，保留原库 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-06 | `src/lib/repositories/__tests__/workspace-repository.test.ts`、`src/lib/repositories/__tests__/workspace-repository.integration.test.ts`：`AC-06` 并发CAS拒绝旧revision且不产生成功回执 | 已通过；见下方真实数据库、单元测试日志及对应 AC 用例 |
| AC-09 | `src/lib/repositories/__tests__/workspace-repository.test.ts`、`src/lib/repositories/__tests__/workspace-repository.integration.test.ts`：`AC-09` 请求唯一键与同方向活跃索引阻止重复持久事实 | 已通过；见下方真实数据库、单元测试日志及对应 AC 用例 |
| AC-15 | `src/lib/repositories/__tests__/workspace-repository.test.ts`、`src/lib/repositories/__tests__/workspace-repository.integration.test.ts`：`AC-15` 完整事件长期存储、稳定分页及nullable旧数据读取 | 已通过；见下方真实数据库、单元测试日志及对应 AC 用例 |

- Red：`node scripts/test-workspace-db.mjs`，退出码 1，2 项行为断言预期失败：全量旧迁移应用成功，但方向/事件表及提交唯一约束不存在。测试有效，无导入/环境失败。内部 E2E 例外沿用上文；[red 日志](reviews/evidence-plan-01/red.log)。后续 CAS/分页/事务用例在交付契约上补充验证，未声称其各自执行过独立 red。
- Green：`node scripts/test-workspace-db.mjs`，退出码 0，7 项真实 PostgreSQL integration 通过。覆盖 AC-06 并发 CAS 仅一次成功、旧版本及越权拒绝；AC-09 重用/冲突、真实唯一索引、回滚、创建后再编辑不破坏原回执；AC-15 完整文本、稳定分页及旧记录升级。运行器先应用 0000–0006、种入旧数据，再应用 0007，旧 prompt 保留且新增字段仍 null。[数据库日志](reviews/evidence-plan-01/green-db.log)。
- Green：`pnpm vitest --run src/lib/repositories/__tests__/workspace-repository.test.ts`，退出码 0，3 项单元测试通过；白名单/递归键排序、原文与数组次序保留、authorizationId 纳入键，summaryToken 排除。[单元日志](reviews/evidence-plan-01/green-unit.log)。
- 项目门：`pnpm verify:fast`，退出码 0；workflow、12 项 workflow 测试、type-check、lint、119 文件/1220 项 Vitest 测试通过。lint 保留既有 26 warnings。[项目门日志](reviews/evidence-plan-01/verify-fast.log)。证据绑定[源文件 SHA256](reviews/evidence-plan-01/sha256.txt)。
- Review：root作为未参与实现的审查者完成独立task-review，通过；见review_evidence。
- 迁移回退审阅：0007 仅增加表/可空列及新索引，无旧记录回填、删除或变更已有验证语义。应用回退保留新增表/列和已发生事实，旧版本忽略其字段；不自动 drop 新表，不销毁用户数据库。每个迁移在事务中应用，失败回滚；测试容器 finally 销毁。
- 恢复与文件边界：额外修改 `vitest.config.ts` 排除专用 integration，新增 `vitest.workspace-db.config.ts` 显式发现且无测试即失败；修改 `next.config.ts` 仅接受隔离测试 distDir 的严格格式，防止 API E2E 与开发 `.next` 共用。均为任务允许的邻近测试配置。API E2E 模式已提供独立端口、随机 secret、不复用服务及清理机制；真实 HTTP spec 将由 plan-02 验证，不声称本任务已运行尚未交付的 spec。
- 下游契约：`withWorkspaceTransaction(userId,directionId,callback)` 按全局预算→用户→方向加锁；callback 可组合 DB 写入，不得外呼。`appendEvent` 只在该事务中调用，分配 sequence 并重用相同 hash；`compareAndSwapDraft` 原子写版本与回执。`createDirection(userId,input,originalRequestHash?)` 的第三参数允许服务在来源 hydration 前对原始 API 请求计算 hash，首次写入不可变 `creation:<requestKey>` restored 回执；不得从当前可变草稿反算原请求。`findDirection`/`findEventByRequestKey`/`listEvents` 按归属读取，返回 DB Date；公开 DTO 序列化与来源/typed reference 验证由 plan-02/06 服务执行。本任务不引入公开 API。
