---
feat_id: "plan-04"
title: "任务核对与幂等结果恢复"
dimension: backend
phase: 1
status: done
depends_on: ["plan-03"]
red_evidence: "plan-04-任务核对与幂等结果恢复.md#验证记录"
review_evidence: "reviews/plan-04-review-2026-09-08.md"
green_evidence: "plan-04-任务核对与幂等结果恢复.md#验证记录"
---

# plan-04 任务核对与幂等结果恢复

## 功能概要

- **目标**：任务核对与幂等结果恢复，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：已知外部任务可以由回调或读取核对恢复完成，重复回调只有一张资产和一条结果事件。转存失败只重试存储，不再次推理。无法确认的提交保持隔离，明确失败才允许生成新的重试意图。
- **依赖**：plan-03；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-09, AC-19, AC-20, AC-21
- **涉及架构模块**：M4/M5
- **前置条件**：本任务integration新增实际仓储/DB+计数外部适配器用例；Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/workspace/directions/[id]/commands/route.ts` | plan-02首次创建；本任务接显式reconcile |
| create | `src/lib/generation/reconciliation.ts` | 本任务首次创建 |
| modify | `src/lib/generation/submission.ts` | 计划内前置产物：plan-03 首次 create；执行前确认已交付 |
| modify | `src/lib/ai/generation-completion.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/ai/webhook-handler.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/ai/webhook-utils.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/ai/providers/replicate-image-gen.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/ai/providers/gemini-image-gen.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/ai/providers/fal-image-gen.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/repositories/asset-repository.ts` | 现有文件；按本任务职责修改 |
| modify | `src/app/api/generation/[id]/route.ts` | 现有文件；按本任务职责修改 |
| create | `scripts/reconcile-generation.mjs` | 本任务首次创建 |
| create | `src/lib/generation/__tests__/reconciliation.test.ts` | 本任务首次创建 |
| create | `e2e/workspace-agent-recovery-api.spec.ts` | 本任务首次创建 |
| create | `src/lib/generation/__tests__/reconciliation.integration.test.ts` | 本任务首次创建 |

## 实现规格

### 1. 核对状态机

落实 prepared/submitting/submitted/unknown/outputStored/terminal 映射：prepared=pending，活动/unknown=processing，确定终态才 completed/failed。读取可 predictions.get 核对已知 ID、补已知输出，但不能创建收费推理；commands reconcile 的显式 prepared 恢复才可 CAS 首次发送。deadline 到达只核对，不能视为取消。无 externalId 的 unknown 依次查输出、签名回调、人工确定证据，不按近似提示匹配。

### 2. 幂等落盘与回调竞态

预留 resultAssetId 和确定 R2 object key；先持久 descriptor，写 R2，outputStored 后事务 upsert asset、task终态及 result:{taskId} 唯一事件。R2成功DB失败用 HEAD 恢复。签名回调先于create响应可在预期provider/model校验后原子绑定空externalId；之后均须一致。重复/乱序通知不能把 completed 覆盖 failed。同步fal subscribe/Gemini在响应期等待转存；转存30s界限内失败保留descriptor。输出协议/主机/大小及每跳redirect校验，不拉取任意URL。

### 3. 人工恢复与原提交重试

scripts/reconcile-generation.mjs 默认只读，明确 apply 参数才按确定 Provider 证据解除隔离，绑定 task/provider/externalId、证据出处、操作者和时间，写审计事件；禁止手工猜测失败或重新生成。retryOriginal 仅确定失败后新键复制旧完整快照和绑定；旧绑定不可用要求用户改用当前草稿，不能静默换模型。同步或未知不可恢复时保留原方向隔离，其他方向可工作。

### 4. 故障注入

integration 覆盖DB意图前后、发送CAS前后、外呼成功但写ID失败、R2成功DB失败、回调抢先/重复/乱序、失效签名。真实API E2E用预存unknown/outputStored/terminal状态验证公开响应与禁重发，外部查询和存储恢复在计数 transport fixture 中验证，不产生真实收费。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 核对状态机 | backend | done | 已完成；真实API red与DB故障恢复验证见下 |
| 2 | 幂等落盘与回调竞态 | backend | done | 已完成；真实API red与DB故障恢复验证见下 |
| 3 | 人工恢复与原提交重试 | backend | done | 已完成；真实API red与DB故障恢复验证见下 |
| 4 | 故障注入 | backend | done | 已完成；真实API red与DB故障恢复验证见下 |
| 5 | 聚焦验证、项目门与交接证据 | backend | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-09 重复回调/轮询只一个asset与result事件，完成记录不重复。
- [x] AC-19 已知输出转存失败只恢复存储，不重复推理；旧分析timer不覆盖成功。
- [x] AC-20 断点注入覆盖unknown核对、prepared显式恢复、确定失败后retryOriginal及不可用绑定。
- [x] AC-21 已知任务读取恢复或媒体/R2故障恢复不新建推理，跨用户核对拒绝。

### 验证方式

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-recovery-api.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。

### 性能验收（架构 §8.1）
- [x] AC-20 假时钟验证同步120s、异步300s后核对；单任务 Provider 查询间隔至少5s，以 DB lastReconciledAt CAS 抵御并发读取。部署阶段验证 Node/代理请求时限≥240s，缺部署目标只标待部署核验，不宣称生产就绪。

## 验证命令

```bash
node scripts/test-workspace-db.mjs
node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-recovery-api.spec.ts
pnpm vitest --run src/lib/generation/__tests__/reconciliation.test.ts
pnpm verify:fast
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.4、§7.4、§8.1/8.2；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-05；交接最终路径、接口差异、未解决边界和真实验证记录。

