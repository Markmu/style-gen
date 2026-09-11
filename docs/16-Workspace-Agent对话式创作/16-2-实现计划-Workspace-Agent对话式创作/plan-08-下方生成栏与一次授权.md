---
feat_id: "plan-08"
title: "下方生成栏与一次授权"
dimension: mixed
phase: 3
status: done
depends_on: ["plan-07"]
red_evidence: "plan-08-下方生成栏与一次授权.md#验证记录"
green_evidence: "plan-08-下方生成栏与一次授权.md#验证记录"
review_evidence: "reviews/plan-08-review-2026-09-09.md"
---

# plan-08 下方生成栏与一次授权

## 功能概要

- **目标**：下方生成栏与一次授权，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：输入框内始终是Send，生成按钮位于框外下方的模型、画幅、质量区域。缺项、未发文字或待应用提案会显示具体修复入口，编辑仍可继续。按钮、明确语言授权和快速复刻共用一次提交，未知状态先核对，明确失败的两种重试保留各自快照。
- **依赖**：plan-07；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-07, AC-08, AC-09, AC-10, AC-11, AC-20
- **涉及架构模块**：M1/M2/M4
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/workspace/service.ts` | 计划内前置产物：plan-02 首次 create；执行前确认已交付 |
| modify | `src/app/api/workspace/directions/[id]/commands/route.ts` | 计划内前置产物：plan-02 首次 create；执行前确认已交付 |
| modify | `src/lib/generation/submission.ts` | 计划内前置产物：plan-03 首次 create；执行前确认已交付 |
| modify | `src/lib/ai/model-config.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/render-readiness.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/workspace/summary-token.ts` | 计划内前置产物：plan-03 首次 create；执行前确认已交付 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/generation-bar.tsx` | 本任务首次创建 |
| modify | `src/hooks/use-workspace-agent.ts` | 计划内前置产物：plan-05 首次 create；执行前确认已交付 |
| modify | `src/app/workspace/page.tsx` | 现有文件；按本任务职责修改 |

### 验证文件

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/__tests__/generation-bar.test.tsx` | 本任务首次创建 |
| create | `src/lib/workspace/__tests__/authorization.test.ts` | 本任务首次创建 |
| create | `e2e/workspace-agent-generation-bar.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 控件与能力

生成栏始终在Composer外下方，与模型/画幅/质量同区；Send不切换语义，空消息禁发。所有执行入口及quick/重试在此栏，消息只可定位栏。使用真实catalog和SUPPORTED_ASPECT_RATIOS，最近abs(log ratio)与数组tie顺序，原型4:5实际推荐3:4。当前无生效quality映射只Standard可选，HD不可用，旧HD恢复须改选；negative保留编辑/快照但按绑定明示未单独应用。不得新增未证实Provider能力。

### 2. 就绪与摘要

前端检查未发送文字/附件、未flush、pending提案/turn、必填项/服务限制；服务端再次验证可知条件，不信前端ready。生成中允许下一轮编辑/解释，但禁止第二图像。签名摘要token含direction/revision/draftHash/modelBindingHash/expires15min，只有真正展示的回调才允许携带；token不是独立用户授权，任何摘要修改使它失效。按钮持久requestKey再发送，未知原键GET核对。

### 3. 语言及quick闭环

接通plan-06 render_request严格闸门，混合修改先提案不生图。armQuick保存source、settingsHash、fixed intent/detail、authorizationId、activationId/epoch；仅当前活动页面的分析完成事件能消费，任务创建与consume同事务。自动分析初始化可保持授权；设置/参考变更、失败、退出、换方向、恢复、401均clear/增epoch；刷新只invalidate/read，不补发quick；旧页回调无效。已提交只说明进行中不声称取消。

### 4. 失败区与参数快照

unknown只有核对，无新键重试；确定失败显示Retry original submission与Generate current draft，均在下方栏。前者复制原prompt/变量/模型绑定/参数，后者flush当前草稿重算摘要。绑定失效明确修复，不静默换模型；重复点击返回原任务，固定记录不受后续编辑影响。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 控件与能力 | mixed | done | 已实现；最终完整门通过 |
| 2 | 就绪与摘要 | mixed | done | 已实现；最终完整门通过 |
| 3 | 语言及quick闭环 | mixed | done | 已实现；最终完整门通过 |
| 4 | 失败区与参数快照 | mixed | done | 已实现；最终完整门通过 |
| 5 | 聚焦验证、项目门与交接证据 | mixed | done | 已完成AC映射与冻结验证，待独立task-review |

