---
feat_id: "plan-03"
title: "固定快照与生成准入"
dimension: backend
phase: 1
status: done
depends_on: ["plan-02"]
red_evidence: "plan-03-固定快照与生成准入.md#验证记录"
review_evidence: "reviews/plan-03-review-2026-09-08.md"
green_evidence: "plan-03-固定快照与生成准入.md#验证记录"
---

# plan-03 固定快照与生成准入

## 功能概要

- **目标**：固定快照与生成准入，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：生成入口会固化提交内容和模型绑定，重复意图返回原任务。未就绪、并发生成或额度不足在收费前被拒绝。浏览器丢失响应后可按原键找到提交事实，后续改稿不会改变已提交快照。
- **依赖**：plan-02；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-08, AC-09, AC-20
- **涉及架构模块**：M2/M4/M5
- **前置条件**：本任务integration新增实际仓储/DB+计数外部适配器用例；Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/generation/submission.ts` | 本任务首次创建 |
| create | `src/lib/workspace/summary-token.ts` | 本任务首次创建 |
| modify | `src/lib/workspace/service.ts` | 计划内前置产物：plan-02 首次 create；执行前确认已交付 |
| create | `src/lib/ai/cost-guard.ts` | 本任务首次创建 |
| create | `src/lib/ai/cost-policy.ts` | 本任务首次创建 |
| modify | `src/app/api/generation/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/app/api/generation/[id]/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/repositories/generation-task-repository.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/prompt-composer.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/render-readiness.ts` | 现有文件；按本任务职责修改 |
| create | `src/lib/generation/__tests__/submission.test.ts` | 本任务首次创建 |
| create | `src/lib/ai/__tests__/cost-guard.test.ts` | 本任务首次创建 |
| create | `e2e/workspace-agent-submission-api.spec.ts` | 本任务首次创建 |
| create | `src/lib/generation/__tests__/submission.integration.test.ts` | 本任务首次创建 |

## 实现规格

### 1. 统一创建服务

新旧 POST generation 共用准入与执行服务。新请求只收 directionId/baseRevision/summaryToken/authorizationId/requestKey/mode/retryOf 等 §7.3 白名单，按真实 analysis 和保存草稿服务端编译快照；不信任客户端 prompt。旧 body 保留原语义但复用准入、预算及 analysis 范围锁；新方向使用 directionId 锁。prepared 意图、生成回执、预算和授权消费同事务，派生事件键 generation:{requestKey}，不与 turn 原键碰撞。本任务同时交付签名摘要服务：directionId/revision/draftHash/modelBindingHash/expiresAt（15分钟），方向读取返回summaryToken；只支持已明确授权的current/retryOriginal，quick授权消费由plan-08补齐前拒绝quick模式。测试以实际签发token验证首次提交，不依赖未来UI。

### 2. 一次发送与查询

事务外 CAS prepared→submitting 获得唯一发送权，持久 attemptedAt/deadline，再调用现有 Provider；SDK 创建请求禁隐式重试。同步成功也必须 await 转存完成；无法确定外部是否接受时写 unknown，禁止统一 catch 写 failed。GET generation 按 requestKey 查询与既有列表互斥；view=direction 按 directionId；详情返回兼容超集 submissionState。重复键优先返回原事实，即使 token 过期。plan-04 完成持久核对和落盘幂等，当前不得主动重发 unknown。

### 3. 多实例成本与限流

实现 DB 准入，沿用内存快速挡板但不能以它为最终额度。全局→用户→方向锁内聚合 analysis/generation/event reservedCostUsd；$0.02/turn、$0.05/analysis、$0.20/image 为可配置保守预约，$10/UTC日/$100月建议阈值、80%仅一次告警；未核准 binding 拒新收费。unknown 不释放、仅确认未收费拒绝可释放；生成回执为0。用户10 turns/min、60/hour、20 generations/hour，同方向一个活跃 turn/图像（图像 active 含 unknown）。新增 Agent 和分析接入由 plan-05/06 负责，旧 generation 当期同时接入。

### 4. 跨层与故障验证

真实 API E2E 使用已播种快照任务验证同键返回、跨用户404、异 hash409、忙409、unknown不产生第二任务及旧详情兼容，不调用付费 Provider。实际服务+仓储 integration 使用注入的计数 Provider 验证首次意图创建/CAS发送一次/预算原子；只 mock 外部边界，不 mock submission 逻辑或 DB。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 统一创建服务 | backend | done | 先对应测试red，再交付规格与green |
| 2 | 一次发送与查询 | backend | done | 先对应测试red，再交付规格与green |
| 3 | 多实例成本与限流 | backend | done | 先对应测试red，再交付规格与green |
| 4 | 跨层与故障验证 | backend | done | 先对应测试red，再交付规格与green |
| 5 | 聚焦验证、项目门与交接证据 | backend | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-08 缺项、版本不符、活跃任务和额度阻塞在外呼前拒绝。
- [x] AC-09 首次意图生成固定快照；同键复用、并发仅一次发送、后续改稿不变原任务。
- [x] AC-20 原键查询返回unknown真实事实，未知不释放预约或自动重发。

### 验证方式

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-submission-api.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。



## 验证命令

```bash
node scripts/test-workspace-db.mjs
node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-submission-api.spec.ts
pnpm vitest --run src/lib/generation/__tests__/submission.test.ts src/lib/ai/__tests__/cost-guard.test.ts
pnpm verify:fast
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.3/6.4、§7.3/7.4、§8.3–8.5；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-04；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| 响应丢失 / unknown | 保留原键与预算；GET不存在不是换键许可 | done |
| 并发 / 额度临界 / 跨 UTC 边界 | 事务预约一份，读取与编辑不被预算阻断 | done |
| 修改草稿或 Provider 绑定变化 | 已提交快照不变；新提交重新检查绑定 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-08 | API 综合用例：空方向、旧 revision、假 token、活跃任务；DB `missing configuration...` 与 `distinct concurrent directions...` | 通过，外呼前拒绝且事务不留任务；并发不同方向在最后预算位只准入一个 |
| AC-09 | API 综合用例：原键200与异hash409；DB `concurrent same intent...`、`legacy intent...`、`retryOriginal...`；真实 SDK transport tests | 通过，6个相同意图仅一次 generate；一份预算/事件；后续编辑不改快照；原任务重试保留全快照与绑定 |
| AC-20 | API 综合用例：unknown查询与跨用户404；DB `uncertain acceptance...`、`failed output transfer...` | 通过，unknown保留cost与descriptor，重复调用不重发，同方向新键409 |