## 风险与边界

- **执行顺序**：按Task列表；先写本任务可执行测试red，再实现至green，最后独立task-review。若前置契约不符先修本范围适配并记录，不弱化架构。
- **验证失败排查方向**：先查本任务文件、原键/版本/归属与测试隔离；再看数据库、浏览器或外部fixture环境，不以盲重试收费调用排障。
- **允许修改的额外文件**：允许完成本任务必需的邻近测试、类型、fixture和配置，须在验证记录记路径与原因；新增产品行为、公共契约变化及明确禁止文件仍需批准。下游modify前置产物已有明确create owner，不重复创建。
- **暂停条件**：仅实际外部环境无法解除、需要真实付费范围确认、或必须改变批准需求/公共契约；普通测试失败在范围内修复。
- **E2E 不适用说明**：不适用例外不成立；本任务影响用户或公开API，必须执行所列Playwright red→green。API测试不mock被测路由，UI测试可mock外部响应但不得作为DB/Provider实际完成证据。
- **风险备注**：文档ready-to-dev不表示实现/测试已通过，不能标done或预填执行证据。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 没有外部查询能力 | 保持unknown；显式人工apply要求精确Provider支持材料、artifact SHA-256、操作者确认及任务/请求键/尝试时间绑定，不查询不存在的API | done |
| 回调与轮询同时结束 | 预留asset ID、确定object key、唯一asset/task和result事件同事务；signed webhook URL与模型/外部ID校验 | done |
| 分析旧 timer 晚到 | timer只记录核对提示，零状态写；完整分析持久核对仍由plan-05交付 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-09 | `e2e/workspace-agent-recovery-api.spec.ts`：`AC-09` 重复回调/轮询只一个asset与result事件，完成记录不重复 | 实际API用例 `AC-09 AC-19 AC-20 AC-21 durable output read commits once; unknown never resends; ownership enforced`；[API日志](reviews/evidence-plan-04/green-api.log)、[真实DB故障测试](reviews/evidence-plan-04/green-db.log) |
| AC-19 | `e2e/workspace-agent-recovery-api.spec.ts`：`AC-19` 已知输出转存失败只恢复存储，不重复推理；旧分析timer不覆盖成功 | 实际API用例 `AC-09 AC-19 AC-20 AC-21 durable output read commits once; unknown never resends; ownership enforced`；[API日志](reviews/evidence-plan-04/green-api.log)、[真实DB故障测试](reviews/evidence-plan-04/green-db.log) |
| AC-20 | `e2e/workspace-agent-recovery-api.spec.ts`：`AC-20` 断点注入覆盖unknown核对、prepared显式恢复、确定失败后retryOriginal及不可用绑定 | 实际API用例 `AC-09 AC-19 AC-20 AC-21 durable output read commits once; unknown never resends; ownership enforced`；[API日志](reviews/evidence-plan-04/green-api.log)、[真实DB故障测试](reviews/evidence-plan-04/green-db.log) |
| AC-21 | `e2e/workspace-agent-recovery-api.spec.ts`：`AC-21` 已知任务读取恢复或媒体/R2故障恢复不新建推理，跨用户核对拒绝 | 实际API用例 `AC-09 AC-19 AC-20 AC-21 durable output read commits once; unknown never resends; ownership enforced`；[API日志](reviews/evidence-plan-04/green-api.log)、[真实DB故障测试](reviews/evidence-plan-04/green-db.log) |

