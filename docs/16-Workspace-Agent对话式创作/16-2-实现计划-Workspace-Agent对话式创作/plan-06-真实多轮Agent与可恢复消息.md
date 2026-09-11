---
feat_id: "plan-06"
title: "真实多轮Agent与可恢复消息"
dimension: mixed
phase: 2
status: done
depends_on: ["plan-05"]
red_evidence: "plan-06-真实多轮Agent与可恢复消息.md#验证记录"
green_evidence: "plan-06-真实多轮Agent与可恢复消息.md#验证记录"
review_evidence: "reviews/plan-06-review-2026-09-08.md"
---

# plan-06 真实多轮Agent与可恢复消息

## 功能概要

- **目标**：真实多轮Agent与可恢复消息，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：用户以不同说法提出修改或询问证据，会看到基于当前草稿的回答、澄清或待应用提案。旧消息和图片引用有真实来源，无法理解的请求明确说明。失败用户消息保留可重试，模型输出本身不能直接改稿或越权生成。
- **依赖**：plan-05；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-03, AC-04, AC-10, AC-19
- **涉及架构模块**：M1/M2/M3
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/agent.ts` | 本任务首次创建 |
| create | `src/lib/ai/agent-prompt.ts` | 本任务首次创建 |
| create | `src/lib/ai/agent-schema.ts` | 本任务首次创建 |
| create | `src/lib/ai/providers/replicate-agent.ts` | 本任务首次创建 |
| create | `src/lib/ai/providers/gemini-agent.ts` | 本任务首次创建 |
| modify | `src/lib/ai/providers/types.ts` | 现有文件；按本任务职责修改 |
| create | `src/app/api/workspace/directions/[id]/turns/route.ts` | 本任务首次创建 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/agent-conversation.tsx` | 本任务首次创建 |
| modify | `src/hooks/use-workspace-agent.ts` | 计划内前置产物：plan-05 首次 create；执行前确认已交付 |
| modify | `src/app/workspace/page.tsx` | 现有文件；按本任务职责修改 |

### 验证文件

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/__tests__/agent.test.ts` | 本任务首次创建 |
| create | `src/components/workspace/__tests__/agent-conversation.test.tsx` | 本任务首次创建 |
| create | `e2e/workspace-agent-conversation.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 真实解释器

新增AgentProvider，复用resolveStructurerModel()绑定与凭据；独立prompt/schema，不调用structure()冒充聊天，不新增模型或Agent框架。一次解释调用，Replicate images/Gemini fileData最多2张已验证归属图。system隔离用户/OCR/历史低信任段；拒未知键、危险路径/HTML执行。输出answer/clarify/proposal/render_request/unsupported严格校验，提案必须changes、render_request无changes/choices，clarify不携执行修改。

### 2. 上下文与执行租约

核心draft/约束→显式引用→最近完整轮次，12k input/2k output；无法准确计数用保守字节上界，超限只剔除最旧完整轮次，核心放不下返回可纠正错误。显式较早event回读；不声称模型记得所有历史。45s外呼、60s解释租约，创建请求禁SDK自动重试，不二次模型修复。先锁方向插event+预约后释放事务再推理，late输出不能写旧状态；相同键返回原event或202。

### 3. 路由与消息消费

发送前flush并持久原键，turn带baseRevision/references/summaryToken。非法引用先拒绝/澄清，无引用图片不能编造观察。新提案使旧pending stale；回答不写draft。render_request原文明确授权且无混合修改、无pending/冲突、版本展示摘要就绪才调统一服务；同事务完成当前turn并链接task，仅豁免该已授权turn自己的活跃锁，不使60s解释租约覆盖生图阶段。plan-08补摘要展示接线前只显示待核对摘要，不执行缺凭据请求。

### 4. 前端与验证

