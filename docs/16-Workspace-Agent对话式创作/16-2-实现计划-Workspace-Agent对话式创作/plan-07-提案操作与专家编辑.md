---
feat_id: "plan-07"
title: "提案操作与专家编辑"
dimension: mixed
phase: 2
status: done
depends_on: ["plan-06"]
red_evidence: "plan-07-提案操作与专家编辑.md#验证记录"
review_evidence: "reviews/plan-07-review-2026-09-08.md"
green_evidence: "plan-07-提案操作与专家编辑.md#验证记录"
---

# plan-07 提案操作与专家编辑

## 功能概要

- **目标**：提案操作与专家编辑，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：用户可以编辑提案后应用、放弃或撤销，看到具体差异。变量、规则、详细度和手写全文共用一份草稿。旧提案和旧撤销不会覆盖新修改，全文改变必须经过精确合并预览。
- **依赖**：plan-06；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-04, AC-05, AC-06, AC-12
- **涉及架构模块**：M1/M2/M3/M5
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/workspace/service.ts` | 计划内前置产物：plan-02 首次 create；执行前确认已交付 |
| modify | `src/app/api/workspace/directions/[id]/commands/route.ts` | 计划内前置产物：plan-02 首次 create；执行前确认已交付 |
| modify | `src/lib/prompt-composer.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/render-readiness.ts` | 现有文件；按本任务职责修改 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/agent-conversation.tsx` | 计划内前置产物：plan-06 首次 create；执行前确认已交付 |
| modify | `src/components/workspace/recipe-card.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/prompt-card.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/hooks/use-workspace-agent.ts` | 计划内前置产物：plan-05 首次 create；执行前确认已交付 |

### 验证文件

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/workspace/__tests__/proposal.test.ts` | 本任务首次创建 |
| modify | `src/components/workspace/__tests__/recipe-card.test.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/__tests__/prompt-card.test.tsx` | 现有文件；按本任务职责修改 |
| create | `e2e/workspace-agent-proposals.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 确定性差异应用

DraftPatch最多32项、target/key去重，白名单target/action/before/after和当前真实变量/规则ID；apply事务检查baseRevision和所有before，全成或全退，重编译并写inverse/resultingRevision。discard仅关闭提案。undo仅当前revision等于resultingRevision，否则409并提供按最新版本重提恢复差异；不模糊merge。直接PATCH改稿使旧提案stale；保留历史应用回执。

### 2. 专家编辑与溯源

变量按ID写variableValues，规则沿用InvariantAdjustment；constraint使用完整规范字符串trim/dedupe Set并编入user来源段，不能仅存在消息中。详细度Concise/Balanced/Detailed映射concise/standard/professional。customPrompt整体before/after精确预览并确认，不重复拼此前派生prompt；取消保持全文。negativePromptText到negativePromptSnapshot仅编译边界转换。

### 3. UI操作与引用

Edit只改提案副本，Apply成功同步草稿和回执；Discard/Undo不生图。证据选中联动Reference/真实支持片段，无坐标明确不可定位；Ask about this携typed reference，保留焦点锚点。分析晚到初始化冲突亦用同提案机制；不允许局部成功展示为全部应用。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 确定性差异应用 | mixed | done | 先对应测试red，再交付规格与green |
| 2 | 专家编辑与溯源 | mixed | done | 先对应测试red，再交付规格与green |
| 3 | UI操作与引用 | mixed | done | 先对应测试red，再交付规格与green |
| 4 | 聚焦验证、项目门与交接证据 | mixed | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-04 提案应用再次校验对象、约束与before，不接受过时或非法引用。
- [x] AC-05 编辑副本后Apply原子全成；Discard零修改；匹配revision Undo无生成。
- [x] AC-06 旧提案/Undo409保留新稿，直接编辑使pending stale并提供最新对照。
- [x] AC-12 变量/规则/详细度/constraint真实编译及溯源，全文精确预览接受或取消，无坐标不虚构。