## 验收标准

- [x] AC-07 Send固定框内且空消息禁发，Generate固定框外下方同模型/画幅/质量区。
- [x] AC-08 未发送文本/附件、未flush、提案、缺项和服务限制可见可修，生成中允许下一轮编辑。
- [x] AC-09 按钮重复只一任务，参数变更只影响下轮，展示固定快照记录。
- [x] AC-10 当前原文明确授权+展示token执行一次，修改/混合请求只提案，消息无生成按钮。
- [x] AC-11 当前activation分析完成最多消费一次quick；改设置/参考/失败/退出/恢复清epoch，不假取消。
- [x] AC-20 unknown先同键核对；确定失败两种重试在下方栏且原快照/当前稿清晰区分。

### 验证方式

本任务既有目标spec同时承担发生布局/样式改动时的聚焦截图与focus断言；实现时将对应spec加入e2e:targeted（package.json为明确允许的相邻配置），再运行verify:acceptance。旧基线只能按批准交互审阅更新，不用最终plan-11验收替代本任务必要visual证据。

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-generation-bar.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。



## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-generation-bar.spec.ts --project=workspace
pnpm vitest --run src/components/workspace/__tests__/generation-bar.test.tsx src/lib/workspace/__tests__/authorization.test.ts
pnpm verify:fast
pnpm build
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §4.2、§6.3/6.4、ADR-4/6；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-09；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| IME确认与空消息 | 候选确认不触发Send，空消息不能发 | done |
| 快速分析晚到 / 多标签页 / 刷新 | epoch守卫，最多一张，不重放 | done |
| 保存中 / 未发送附件 / unknown | 具体阻塞原因，编辑保持可用 | done |

## 需求变更

按批准的 plan-08 实现，没有新增产品范围。正常分析保留未发送 goal，用户仍须 Send；quick 兑现 reference_or_fallback 政策，普通分析保留 user/restore 画幅。完整说明、必要相邻修改及两个计划 owner 的直接复用见 [implementation-notes.md](../evidence/plan-08/implementation-notes.md)。

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-07 | `workspace-agent-generation-bar.spec.ts`：Send stays inside composer、1440/390 visual and keyboard focus；component真实catalog/5比例/Standard | [acceptance-final.log](../evidence/plan-08/acceptance-final.log)：200/200 targeted、1338/1338单元通过 |
| AC-08 | 目标UI unsent/IME；mixed proposal阻塞；component生成中可编辑；hook普通current/quick持久化期间新增文字/参数首POST重检、精确附件清理 | [acceptance-final.log](../evidence/plan-08/acceptance-final.log)、[focused-hook.log](../evidence/plan-08/focused-hook.log)，最终全量包含新增34条hook用例 |
| AC-09 | 目标UI unknown原键同体确认、生成中禁止第二张；hook A→B→A晚返不覆盖/解锁B；DB同授权并发四次仅1任务/1dispatch | [acceptance-final.log](../evidence/plan-08/acceptance-final.log)、[db-final.log](../evidence/plan-08/db-final.log) 66/66 |
| AC-10 | 目标UI actually visible summary；hook GET不授权、实际显示后携带token；authorization expiry/修改失效；真实submission API保留严格原文授权校验 | [acceptance-final.log](../evidence/plan-08/acceptance-final.log)、[api-final.log](../evidence/plan-08/api-final.log) 12/12 |
| AC-11 | 目标UI precise analysis once / refresh / settings / exit / failure；DB pending→bound精确source/task/key、另一标签页抢先绑定、失败/刷新、成功清errorStage及拒stageRetry；quick画幅政策与normal对照 | [acceptance-final.log](../evidence/plan-08/acceptance-final.log)、[db-final.log](../evidence/plan-08/db-final.log)、[ratio-ui.log](../evidence/plan-08/ratio-ui.log) |
| AC-20 | 目标UI unknown submission / explicit retryOriginal / current；原绑定与token独立，unknown只GET再显式同键确认；旧rail只定位后下栏执行 | [acceptance-final.log](../evidence/plan-08/acceptance-final.log)、[api-final.log](../evidence/plan-08/api-final.log) |

