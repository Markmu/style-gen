---
feat_id: "plan-05"
title: "附件分析与本机方向恢复"
dimension: mixed
phase: 2
status: done
depends_on: ["plan-04"]
red_evidence: "plan-05-附件分析与本机方向恢复.md#验证记录"
green_evidence: "plan-05-附件分析与本机方向恢复.md#验证记录"
review_evidence: "reviews/plan-05-review-2026-09-08.md"
---

# plan-05 附件分析与本机方向恢复

## 功能概要

- **目标**：附件分析与本机方向恢复，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：空白方向可发送单张参考，分析失败保留图片和目标，只重试失败阶段。刷新或关闭重开能找回方向、未发送内容和真实任务。登录失效或本机存储失败会诚实说明保存状态，恢复登录不会自动执行旧动作。
- **依赖**：plan-04；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-01, AC-02, AC-15, AC-16, AC-19, AC-21
- **涉及架构模块**：M1/M4/M5
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/analysis/[id]/route.ts` | 现有分析读取核对与timer兼容owner |
| modify | `src/lib/ai/webhook-utils.ts` | 现有分析读取核对与timer兼容owner |
| modify | `src/app/api/analysis/route.ts` | 现有文件；按本任务职责修改 |
| modify | `src/lib/repositories/analysis-task-repository.ts` | 现有文件；按本任务职责修改 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/workspace/draft-store.ts` | 本任务首次创建 |
| create | `src/hooks/use-workspace-agent.ts` | 本任务首次创建 |
| modify | `src/hooks/use-workspace-state.ts` | 现有文件；按本任务职责修改 |
| modify | `src/hooks/use-analysis.ts` | 现有文件；按本任务职责修改 |
| modify | `src/app/workspace/page.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/upload-zone.tsx` | 现有文件；按本任务职责修改 |

### 验证文件

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/workspace/__tests__/draft-store.test.ts` | 本任务首次创建 |
| create | `src/hooks/__tests__/use-workspace-agent.test.tsx` | 本任务首次创建 |
| create | `e2e/workspace-agent-entry.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 本机与服务端状态

IndexedDB按userId/directionId保存未发送文字/Blob、pending save、requestKey、lastViewed和本机最近方向指针；300ms debounce，发送/导航前await flush。仅服务成功显示Saved，本机显示Local draft；不可用提供复制/导出。URL方向优先，其次当前账户本机指针，退出账户隐藏他人缓存。原hook转适配层，只有新hook写核心草稿；区分draftSave/turn/generation/view状态。

### 2. 上传分析合流

单图上传/拖放/粘贴先校验并持久Blob和目标，再presign直传。无图文字、多文件/格式错误保留输入给具体修复，不自动生成。首页已有asset直接复用；analysis新增directionId/requestKey与任务绑定同事务，调用cost-guard覆盖旧入口。相同键复用，明确失败用新键复用asset且只重试失败阶段。分析初始化须绑定方向且草稿未改，否则保存待审差异，plan-07统一提案呈现。持久deadline和已知ID核对取代纯timer失败，缺Provider查询保留真实不确定性。

### 3. 恢复与未保存守卫

新建/替换/恢复先取完整来源预览，取消不写；保留原方向先flush，旧任务保持原directionId。v5导入先按analysis创建方向，再白名单PATCH本机编辑，两步都成功才标migrated，不能提前删除原数据。消息加载早页按throughSequence固定，读历史不执行。401清quick并暂停写/付费，本机可编辑；重连先读服务版本，冲突不覆盖。

### 4. 任务轮询

前台2s逐步到5s，后台暂停，回前台先读事实。分析/上传/对话分别保存失败阶段；未知生成只保留并查询原键，由后续生成栏显示修复。当前页面先复用现有布局接线，本任务不提前承诺最终双栏样式。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 本机与服务端状态 | mixed | done | 先对应测试red，再交付规格与green |
| 2 | 上传分析合流 | mixed | done | 先对应测试red，再交付规格与green |
| 3 | 恢复与未保存守卫 | mixed | done | 先对应测试red，再交付规格与green |
| 4 | 任务轮询 | mixed | done | 先对应测试red，再交付规格与green |
| 5 | 聚焦验证、项目门与交接证据 | mixed | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-01 上传/拖放/粘贴单图启动分析，无图文字/多图/格式错误保留输入且不自动生成。
- [x] AC-02 首页asset复用、不二次上传或分析；进入真实来源无假对话。
- [x] AC-15 较早消息、已debounce本机输入、方向与活动任务在关闭重开恢复且不重放。
- [x] AC-16 取消新建/替换/恢复零修改；确认先flush，旧任务归属原方向；v5两步成功才migrated。
- [x] AC-19 上传与分析分别失败只重试失败阶段，Blob/目标/asset保留。
- [x] AC-21 401/DB/本机存储失效保留可编辑内容，重登录不自动执行。

### 验证方式

本任务既有目标spec同时承担发生布局/样式改动时的聚焦截图与focus断言；实现时将对应spec加入e2e:targeted（package.json为明确允许的相邻配置），再运行verify:acceptance。旧基线只能按批准交互审阅更新，不用最终plan-11验收替代本任务必要visual证据。

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-entry.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。



## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-entry.spec.ts --project=workspace
pnpm vitest --run src/lib/workspace/__tests__/draft-store.test.ts src/hooks/__tests__/use-workspace-agent.test.tsx
pnpm verify:fast
pnpm build
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.1、§7.5、§8.2；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-06；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| 刷新/关页与写入竞争 | flush确认后导航；突发关闭依靠已debounce数据，不伪称最后按键绝不丢失 | done |
| IndexedDB拒绝 / DB离线 | 保留内存和可导出内容；不标Saved、不外呼 | done |
| 旧数据导入第二步失败 | 保留原数据与新方向ID；原键继续导入，不建重复方向 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-01 | entry：无图文字保留、Blob/目标先于 presign；draft-store：多图/MIME/大小拒绝；upload-zone：合法文件与非法格式 | targeted 170/170；fast 1259/1259 |
| AC-02 | use-workspace-agent：homepage analysis entry reuses its existing direction；真实 directions API：完整 owned 来源与不可变恢复 | hook 20/20；API 6/6 |
| AC-15 | entry：未发送文字刷新、活动任务恢复、固定 throughSequence 早页、两尺寸 visual/focus；hook：URL 优先、账户隔离、debounced 编辑、不可变 PATCH 与在途编辑 drain | targeted 170/170；hook 20/20 |
| AC-16 | entry：取消零写与焦点；hook：目标创建失败原键、换方向事件清理、晚到身份隔离、v5 PATCH 503→同方向/同键续导入；实际 page 新参考丢响应恢复 | hook 20/20；targeted 170/170；DB 42/42 |
| AC-19 | analysis.integration：structuring failure retries only that stage、unknown submission、stored binding；hook：lost new-reference response retains original direction；既有完整失败恢复旅程 | DB 42/42；targeted 170/170 |
| AC-21 | entry：IndexedDB 失效可复制导出、401 可编辑且 reconnect 无写；hook：lost PATCH 原体重试、v5 原数据保留；API：不可用模型零任务及未知生成不重发 | targeted 170/170；hook 20/20；API 6/6 |

- Red：phase: red；2026-09-08 `pnpm e2e -- e2e/workspace-agent-entry.spec.ts --project=workspace`，退出码 1，1 个失败：创作目标输入框尚未实现。预期失败，测试有效。[原始日志](reviews/evidence-plan-05/red.log)。
- Green：phase: green；2026-09-08，`pnpm e2e:targeted` 退出码 0，170/170（含 entry 9/9 与两尺寸截图回归）；`pnpm vitest --run src/hooks/__tests__/use-workspace-agent.test.tsx` 退出码 0，20/20（含 v5 故障、初始化等待、fail-closed 与在途切方向保存）。[targeted](reviews/evidence-plan-05/acceptance-final.log)、[hook](reviews/evidence-plan-05/hook-green.log)。
- 真实 DB/API：`node scripts/test-workspace-db.mjs` 退出码 0，4 文件42/42、8 migrations；`node scripts/test-workspace-db.mjs --e2e e2e/workspace-analysis-api.spec.ts e2e/workspace-agent-directions-api.spec.ts e2e/workspace-agent-submission-api.spec.ts e2e/workspace-agent-recovery-api.spec.ts` 退出码0，6/6。运行器创建并清理独立 PostgreSQL，API 不 mock 被测路由，清空 live AI/R2 凭据；计数外呼在实际 service/DB 层注入。 [DB](reviews/evidence-plan-05/db-green.log)、[API](reviews/evidence-plan-05/api-green.log)。
- 项目门：最终 `pnpm verify:acceptance` 退出码0，fast 127文件1259/1259、type/lint/workflow、生产构建、完整 targeted 170/170 全部通过。随后 `pnpm e2e:smoke` 退出码0，覆盖 verify:full 的额外 smoke 要求。前轮旧 .next 缓存 build 失败、167/170 时序失败均保留，未计入最终通过。[最终 acceptance](reviews/evidence-plan-05/acceptance-final.log)、[初始缓存失败](reviews/evidence-plan-05/acceptance-initial-cache-failure.log)、[时序失败](reviews/evidence-plan-05/targeted-before-timing.log)、[smoke](reviews/evidence-plan-05/smoke-green.log)。文档与证据收口后的 fast 最终结果另见 [final fast](reviews/evidence-plan-05/fast-final.log)。
- 最终文件状态：[source SHA256](reviews/evidence-plan-05/source-sha256.txt) 包含本工作区所有变更执行文件（含前置01–04共享 owner），并不把前置代码归为05新增；[evidence SHA256](reviews/evidence-plan-05/evidence-sha256.txt) 绑定最终日志与截图。没有 commit 或部署。
- 视觉：已查看实际 [1440×900](reviews/evidence-plan-05/entry-1440.png)、[390×844](reviews/evidence-plan-05/entry-390.png)，新增区域无截断/横向溢出，focus/Send 可见；composer 两 viewport 使用 toHaveScreenshot，不盲更新现有基线。
- 恢复与文件边界变更、旧断言适配、后续接口：[实施说明](reviews/evidence-plan-05/implementation-notes.md)。必要相邻 service 默认修复、failed 输入恢复/previousResult 最小 DTO 经独立审查确认；既有结果引用仍严格 completed+owned。
- Review：独立 task-review 通过，已转 done；见 [验收报告](reviews/plan-05-review-2026-09-08.md)。
