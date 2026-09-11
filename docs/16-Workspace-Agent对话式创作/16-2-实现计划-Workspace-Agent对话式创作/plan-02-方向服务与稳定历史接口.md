---
feat_id: "plan-02"
title: "方向服务与稳定历史接口"
dimension: backend
phase: 1
status: done
depends_on: ["plan-01"]
review_evidence: "reviews/plan-02-review-2026-09-08.md"
red_evidence: "plan-02-方向服务与稳定历史接口.md#验证记录"
green_evidence: "plan-02-方向服务与稳定历史接口.md#验证记录"
---

# plan-02 方向服务与稳定历史接口

## 功能概要

- **目标**：方向服务与稳定历史接口，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：调用者可以从真实来源创建方向并读取草稿及较早消息。重复创建返回原方向，跨用户来源不可访问。版本冲突保留新稿，分页期间新增消息不会使旧页遗漏。
- **依赖**：plan-01；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-02, AC-06, AC-15, AC-16
- **涉及架构模块**：M2/M5/M6
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/workspace/service.ts` | 本任务首次创建 |
| create | `src/app/api/workspace/directions/route.ts` | 本任务首次创建 |
| create | `src/app/api/workspace/directions/[id]/route.ts` | 本任务首次创建 |
| create | `src/app/api/workspace/directions/[id]/events/route.ts` | 本任务首次创建 |
| create | `src/app/api/workspace/directions/[id]/commands/route.ts` | 本任务首次创建 |
| create | `src/lib/workspace/__tests__/service.test.ts` | 本任务首次创建 |
| create | `e2e/workspace-agent-directions-api.spec.ts` | 本任务首次创建 |
| create | `e2e/helpers/workspace-db.ts` | 本任务首次创建 |
| modify | `e2e/helpers/auth.ts` | 现有文件；按本任务职责修改 |

## 实现规格

### 1. 来源与接口

实现架构 §7.3 directions POST/GET/PATCH、events GET、commands 的 restore 动作和 action-specific 验证；其他动作未实现前返回明确不支持，不伪成功。sourceKind=empty/analysis/iteration/template 的来源必须服务端按 userId 重读；来源不完整返回缺项，旧来源仅 restored 事件。restore 只接受本人完整 iteration，CAS 后原子写草稿和回执。title/preferredIterationId 必须校验实际归属，首选不写 verificationStatus。

### 2. 命令回执与分页

所有写入先查 requestKey+hash 再校验 revision/短期 token；同键不同 hash 409。events 默认20最大50、固定 throughSequence、sequence 降序分页；requestKey 查询与分页互斥。GET 只返回事实不执行收费任务。PATCH本期即按contracts校验DraftPatch白名单、ID、before及baseRevision并原子写规范草稿；plan-07在该基础增加提案/逆操作和专家编译，不能用未校验JSON直接写草稿。

### 3. 真实 API 验证入口

新增 e2e/helpers/workspace-db.ts：仅连接测试库，创建随机用户/方向/完整来源，按测试命名空间清理。auth helper 支持进程 AUTH_SECRET 优先、显式测试用户，沿用 Auth.js JWE，保留旧 helper 调用兼容，不引入生产认证后门。Playwright APIRequestContext 共享该 cookie 测真实 HTTP 路由/数据库，不能 page.route mock 被测接口。

**安全要求（架构 §8.3）**：所有权来自Auth.js，不接收客户端userId；direction/event/asset/iteration/template/evidence逐个校验，错误400/404/409/429/502/503按架构契约，若已创建事件/任务返回其ID、retryable与preservedContext。凭据仅服务端，不在日志记录全文、签名URL或凭据。

**可观测性（架构 §8.5）**：在本任务拥有的业务边界记录directionId/eventId/taskId、requestKey摘要、base/currentRevision、binding、phase、duration、reservedCost/errorCode；proposal_stale、duplicate_request_reused、submission_unknown、output_recovered、memory_saved_refresh_failed、budget_blocked由实际发生边界发一次，不每次轮询刷告警。日志采集和告警渠道在部署阶段落实。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 来源与接口 | backend | done | 先对应测试red，再交付规格与green |
| 2 | 命令回执与分页 | backend | done | 先对应测试red，再交付规格与green |
| 3 | 真实 API 验证入口 | backend | done | 先对应测试red，再交付规格与green |
| 4 | 聚焦验证、项目门与交接证据 | backend | done | 完成AC映射和边界记录，交独立task-review |

## 验收标准

- [x] AC-02 真实analysis/iteration/template来源创建且旧来源仅restored事件。
- [x] AC-06 PATCH旧revision和同键异hash均409且零写入。
- [x] AC-15 20条稳定分页及throughSequence期间插入不重叠遗漏。
- [x] AC-16 失效/跨用户来源404，restore失败不写草稿。

### 验证方式

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-directions-api.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。

### 性能验收（架构 §8.1）
- [x] AC-15 以测试数据库1000条事件、20条分页和纯 PATCH 各100次采样记录 p95 < 500ms；排除外部推理，注明机器、数据量、冷启动和日志路径，不将工程目标写成已实测承诺。

## 验证命令

```bash
node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-directions-api.spec.ts
pnpm vitest --run src/lib/workspace/__tests__/service.test.ts
pnpm verify:fast
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §6.1、§7.3/7.5；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：plan-03；交接最终路径、接口差异、未解决边界和真实验证记录。

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
| 来源失效 / 非本人 | 统一404，不向 reducer 返回伪恢复内容 | done |
| 翻页中新增消息 | 固定上界，事件 ID 去重，新区单独读取 | done |
| 旧 revision / 相同键异 hash | 409，无部分草稿变更 | done |

