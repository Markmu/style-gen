---
feat_id: "plan-10"
title: "风格记忆保存与回执恢复"
dimension: mixed
phase: 3
status: done
red_evidence: "plan-10-风格记忆保存与回执恢复.md#验证记录"
green_evidence: "plan-10-风格记忆保存与回执恢复.md#验证记录"
review_evidence: "reviews/plan-10-review-2026-09-10.md"
depends_on: ["plan-09"]
---

# plan-10 风格记忆保存与回执恢复

## 功能概要

- **目标**：风格记忆保存与回执恢复，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：草稿和选定结果能分别保存为Style Memory，目标名称与代表图确认明确。草稿仍待验证，用户确认代表图才进入已验证状态。保存失败保留表单，已保存但刷新失败只重新读取，未知响应先查回执。
- **依赖**：plan-09；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-02, AC-17, AC-18, AC-21
- **涉及架构模块**：M2/M5/M6
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/templates/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/app/api/templates/[id]/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/app/api/templates/[id]/duplicate/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/app/api/templates/[id]/representative-result/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/repositories/template-repository.ts` | 现有文件；按本任务职责修改 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/template-save-dialog.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/iterations/save-style-memory-dialog.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/hooks/use-workspace-agent.ts` | 计划内前置产物：plan-05 首次 create；执行前确认已交付 |
| modify | `src/app/workspace/page.tsx` | 现有文件；按本任务职责修改 |

### 验证文件

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/repositories/__tests__/template-repository.test.ts` | 现有文件；按本任务职责修改 |
| modify | `src/components/iterations/__tests__/save-style-memory-dialog.test.tsx` | 现有文件；按本任务职责修改 |
| create | `e2e/workspace-agent-memory.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 保存目标与验证语义

Save draft服务端读取当前draft构造原模板payload；Save result取选中任务快照和代表图，明确确认后调用既有写点。名称预填/标签编辑，来源templateId真实；新建副本/更新目标显式，preferred不视作验证。缺analysis的Memory仍可编辑保存，但生图需补参考分析，不制造completed分析。

### 2. 事务回执与兼容

既有create/update/duplicate/representative写点增可选requestKey和方向上下文，不能另开同义端点；模板写入和workspace memory回执同事务，重复键先回原ID，异hash409。原无键调用兼容，但不伪称已有幂等保证。receipt存目标及返回ID，未知响应通过events requestKey查询，确认不存在后仍复用原键重试。

### 3. UI保存恢复

内联保存状态区分未提交、保存中、失败、committed但回读失败；服务响应先存committedMemoryId再刷新列表详情，后者失败只GET。表单/待提交键持久本机，Local draft不叫已同步。历史/登录恢复只读，不自动重放保存或付费动作。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 保存目标与验证语义 | mixed | done | 草稿/副本/代表写点目标明确；缺analysis可编辑保存且 canGenerate=false（API 用例断言） |
| 2 | 事务回执与兼容 | mixed | done | 四写点可选 requestKey+directionId；模板与 memory 回执同事务；重复键回原ID、异hash 409、无键兼容（integration+API 断言） |
| 3 | UI保存恢复 | mixed | done | 未提交/保存中/失败/未知/committed回读失败区分；表单+待提交键 IndexedDB 持久；恢复只读不重放（UI 用例断言） |
| 4 | 聚焦验证、项目门与交接证据 | mixed | done | red/green/DB/API/构建/验收证据落 evidence/plan-10，交独立task-review |

## 验收标准

- [x] AC-02 Memory来源与缺项真实，缺analysis可编辑保存但不能假造completed分析生成。
- [x] AC-17 草稿保存/副本/代表更新目标明确，草稿待验证，用户确认代表才验证。
- [x] AC-18 未提交失败保留表单、未知查同键回执、committed回读失败只GET，本机不叫同步。
- [x] AC-21 登录或详情恢复不自动重放保存/生成，不抹去已保存ID。

### 验证方式

本任务既有目标spec同时承担发生布局/样式改动时的聚焦截图与focus断言；实现时将对应spec加入e2e:targeted（package.json为明确允许的相邻配置），再运行verify:acceptance。旧基线只能按批准交互审阅更新，不用最终plan-11验收替代本任务必要visual证据。

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-memory.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。



## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-memory.spec.ts --project=workspace
pnpm vitest --run src/lib/repositories/__tests__/template-repository.test.ts src/components/iterations/__tests__/save-style-memory-dialog.test.tsx
pnpm verify:fast
pnpm build
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.5、§7.3、ADR-7；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-11；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| 写成功响应丢失 / 刷新失败 | 向导先按同键查回执（命中则以回执ID完成，不发第二次POST）；重载恢复只读查一次回执；committed回读失败走既有重试读取横幅 | done |
| 目标被删 / 跨用户代表图 | 同键回执存在但模板已删 → 404（integration+API 断言，不重建）；跨用户方向/键校验 400/404/409 | done |
| 草稿无代表 / 用户取消代表确认 | 流程B固定无代表保存（pending verification，UI断言不带 representativeGenerationTaskId）；代表仅经确认写点 user_verified（API+integration 断言） | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-02 | `workspace-agent-memory.spec.ts` real API：orphan Memory 可编辑保存、来源方向 readiness.canGenerate=false | [api-e2e.log](../evidence/plan-10/api-e2e.log) 1 passed / 4 UI skipped（运行器真实DB） |
| AC-17 | `workspace-agent-memory.spec.ts` UI "draft save posts an explicit direction requestKey…" + real API create/duplicate/representative 幂等与验证语义 + integration | [focused-ui.log](../evidence/plan-10/focused-ui.log) 4/4；[api-e2e.log](../evidence/plan-10/api-e2e.log)；[db-integration.log](../evidence/plan-10/db-integration.log) 69/69 |
| AC-18 | UI unknown→查同键回执→原键重试 / committed回读失败只GET；组件 27/27；仓储与API幂等/异hash 409/无键兼容 | [focused-ui.log](../evidence/plan-10/focused-ui.log)；[focused-unit.log](../evidence/plan-10/focused-unit.log) 69/69；[api-e2e.log](../evidence/plan-10/api-e2e.log)；[db-integration.log](../evidence/plan-10/db-integration.log) |
| AC-21 | UI "reload after unknown save never replays the POST…"（不重放、表单与原键持久、回执命中不抹ID） | [focused-ui.log](../evidence/plan-10/focused-ui.log) 4/4 |

- **phase: red**：2026-09-09 执行 `pnpm e2e -- e2e/workspace-agent-memory.spec.ts --project=workspace`，退出 1（4/4 失败，ELIFECYCLE exit code 1）。失败均为行为缺失：保存请求体无 directionId（AC-17）、未知响应不查同键回执（AC-18/AC-21）、保存成功后无 committed 回读协调（AC-18）。中途一处测试脚本 regex 转义缺陷已修正后重跑确认（环境/语法失败未充当 red）。[red.log](../evidence/plan-10/red.log)。
- **聚焦green**：同命令最终 4/4 通过（[focused-ui.log](../evidence/plan-10/focused-ui.log)）；组件+仓储聚焦 `pnpm vitest --run src/lib/repositories/__tests__/template-repository.test.ts src/components/iterations/__tests__/save-style-memory-dialog.test.tsx` 退出 0，69/69（[focused-unit.log](../evidence/plan-10/focused-unit.log)）；旧交互 spec 迁移断言后聚焦 12/12（[focused-interaction-refinement.log](../evidence/plan-10/focused-interaction-refinement.log)）。
- **最终项目门**：`pnpm verify:fast` 退出 0，134 文件 1354/1354 + type/lint/workflow（[verify-fast.log](../evidence/plan-10/verify-fast.log)）；`pnpm build` 退出 0（[build.log](../evidence/plan-10/build.log)）。
- **最终DB**：`node scripts/test-workspace-db.mjs` 退出 0，7 文件 69/69（含新增 workspace-template-memory integration；[db-integration.log](../evidence/plan-10/db-integration.log)）。临时PostgreSQL容器，仅销毁测试资源。
- **最终真实API**：`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-memory.spec.ts` 退出 0，1 passed / 4 UI skipped（真实 Auth.js/HTTP/DB，不mock被测路由，无真实付费调用；[api-e2e.log](../evidence/plan-10/api-e2e.log)）。
- **验收门**：`pnpm verify:acceptance`（最终状态，含本 spec 于 e2e:targeted）退出 0：fast 134 文件 1354/1354 + 生产 build + targeted 214 passed / 1 skipped（API 用例按互斥约定走运行器）/ 0 failed，7.7m。首跑 213+1 failed 为旧 interaction-refinement 断言与新契约冲突，迁移后全绿。[acceptance.log](../evidence/plan-10/acceptance.log)。
- **冻结源码**：[source-hashes.txt](../evidence/plan-10/source-hashes.txt) 426 项，清单 SHA256 `26da84427735d58f8168e80fe0e8aa423dc187f26543a3938b5222b33342f61b`（最终状态，含迁移后 interaction-refinement spec）。
- **Review**：root 独立验收通过（补跑 smoke 18/18 与 426 项哈希校验），[plan-10-review-2026-09-10.md](reviews/plan-10-review-2026-09-10.md)。
- **恢复与文件边界变更**：相邻修改及原因见 [implementation-notes.md](../evidence/plan-10/implementation-notes.md)。