### 验证方式

本任务既有目标spec同时承担发生布局/样式改动时的聚焦截图与focus断言；实现时将对应spec加入e2e:targeted（package.json为明确允许的相邻配置），再运行verify:acceptance。旧基线只能按批准交互审阅更新，不用最终plan-11验收替代本任务必要visual证据。

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-proposals.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。



## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-proposals.spec.ts --project=workspace
pnpm vitest --run src/lib/workspace/__tests__/proposal.test.ts src/components/workspace/__tests__/recipe-card.test.tsx src/components/workspace/__tests__/prompt-card.test.tsx
pnpm verify:fast
pnpm build
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.2、§7.2、ADR-3；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-08；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| 32项越界 / 重复目标 / prototype路径 | 结构拒绝且草稿零写入 | done |
| 全文包含重复句 / before不一致 | 精确整体比较，409不全局替换 | done |
| 编辑后生成仍有旧提案 | 旧提案明确stale，不能永久隐形阻塞 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-04 | `workspace-agent-proposals-api.spec.ts`：invalid proposals rollback / foreign references；`proposal.test.ts`：>32、重复、prototype、未知对象及before原子拒绝 | 最终真实API [api-final.log](../evidence/plan-07/api-final.log) 11/11，含本任务3条；[unit-preaudit.log](../evidence/plan-07/unit-preaudit.log)及最终 [acceptance-green.log](../evidence/plan-07/acceptance-green.log) 1322/1322单元记录 |
| AC-05 | UI copy Edit→Apply→Undo、Discard、unknown原键GET、saved回读恢复、late analysis；API并发同键回执及完整Undo（缺变量/旧HD/禁用元数据） | [ui-preaudit.log](../evidence/plan-07/ui-preaudit.log)、[browser-freeze.log](../evidence/plan-07/browser-freeze.log)、[api-final.log](../evidence/plan-07/api-final.log)；最终 [acceptance-green.log](../evidence/plan-07/acceptance-green.log) 188/188浏览器与1322/1322单元通过 |
| AC-06 | API directPATCH stale / oldUndo409 / bad snapshot；UI latest typed recovery；hook跨方向Symbol/turn不清command锁；preview方向scope变化拒绝 | [api-final.log](../evidence/plan-07/api-final.log)、[unit-freeze.log](../evidence/plan-07/unit-freeze.log)、[browser-freeze.log](../evidence/plan-07/browser-freeze.log)；最终 [acceptance-green.log](../evidence/plan-07/acceptance-green.log) 188/188浏览器与1322/1322单元通过 |
| AC-12 | 精确全文cancel/accept、同文本→Variables保存重开、detail/真实变量/constraint user编译；typed evidence来源/无坐标/focus；旧Comparison L1完整保留与trap/Escape | `workspace-agent-proposals.spec.ts` 10条、旧`workspace-evidence-guided-render-loop.spec.ts`55条 [browser-freeze.log](../evidence/plan-07/browser-freeze.log) 65/65；[legacy-focused.log](../evidence/plan-07/legacy-focused.log)原3条；最终 [acceptance-green.log](../evidence/plan-07/acceptance-green.log) 188/188浏览器与1322/1322单元通过 |