消息渲染只展示实际回复/阶段，无伪思考；pending/error原位恢复，重试明确失败event新键retryOf，未知先查原event。组合否定、转述、同义、先修改再生成、注入、歧义/失效引用用例。mock Browser E2E验消息交互；真实Provider适配器契约用固定响应样例测试，不以预置回复冒充生产语义。额外真实付费语义验证需明确运行范围，未运行单独注明。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 真实解释器 | mixed | done | 先对应测试red，再交付规格与green |
| 2 | 上下文与执行租约 | mixed | done | 先对应测试red，再交付规格与green |
| 3 | 路由与消息消费 | mixed | done | 先对应测试red，再交付规格与green |
| 4 | 前端与验证 | mixed | done | 先对应测试red，再交付规格与green |
| 5 | 聚焦验证、项目门与交接证据 | mixed | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-03 同义修改/证据询问/规则请求/超范围请求使用真实解释契约，拒预置生产回应。
- [x] AC-04 歧义、冲突及失效引用先澄清，不改变草稿或加载越权图片。
- [x] AC-10 解释与服务层验证否定/转述/混合意图不生成，明确意图只在真实摘要及服务闸门满足时生成一次；完整UI在plan-08闭合。
- [x] AC-19 无效输出/超时原位保留用户消息，明确失败retryOf新轮，未知原键读取而非盲重试。

### 验证方式

本任务既有目标spec同时承担发生布局/样式改动时的聚焦截图与focus断言；实现时将对应spec加入e2e:targeted（package.json为明确允许的相邻配置），再运行verify:acceptance。旧基线只能按批准交互审阅更新，不用最终plan-11验收替代本任务必要visual证据。

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-conversation.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。

### 性能验收（架构 §8.1/8.4）
- [x] AC-03 验证12k输入/2k输出限制、45s超时与60s租约，以及一次外呼计数；长历史只裁模型窗口，不裁数据库事件。

## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-conversation.spec.ts --project=workspace
pnpm vitest --run src/lib/ai/__tests__/agent.test.ts src/components/workspace/__tests__/agent-conversation.test.tsx
pnpm verify:fast
pnpm build
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.2、§7.2/7.3、ADR-2；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-07；交接最终路径、接口差异、未解决边界和真实验证记录。

## 风险与边界

- **执行顺序**：按Task列表；先写本任务可执行测试red，再实现至green，最后独立task-review。若前置契约不符先修本范围适配并记录，不弱化架构。
- **验证失败排查方向**：先查本任务文件、原键/版本/归属与测试隔离；再看数据库、浏览器或外部fixture环境，不以盲重试收费调用排障。
- **允许修改的额外文件**：允许完成本任务必需的邻近测试、类型、fixture和配置，须在验证记录记路径与原因；新增产品行为、公共契约变化及明确禁止文件仍需批准。下游modify前置产物已有明确create owner，不重复创建。
- **暂停条件**：仅实际外部环境无法解除、需要真实付费范围确认、或必须改变批准需求/公共契约；普通测试失败在范围内修复。
- **E2E 不适用说明**：不适用例外不成立；本任务影响用户或公开API，必须执行所列Playwright red→green。API测试不mock被测路由，UI测试可mock外部响应但不得作为DB/Provider实际完成证据。
- **风险备注**：文档ready-to-dev不表示实现/测试已通过，不能标done或预填执行证据。