- **phase: red**：`pnpm e2e -- e2e/workspace-agent-generation-bar.spec.ts --project=workspace`退出1，页面正常打开后缺少框外下方生成栏，1条目标行为预期失败，测试有效。[red.log](../evidence/plan-08/red.log)。
- **聚焦green**：新12条目标UI与旧iteration6条18/18，[focused-ui.log](../evidence/plan-08/focused-ui.log)；最终质量政策补充1/1，[ratio-ui.log](../evidence/plan-08/ratio-ui.log)。hook最终34/34，全量门1338包含全部。旧恢复入口/已审阅对话基线最终聚焦16/16，[final-migration-focused.log](../evidence/plan-08/final-migration-focused.log)。
- **最终项目门**：`pnpm verify:acceptance`退出0，workflow/test:workflow/type/lint、Vitest1338/1338、生产build、targeted200/200（7.0m）。[acceptance-final.log](../evidence/plan-08/acceptance-final.log)。`pnpm e2e:smoke`退出0，18/18（38.7s），[smoke-final.log](../evidence/plan-08/smoke-final.log)。两命令覆盖verify:full所有组成，不重复相同最终构建。文档收口`pnpm verify:fast`结果见[handoff-fast.log](../evidence/plan-08/handoff-fast.log)。
- **最终DB**：`node scripts/test-workspace-db.mjs`退出0，6文件66/66，[db-final.log](../evidence/plan-08/db-final.log)。临时PostgreSQL应用8次migration并验证旧snapshot兼容，仅销毁测试资源。
- **最终真实API**：`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-directions-api.spec.ts e2e/workspace-agent-submission-api.spec.ts e2e/workspace-agent-recovery-api.spec.ts e2e/workspace-analysis-api.spec.ts e2e/workspace-agent-turns-api.spec.ts e2e/workspace-agent-proposals-api.spec.ts e2e/workspace-agent-authorization-api.spec.ts`退出0，7 specs、12/12，[api-final.log](../evidence/plan-08/api-final.log)。使用真实Auth.js/HTTP/DB，无mock被测路由，运行器清空live AI/R2凭据；没有真实付费调用。
- **冻结源码与恢复**：[source-hashes.txt](../evidence/plan-08/source-hashes.txt)记录432项源码/测试/配置/图片，清单SHA256 `57c94bcbcb833e8aa858f4818196c68ba16c769becf52c1cc1fe22511ee39f24`；[source-hash-check.log](../evidence/plan-08/source-hash-check.log)全部校验通过、退出0。首次完整门194/200，保留[acceptance-baseline-migration-failed.log](../evidence/plan-08/acceptance-baseline-migration-failed.log)：两张旧conversation基线和四条旧restore栏定位/HD期望未迁移。仅更新已独立查看的两张基线和旧spec显式入口，保留原restore精确snapshot以及改选Standard后新稿参数断言；[freeze-differences.log](../evidence/plan-08/freeze-differences.log)证明仅3个测试/图片变化，生产源码未改。最终完整acceptance退出0；DB/API复用相同生产源码结果。
- **视觉**：真实浏览器截图已独立查看：[生成栏1440](../evidence/plan-08/generation-bar-1440.png)、[生成栏390](../evidence/plan-08/generation-bar-390.png)、[输入与下栏390](../evidence/plan-08/composer-390.png)、[对话1440](../evidence/plan-08/conversation-1440.png)、[对话390](../evidence/plan-08/conversation-390.png)。最终200条中的相关visual均通过，焦点、文字与下栏无裁切/水平溢出。
- **集中自审与独立预审**：root核对source两阶段、事务consume、实际可见摘要、原键恢复、首POST前await重检；唯一集中反馈为quick画幅政策，已修并以3:4参考/授权前16:9的DB对照和目标UI验证。随后冻结功能范围。命令route与summary-token无机械diff，复用情况及测试在[实现说明](../evidence/plan-08/implementation-notes.md)中明确。
- **交接状态（2026-09-09）**：实现交付至review，正式验收由root独立task-review完成。未自标done、未启动plan-09、未commit/部署/调用付费Provider；真机软键盘和生产环境不在本次验证范围。