- **phase: red**：`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-proposals-api.spec.ts`退出1，Auth.js/真实来源创建成功，Apply返回未实现400而预期200，1失败。[red-api.log](../evidence/plan-07/red-api.log)。`pnpm e2e -- e2e/workspace-agent-proposals.spec.ts --project=workspace`退出1，缺Edit proposal入口，1失败。[red-ui.log](../evidence/plan-07/red-ui.log)。结论：预期失败，测试有效。
- **聚焦green**：实现前red保留；逐步补足边界后UI8/8、unit65/65、API3/3通过，再补完整preview指纹/键盘与同文本持久，unit66/66和浏览器65/65通过。上述分阶段日志保留但最终收口以冻结源码的完整项目门为准。
- **最终DB**：`node scripts/test-workspace-db.mjs`退出0，5文件60/60。[db-final.log](../evidence/plan-07/db-final.log)。独立临时PostgreSQL应用8迁移并验证旧快照兼容，finally仅销毁测试资源。
- **最终真实API**：`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-directions-api.spec.ts e2e/workspace-agent-submission-api.spec.ts e2e/workspace-agent-recovery-api.spec.ts e2e/workspace-analysis-api.spec.ts e2e/workspace-agent-turns-api.spec.ts e2e/workspace-agent-proposals-api.spec.ts`退出0，11/11。[api-final.log](../evidence/plan-07/api-final.log)。真实Auth.js/HTTP/DB，不mock被测API；运行器清空live AI/R2凭据。恢复提案请求经真实引用校验后诚实停于模型未配置/成本未批准，没有真实收费调用。
- **最终项目门**：`pnpm verify:acceptance`退出0，workflow/type/lint、Vitest1322/1322、production build、完整targeted188/188（7.1m）通过。[acceptance-green.log](../evidence/plan-07/acceptance-green.log)。`pnpm e2e:smoke`退出0，18/18（38.4s），[smoke-green.log](../evidence/plan-07/smoke-green.log)。两命令合计覆盖verify:full全部组成，不重复相同最终构建。文档收口 `pnpm verify:fast`记录见[handoff-fast.log](../evidence/plan-07/handoff-fast.log)。
- **源码状态**：[source-sha256.txt](../evidence/plan-07/source-sha256.txt)绑定29个源码/测试/配置/基线文件。首次acceptance的Next构建出现内部`TypeError(reading length)`，同源码诊断构建通过（[build-diagnostic.log](../evidence/plan-07/build-diagnostic.log)），保留失败日志[acceptance-build-failed.log](../evidence/plan-07/acceptance-build-failed.log)，另一次完整门 fast/build 通过、浏览器187/188，仅旧Landing请求数组同步断言早于analysis POST（[acceptance-browser-failed.log](../evidence/plan-07/acceptance-browser-failed.log)）；改为等待同一精确顺序，旧spec [landing-focused.log](../evidence/plan-07/landing-focused.log) 6/6。最终完整acceptance已退出0；不将失败日志作为green。
- **视觉**：两个真实截图基线已查看无裁切/溢出：[1440](../../../e2e/workspace-agent-proposals.spec.ts-snapshots/proposal-1440-workspace-darwin.png)、[390](../../../e2e/workspace-agent-proposals.spec.ts-snapshots/proposal-390-workspace-darwin.png)。最终188/188门的实际截图已保存：[1440实际图](../evidence/plan-07/proposal-1440.png)、[390实际图](../evidence/plan-07/proposal-390.png)；两个visual在最终188/188门均通过。
- **恢复与必要相邻修改**：[implementation-notes.md](../evidence/plan-07/implementation-notes.md)。阶段fast发现旧03编译契约被意外禁用后已撤回该多余变化：继续解析受支持的变量占位符，只在草稿存储/应用边界整体精确比较；没有弱化既有submission断言。
- **独立预审**：root已集中审查并要求修复Undo旧值、command flight/receipt、全部全文入口及完整preview指纹/焦点和相同全文模式持久；已修并补对应测试。正式Review尚未执行，仅可由独立task-review出具报告。

- **交接状态（2026-09-08）**：实现与测试交付至review，不自我验收、不标done。源码/测试/配置及基线29文件冻结，校验见[source-hash-check.log](../evidence/plan-07/source-hash-check.log)。下一步由root独立task-review；没有启动plan-08、commit、部署或付费Provider。

- **独立验收结果**：root已完成九维验收并通过，见[报告](reviews/plan-07-review-2026-09-08.md)，任务review→done。此前“待review”交接记录为实施侧历史。