- Red：phase: red；`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-recovery-api.spec.ts` 退出 1，1 个行为失败：outputStored GET 仍为 processing，期望 completed。预期失败，测试有效。日志：[red-api.log](reviews/evidence-plan-04/red-api.log)。
- Green：phase: green；最终源码状态 `node scripts/test-workspace-db.mjs` 退出0，3文件29测试通过（含本任务13项真实DB故障/恢复测试）；`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-recovery-api.spec.ts e2e/workspace-agent-directions-api.spec.ts e2e/workspace-agent-submission-api.spec.ts` 退出0，4 API测试通过；6文件聚焦Vitest退出0、79测试通过。日志：[DB](reviews/evidence-plan-04/green-db.log)、[API](reviews/evidence-plan-04/green-api.log)、[聚焦](reviews/evidence-plan-04/green-focused.log)。最终源码/测试SHA-256：[manifest](reviews/evidence-plan-04/sha256.txt)。
- 项目门：`pnpm verify:full` 最终退出0，workflow + 12项workflow测试 + type + lint（既有26 warnings）+ 125文件1234项Vitest + production build + 18项关键smoke全部通过：[完整日志](reviews/evidence-plan-04/verify-full.log)。任务状态/证据文档更新后再执行 `pnpm verify:fast`，日志：[最终文档门](reviews/evidence-plan-04/verify-fast-final.log)。
- Review：未执行；由独立task-review写入独立报告。
- 证据字段：red_evidence/green_evidence已指向本文件真实执行记录；独立验收仍由task-review完成，本实现代理仅设置review。
- 恢复与文件边界变更：按允许的邻近范围新增 `src/lib/generation/output.ts`（20MiB输出限制、Provider主机/逐跳重定向检查、sharp完整解码）；`src/lib/r2.ts` 增HEAD、metadata与AbortSignal；`src/lib/workspace/service.ts` 使用有界活动任务DB投影，避免内联图片随方向查询返回；`src/app/api/webhooks/replicate/route.ts`/generation/commands 声明 maxDuration=240；`package.json`/`pnpm-lock.yaml` 将已有transitive sharp 0.34.5显式声明为直接依赖（offline安装，无下载）；`e2e/helpers/workspace-db.ts` 修复新增asset↔task FK测试清理顺序，`vitest.workspace-db.config.ts` 串行测试文件避免全局预算用例互相占用；runner注入仅测试用回调签名secret和媒体URL。邻近Provider、webhook和timer测试随对应行为更新。

### 具体恢复证据映射

- AC-09：真实DB计数适配器验证回调早于create响应、重复/乱序/并发读取、唯一资产与 `result:{taskId}`；签名body中的webhook URL必须指向当前task，错误模型/外部ID/另一个task回调拒绝。
- AC-19：实际Postgres trigger注入R2写成功后的DB失败，下一次HEAD恢复不再PUT/下载/推理；同步inline descriptor跨请求保存；sharp完整解码验证真实尺寸与MIME，拒绝截断PNG及伪造JPEG/WebP；旧analysis timer假时钟检查零失败写入。
- AC-20：实际DB trigger覆盖意图事务回滚、发送CAS前故障、CAS后失联、外呼已接受但ID写失败；并发显式prepared恢复只一次generate；Date假时钟断言同步120s/异步300s deadline及到期隔离；人工脚本默认只读、精确支持材料才允许apply、只有confirmed not_accepted释放预约。retryOriginal完整快照与原绑定复用沿用plan-03真实DB回归。
- AC-21：并发已知ID查询用DB lastReconciledAt CAS，4999ms不查询、5000ms允许；unknown无凭据无外部ID仍processing；跨用户GET/commands拒绝；API outputStored读取完成事务，不调用R2或Provider。所有推理与存储边界均由计数fixture替换，业务路由/服务/仓储/DB均为实际实现。

### 人工核对操作契约

- 只读：`node scripts/reconcile-generation.mjs --task <ULID>`；不会查询Provider或修改DB，仅输出有界任务状态。
- 执行：显式 `--apply --evidence <JSON路径> --operator <操作者>`，无查询能力时再提供 `--artifact <Provider支持记录JSON路径>`。这里只交付脚本和可丢弃DB fixture验证，没有运行真实环境apply。
- 所有证据含taskId/provider/model/externalId/outcome/operator/observedAt/source。已知Replicate ID由官方GET独立验证；空本地ID还须匹配返回的webhook taskId/taskType。
- 无查询能力的精确支持材料必须再绑定requestKey、attemptedAt、ticketId，artifactSha256校验文件；操作者attestation必须明确已核对该精确提交与确定结果。支持记录confirmation=confirmed；not_accepted还必须charged=false。成功材料必须携带允许Provider主机的outputUrl，否则保持unknown，不伪造失败。
- 审计事件kind=generation，inputText仅存白名单JSON、replyText为中性短回执，不存完整Provider响应/内联图片/凭据。not_accepted之外的失败不释放预约。后续只读恢复处理已知输出，不生成新推理。
- 部署边界：代码maxDuration=240已声明；无部署目标，本次不声称Node宿主/反向代理240s限制已经实测，部署阶段仍须核验。

- 全门发现既有models.json动态module mock竞争再次出现（plan-03已记录过一次），保存[失败日志](reviews/evidence-plan-04/full-gate-flaky-config-before-fix.log)。按独立审查反馈修复实际 `src/lib/ai/model-config.ts` 共享 `loadModelConfig(raw)` 初始化边界，邻近测试直接调用相同校验函数，保留真实模块catalog/resolver断言，不再resetModules/doMock竞争；[聚焦19项通过](reviews/evidence-plan-04/model-config-repair.log)。本次属于必要邻近稳定性修复，不改变模型绑定/解析行为。

- 独立审查补充证据：新增真实DB用例 `AC-20 unavailable original binding refuses retry without a new task or Provider call`；旧任务provider model已不在目录时，retrySummary=null、retryOriginal抛ORIGINAL_BINDING_UNAVAILABLE，外部调用0次且无新增任务。仅integration测试/证据变更，生产状态未变，既有full/API门可复用；最终隔离DB 29/29通过。