### 前后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 晚到回复 / 用户已改稿 | 只形成旧base提案，不覆盖；租约过期不执行 | done |
| 输出无效 / 核心上下文超限 | 明确失败并保留输入，可直接编辑 | done |
| 视觉引用跨用户/删除 | 404或缺项，不加载陌生图片/伪造观察 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-03 | `agent.test.ts`：严格kind/字段、独立实际SDK、文本窗口与45s；`workspace-turns.integration.test.ts`：原键并发、提案替换、真实observation持久引用、显式旧event和clarify choices完整回读；`workspace-agent-conversation.spec.ts`：单轮/多轮实际消息契约 | 最终[acceptance-green.log](reviews/evidence-plan-06/acceptance-green.log)中1311单测+178 targeted通过；[db-green.log](reviews/evidence-plan-06/db-green.log)60条通过 |
| AC-04 | Agent严格未知字段/危险key/证据集合；DB越权、失败iteration、错误before/ID不stale旧提案、旧base不关闭新提案、跨analysis同ID拒绝错归因、两张真实owned图片及失效引用；图片真解码/384px缩小 | [acceptance-green.log](reviews/evidence-plan-06/acceptance-green.log)、[db-green.log](reviews/evidence-plan-06/db-green.log)、真实HTTP/Auth/DB [api-green.log](reviews/evidence-plan-06/api-green.log)8条通过 |
| AC-10 | `agent.test.ts`否定/引语/混合/假设及正向语言闸门；DB显示token缺失先核对、当前turn与task同TX完成后等待图像且60s租约不覆盖生图；Browser fetched token不等于展示授权 | [acceptance-green.log](reviews/evidence-plan-06/acceptance-green.log)、[db-green.log](reviews/evidence-plan-06/db-green.log)通过；08接实际summary展示回调，当前UI不传假凭据 |
| AC-19 | Hook保存后发/原键原体/新文字保留/跨方向flight；Browser失败原位retryOf新键、未知回读/刷新零重发；DB租约失败和late惰性、显式retryOf；真实API失败事件回执和变体冲突 | [acceptance-green.log](reviews/evidence-plan-06/acceptance-green.log)、[db-green.log](reviews/evidence-plan-06/db-green.log)、[api-green.log](reviews/evidence-plan-06/api-green.log)通过 |

- **phase: red**：`pnpm e2e -- e2e/workspace-agent-conversation.spec.ts --project=workspace`，退出1，1个预期行为失败：完整可恢复方向下Send没有消费turn、Direction messages不存在；结论：**预期失败，测试有效**。见[red.log](reviews/evidence-plan-06/red.log)。最初不存在方向fixture已纠正并重跑，不作为有效red。
- **phase: green / 项目门**：`pnpm verify:acceptance`退出0，workflow检查、12条workflow测试、1311条Vitest、生产构建、178条targeted全部通过；见[acceptance-green.log](reviews/evidence-plan-06/acceptance-green.log)。`pnpm e2e:smoke`退出0，18/18通过，见[smoke-green.log](reviews/evidence-plan-06/smoke-green.log)。相同最终源码的fast+build+smoke覆盖verify:full，不重复运行等价门。
- **真实DB**：`node scripts/test-workspace-db.mjs`退出0，独立可丢弃PostgreSQL应用8迁移、legacy升级检查和60条集成测试通过，见[db-green.log](reviews/evidence-plan-06/db-green.log)。无开发数据库破坏。
- **真实API**：`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-directions-api.spec.ts e2e/workspace-agent-submission-api.spec.ts e2e/workspace-agent-recovery-api.spec.ts e2e/workspace-analysis-api.spec.ts e2e/workspace-agent-turns-api.spec.ts`退出0，8/8通过。实际Auth.js cookie、真实HTTP/DB，没有mock被测路由，运行器清空live AI/R2凭据；见[api-green.log](reviews/evidence-plan-06/api-green.log)。
- **视觉**：新conversation两尺寸使用toHaveScreenshot，focus、无水平溢出与现有多尺寸/主题视觉在最终178套件通过。已人工查看[1440×900](reviews/evidence-plan-06/conversation-1440.png)与[390×844](reviews/evidence-plan-06/conversation-390.png)真实页面。保持过渡布局，最终双栏由11接续。
- **最终文件状态**：[source-sha256.txt](reviews/evidence-plan-06/source-sha256.txt)绑定27个本任务源码/测试/配置/基线文件。代码冻结后无源修改；文档收口后的最终fast记录为[handoff-fast.log](reviews/evidence-plan-06/handoff-fast.log)。
- **Review**：独立验收通过，见[审查报告](reviews/plan-06-review-2026-09-08.md)；由 root 将 review 改为 done。
- **恢复与必要相邻修改**：详见[implementation-notes.md](reviews/evidence-plan-06/implementation-notes.md)。前期门为补证据引用、完整轮次、请求数组hash、发送epoch而中断，不作为green。真实付费语义验证、部署和生产运行健康未执行，也不声称通过。

### 需求变更

未改变已批准PRD/架构的产品范围；本任务补齐06的解释、消息与恢复契约。07承接提案操作/定位，08承接真实展示凭据及下方生成栏，11承接最终响应式布局。没有扩大模型清单、工具权限或发布范围。