## 验证记录

| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-02 | `e2e/workspace-agent-directions-api.spec.ts`：`AC-02` 真实analysis/iteration/template来源创建且旧来源仅restored事件 | 通过；对应真实 API 用例及下方 green 日志 |
| AC-06 | `e2e/workspace-agent-directions-api.spec.ts`：`AC-06` PATCH旧revision和同键异hash均409且零写入 | 通过；对应真实 API 用例及下方 green 日志 |
| AC-15 | `e2e/workspace-agent-directions-api.spec.ts`：`AC-15` 20条稳定分页及throughSequence期间插入不重叠遗漏 | 通过；对应真实 API 用例及下方 green 日志 |
| AC-16 | `e2e/workspace-agent-directions-api.spec.ts`：`AC-16` 失效/跨用户来源404，restore失败不写草稿 | 通过；对应真实 API 用例及下方 green 日志 |

- Red：`node scripts/test-workspace-db.mjs --e2e e2e/workspace-agent-directions-api.spec.ts`，退出码 1，真实 JWE 的 `/api/auth/session` 验证成功后，新 POST directions 返回 404 而非 201。预期失败，测试有效；无被测 API mock。[red 日志](reviews/evidence-plan-02/red.log)。初次测试 fixture 缺 cookie expires 的失败已修正，未将该环境失败作为 red。
- Green：同一 API 命令退出码 0，2 项完整真实 HTTP 用例通过。第一项覆盖三种真实来源/空白、未登录与归属、linked asset 越权、过期 CAS/同键异 hash、重复恢复、Memory 缺分析诚实返回、首选方向约束、稳定分页及性能；第二项覆盖 immutable recipe/variables 优先、variables 模式不被固定全文覆盖、引用图元数据、Memory 自有变量与 customTemplate。[API 日志](reviews/evidence-plan-02/green-api.log)。
- 性能：darwin/arm64，独立 Docker PostgreSQL 17、Next dev 专用实例。1000 条事件，默认 20 条页，5 次预热后 GET 与纯 PATCH 各 100 次；排除编译/外部推理。最终原始指标：`{"metric":"workspace_api_p95_ms","events":1000,"samples":100,"warmup":5,"platform":"darwin","arch":"arm64","page":16.644333999999617,"patch":29.084667000000536}`。两项 p95 均 < 500ms；此为本机工程验收，不宣称生产延迟保证。
- Green：`pnpm vitest --run src/lib/workspace/__tests__/service.test.ts`，退出码 0，3 项通过，验证准确 before/无部分修改、操作与模型/质量白名单、约束完整字符串标识。[unit 日志](reviews/evidence-plan-02/green-unit.log)。`node scripts/test-workspace-db.mjs`，退出码 0，7 项 DB 回归通过，[日志](reviews/evidence-plan-02/green-db.log)。
- 项目门：`pnpm verify:fast`，退出码 0，workflow/12 项 workflow tests/type/lint/120 文件 1223 项 Vitest 全通过；既有 26 lint warnings。`pnpm build` 和 `pnpm e2e:smoke` 均退出码 0，smoke 18 项通过；与 fast 构成同一最终状态的 verify:full 等价证据。[fast](reviews/evidence-plan-02/verify-fast.log)、[build](reviews/evidence-plan-02/build.log)、[smoke](reviews/evidence-plan-02/smoke.log)。
- 文件状态：[SHA256 清单](reviews/evidence-plan-02/sha256.txt)。Review 由未参与实现的root独立完成，通过；见review_evidence。
- 邻近文件：新增 `validation.ts` 集中纯输入与 DraftPatch 校验，新增 `http.ts` 统一 Auth.js/ISO JSON/错误脱敏；仓储 `createDirection` 增可选 creationContext，用不可变 restored 回执记录 Memory 与 iteration 来源，避免 provenance 混淆；`next.config.ts` 与 DB runner 使用每次复制并清理的独立 tsconfig，防止 Next 修改共享 tsconfig。均为允许的必要邻近类型/fixture/配置与契约连接，无新增产品范围。
- 下游契约：API 返回 `{direction,event?,reused?}`，Date 由 JSON 序列化为 ISO；GET 额外返回 `source.reference`（真实 id/fileUrl/width/height/mimeType）、recipe/variables/analysisStatus、activeTask、readiness/summaryToken。plan-03 尚未签摘要，当前 token 为 null 且 canGenerate=false，不伪造准入许可。sourceRevision 可选 ISO updatedAt，重试先核对原始请求 hash 再读来源。requestKey 仅 ASCII 字母数字/冒号/下划线/横线且最长 180，为内部 namespace 保留空间。constraint key 为完整原文 SHA256，新建为 `new:<stable-id>`；规则 after 必须等于相应规范化 action 的结果。restore 只接完整本人 completed iteration；其它命令严格检查 action 字段后明确 ACTION_NOT_IMPLEMENTED，交后续 task 接入。
- 安全与边界：未访问 live Provider，测试只连接命名严格校验的随机数据库，随机用户/secret/JWE，独立 Next 端口和 build 目录，finally 清理。auth helper 保持旧调用兼容，新 API helper 不 mock session 或被测路由。更新草稿与关闭旧 pending proposal/quick 授权在同一事务中，不执行收费动作。重复源创建在源变更后仍返回原方向；restore 失败原草稿不变。