- Red：2026-09-08，`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-submission-api.spec.ts`，退出码1，1个用例失败：真实认证/建方向/DB播种成功后，已存在请求键 POST 应200返回原任务，实际400拒绝新请求体。phase: red；预期失败，测试有效。[日志](reviews/evidence-plan-03/red-api.log)。
- Green：同一 API 命令退出码0，1个综合用例通过，含原键/异hash/忙/unknown/权限/方向隔离/旧详情/空方向/旧revision/伪造摘要。[API日志](reviews/evidence-plan-03/green-api.log)。最终运行11.3s，无被测API mock。
- Green：`node scripts/test-workspace-db.mjs` 退出码0，2文件16项通过（本任务9项实际服务+DB，前置7项仓储）。涵盖6并发同键、不同方向预算原子竞争、配置/提案/版本拒绝、unknown、同步等待、转存失败、legacy共享锁、UTC月边界小时限流、原任务独立摘要与当前模型失效时仍按原绑定重试。[DB日志](reviews/evidence-plan-03/green-db.log)。
- Green：`pnpm vitest --run src/lib/generation/__tests__/submission.test.ts src/lib/ai/__tests__/cost-guard.test.ts src/lib/ai/providers/__tests__/single-attempt-fetch.test.ts` 退出码0，3文件17项通过；真实安装SDK × network/429/500 共9项均只发生一次mock网络fetch；不是仅mock generate调用计数。[聚焦日志](reviews/evidence-plan-03/green-focused.log)。最终verify:full再次覆盖所有这些用例。
- 项目门：`pnpm verify:full` 退出码0，workflow/12项workflow tests/type/lint/124文件1221项Vitest/build/18项smoke通过；既有26条lint warnings。[完整日志](reviews/evidence-plan-03/verify-full.log)。第一次full在models.json动态模块mock测试出现一次返回原配置而非mock配置；未改变断言或实现，聚焦复验通过，最终完整门全通过。[首次失败](reviews/evidence-plan-03/first-full-failure.log)、[聚焦复验](reviews/evidence-plan-03/model-config-focused.log)。
- 文件状态：[SHA256清单](reviews/evidence-plan-03/sha256.txt)。Review未执行，交未参与实现的root独立task-review；本任务仅到review。
- 邻近文件与原因：新增 `generation/legacy-request.ts` 提取原body/控制快照校验及其测试；`types/models.ts` 增可选dispatch字段和user来源片段；`ai/model-config.ts` 增精确已存绑定解析，环境偏好不改变原绑定；`ai/provider-readiness.ts` 与 `.env.example` 明确凭据准入和显式付费binding allowlist。`providers/single-attempt-fetch.ts`、三个image adapters和邻近测试是关闭已验证SDK隐藏POST重试的必要修复。`webhook-handler.ts`/`webhook-utils.ts` 为新dispatch记录隔离旧“超时/转存失败即failed”路径，由plan-04接管持久核对；旧记录逻辑仍兼容。`scripts/test-workspace-db.mjs` 清空子进程live Provider/R2凭据环境，避免negative API缺陷意外收费。
- 旧测试迁移：保留GET全部契约断言；原POST测试中fire-and-forget、超时即failed与不确定异常即failed已被批准架构废弃，改为新HTTP服务边界测试+真实DB管线测试。旧body/枚举/20变量/10调整/200单值/6000模板/Recipe引用/画幅校验移至 `legacy-request.test.ts`，没有通过放宽旧安全断言取得green。
- 下游契约：`prepareGeneration` 事务写prepared+预算+generation回执；`dispatchGeneration` CAS唯一发送；`submitGeneration` 返回 `{id,taskId,status,directionId,draftRevision,submissionState,requestKey,preservedContext,reused}`。原键查询GET返回 `{task:receipt|null}`，与列表参数互斥；`view=direction&directionId`严格隔离方向。GET方向返回真实签名summaryToken与readiness。`GET /generation/{id}`失败terminal时附`retrySummary`（原prompt/negative/params/binding/当前baseRevision/token）；retryOriginal必须使用此专用摘要，普通current摘要不通用。
- plan-04接续边界：prepared可显式CAS发送；submitting/unknown不得重发，deadline不等于失败。当前新记录webhook返回503保留重试，plan-04必须替换为签名绑定/GET核对/幂等结果处理。同步URL输出先存descriptor并await转存；内联Gemini字节尚未持久保存，plan-04必须提供有界持久字节/descriptor方案后才宣称刷新后可重试转存。当前不宣称R2/asset/event写入已幂等。
- plan-05/06/08接续边界：`reservePaidOperation`只在global→user→direction事务内调用；analysis/turn接入由05/06完成。当前显式只支持current/retryOriginal，quick拒绝直到08。Agent的已接受render_request需在后续同事务完成turn并关联generation，当前其他processing turn均阻塞。未核准binding拒新收费，部署按`.env.example`显式配置，测试未进行真实付费调用。
