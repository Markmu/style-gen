---
feat_id: "plan-09"
title: "结果比较与历史继续"
dimension: mixed
phase: 3
status: done
red_evidence: "plan-09-结果比较与历史继续.md#验证记录"
green_evidence: "plan-09-结果比较与历史继续.md#验证记录"
review_evidence: "reviews/plan-09-review-2026-09-09.md"
depends_on: ["plan-08"]
---

# plan-09 结果比较与历史继续

## 功能概要

- **目标**：结果比较与历史继续，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：结果完成只提示有新图，不抢走用户正在查看的旧图或焦点。用户可以比较参考与结果、两个结果，并引用偏差继续对话。查看历史与恢复编辑是两个动作，确认继续后才形成新草稿，首选标记不会改变验证状态。
- **依赖**：plan-08；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-02, AC-13, AC-14, AC-16, AC-21
- **涉及架构模块**：M1/M6
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/direction-result-rail.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/result-comparison-panel.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/history-panel.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/history-detail-dialog.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/hooks/use-history-restore.ts` | 现有文件；按本任务职责修改 |
| modify | `src/hooks/use-iteration-memory-view.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/hooks/use-workspace-agent.ts` | 计划内前置产物：plan-05 首次 create；执行前确认已交付 |
| modify | `src/app/workspace/page.tsx` | 现有文件；按本任务职责修改 |

### 验证文件

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/__tests__/direction-result-rail.test.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/__tests__/result-comparison-panel.test.tsx` | 现有文件；按本任务职责修改 |
| create | `e2e/workspace-agent-history.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 观看与草稿分离

selectedIterationId/compareIds/lastViewed只属viewState；完成增加未读提示，维持原选择、滚动和焦点。Reference/Result/Compare各自保留选择；比较明确两个对象ID、contain完整图像，无相似度评分。引用偏差发送typed iteration/evidence，不能直接变更草稿。

### 2. 历史恢复和方向返回

分页较早结果，不以analysisTaskId混方向。已有directionId提供返回方向；显式从此结果继续读取完整快照，展示差异经未保存守卫后才创建/修改草稿。旧任务仅恢复事件，完整参数缺失显示待修复，不猜模型/画幅。新参考使用真实可访问result资产，先保护当前方向；旧任务不换归属。

### 3. 媒体与偏好

下载/预览/历史错误分别重读，不触发生成；缺对象保留其他内容。首选仅PATCH方向preferredIterationId，绝不调用验证写点。Continue携带历史真实prompt/负向/变量/配方/绑定参数，草稿revision递增而历史快照不变。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 观看与草稿分离 | mixed | done | 已实现；最终完整门通过 |
| 2 | 历史恢复和方向返回 | mixed | done | 已实现；最终完整门通过 |
| 3 | 媒体与偏好 | mixed | done | 已实现；最终完整门通过 |
| 4 | 聚焦验证、项目门与交接证据 | mixed | done | 已完成AC映射与冻结验证，交独立task-review |

## 验收标准

- [x] AC-02 历史返回既有方向或旧来源restored，不伪造过去对话。
- [x] AC-13 完成不抢选中/焦点，查看不恢复，明确继续才读取快照形成新稿。
- [x] AC-14 参考/结果与结果/结果比较、偏差引用、早期历史/下载/首选/新参考均可达，首选不验证。
- [x] AC-16 继续/换参考先完整预览和未保存守卫，取消零写入，失效对象不补假数据。
- [x] AC-21 预览/下载/历史各自重读，不能连带生成或覆盖草稿。

### 验证方式

本任务既有目标spec同时承担发生布局/样式改动时的聚焦截图与focus断言；实现时将对应spec加入e2e:targeted（package.json为明确允许的相邻配置），再运行verify:acceptance。旧基线只能按批准交互审阅更新，不用最终plan-11验收替代本任务必要visual证据。

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-history.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。



## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-history.spec.ts --project=workspace
pnpm vitest --run src/components/workspace/__tests__/direction-result-rail.test.tsx src/components/workspace/__tests__/result-comparison-panel.test.tsx
pnpm verify:fast
pnpm build
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §4.2、§6.1/6.5、ADR-7；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-10；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| 完成时正在比较 / 键盘焦点在旧图 | 仅未读提示，不自动选新图 | done |
| 取消继续 / 来源详情失败 | 当前草稿零写入 | done |
| 图片失效 / 旧无direction记录 | 明确缺项；可重读/真实来源恢复，无假消息 | done |

## 需求变更

按批准的 plan-09 实现，没有新增产品范围。恢复的旧参数按历史原值保留（含不支持的画幅/缺失模型），生成前要求显式修复；冻结正文作为新稿手写全文，完整控制快照保留供切回结构化模式预览。完成通知只提示未读，任何默认或显式选择都不被新结果抢占。完整说明、相邻修改与集中审查修复见 [implementation-notes.md](../evidence/plan-09/implementation-notes.md)。

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-02 | `workspace-agent-history.spec.ts` Return previews...cancel no writes；真实API immutable restored recipe/漂移拒绝 | [api-final.log](../evidence/plan-09/api-final.log) 12/12；[review-fix-browser2.log](../evidence/plan-09/review-fix-browser2.log) |
| AC-13 | `workspace-agent-history.spec.ts` viewing an older result stays selected/focused；TC-5.2 新成功不抢选择+未读可查看 | [acceptance-final.log](../evidence/plan-09/acceptance-final.log) 210/210 |
| AC-14 | `workspace-agent-history.spec.ts` two explicit results compare, deviation only prepares conversation；visual 1440/390 | [acceptance-final.log](../evidence/plan-09/acceptance-final.log) |
| AC-16 | `workspace-agent-history.spec.ts` frozen values, return/continue require preview, cancel writes nothing；TC-4.11 原值保留+显式修复后POST白名单 | [acceptance-final.log](../evidence/plan-09/acceptance-final.log)、[db-final.log](../evidence/plan-09/db-final.log) 66/66 |
| AC-21 | `workspace-agent-history.spec.ts` detail failure retries only reads, never restores partial data；下载/预览独立重试 | [acceptance-final.log](../evidence/plan-09/acceptance-final.log) |

- **phase: red**：2026-09-09 执行 `pnpm e2e -- e2e/workspace-agent-history.spec.ts --project=workspace`，退出 1。正常页面已显示旧结果并主动选中，新结果完成后实际 selected 变为 new-result，而预期 old-result；预期失败，测试有效。[red.log](../evidence/plan-09/red.log)。
- **聚焦green**：目标历史spec 8/8 + 生成栏/恢复 30/30，[review-fix-browser2.log](../evidence/plan-09/review-fix-browser2.log)；hook聚焦38/38（切换回执保留新输入、偏好互斥、预览身份重检），[race-unit.log](../evidence/plan-09/race-unit.log)。
- **最终项目门**：`pnpm verify:fast` 134文件1346/1346、type/lint/workflow 通过，[review-fix-fast.log](../evidence/plan-09/review-fix-fast.log)；`pnpm verify:acceptance` 生产build + targeted 210/210（7.5m）退出0，[acceptance-final.log](../evidence/plan-09/acceptance-final.log)。首次构建遇 Next.js 内部 uncaughtException 瞬时错误（与 plan-07 首次构建同类），重跑通过。
- **smoke**：`pnpm e2e:smoke` 18/18（39.1s），[smoke-final.log](../evidence/plan-09/smoke-final.log)。
- **最终DB**：`node scripts/test-workspace-db.mjs` 6文件66/66，[db-final.log](../evidence/plan-09/db-final.log)。临时PostgreSQL，仅销毁测试资源。
- **最终真实API**：7 specs 12/12（真实Auth.js/HTTP/DB，不mock被测路由，无真实付费调用），[api-final.log](../evidence/plan-09/api-final.log)。
- **冻结源码**：[source-hashes.txt](../evidence/plan-09/source-hashes.txt) 449项，清单SHA256 `982695bd42ecf07c01f9b54625c55aeac12e863886620d1edef2c076a77f90f7`；[source-hash-check.log](../evidence/plan-09/source-hash-check.log) 全部校验通过。
- **视觉**：1440/390 历史快照截图已独立查看：完整冻结字段、返回/继续分离，390 无横向溢出。
- **Review**：root 独立验收通过，[plan-09-review-2026-09-09.md](reviews/plan-09-review-2026-09-09.md)。
- **恢复与文件边界变更**：相邻修改及原因见 [implementation-notes.md](../evidence/plan-09/implementation-notes.md)。
