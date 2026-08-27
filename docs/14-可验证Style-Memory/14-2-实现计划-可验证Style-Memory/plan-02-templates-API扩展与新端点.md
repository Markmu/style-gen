---
feat_id: "plan-02"
title: "templates API 扩展与新端点"
dimension: backend
phase: 2
status: done
depends_on: ["plan-01"]
---

# plan-02: templates API 扩展与新端点

## 功能概要

- **目标**: 落地架构 §7.3 的 8 端点契约：扩展 `POST/GET /api/templates`、`GET/PUT/DELETE /api/templates/[id]`、`POST /api/templates/[id]/duplicate`；新增 `representative-result` 与 `representative-candidates` 两个子资源端点；统一全部写端点限流与 409 错误码。
- **完成后可观察结果**: 通过 API 即可完成架构 §6 全部治理动作——带代表结果保存返回 `user_verified` 记录；列表支持状态筛选与六路搜索；详情返回完整验证依据与使用聚合；编辑规则实质变化后响应状态回退 `pending_verification`；设置/替换代表结果原子置为已验证；复制返回待验证复制品；删除被引用 Memory 返回 204 且 Iteration 完好。前端尚未接入（plan-04～07），本功能以路由契约测试验证。
- **依赖**: plan-01（repository 函数与类型）
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-09, AC-11]
- **涉及架构模块**: ② API 层
- **前置条件**: plan-01 完成且迁移已应用。
- **不在范围**: 任何前端消费方；`GET /api/generation` 迭代接口；既有 `linkTemplateToGenerationTask` 语义变更。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/templates/route.ts` | POST 扩展体 + 状态派生日志；GET status 筛选 + 扩展 search + 新列表 DTO |
| modify | `src/app/api/templates/[id]/route.ts` | GET 详情 DTO；PUT 五字段编辑 + 回退 + 409 code 统一 |
| modify | `src/app/api/templates/[id]/duplicate/route.ts` | 复制新字段 + 固定待验证 |
| create | `src/app/api/templates/[id]/representative-result/route.ts` | POST 设置/替换代表结果 |
| create | `src/app/api/templates/[id]/representative-candidates/route.ts` | GET 候选迭代（游标分页） |
| modify | `src/lib/rate-limit.ts` | `RATE_LIMIT_CONFIGS` 增加 `templateWrite` |
| modify | `src/lib/__tests__/rate-limit.test.ts` | 新配置用例 |
| modify | `src/app/api/templates/__tests__/route.test.ts` | POST/GET 扩展用例 |
| create | `src/app/api/templates/[id]/__tests__/route.test.ts` | [id] GET/PUT/DELETE 用例 |
| create | `src/app/api/templates/[id]/representative-result/__tests__/route.test.ts` | 新端点用例（含负向） |
| create | `src/app/api/templates/[id]/representative-candidates/__tests__/route.test.ts` | 新端点用例 |

## 实现规格

### 后端部分

#### 1. 限流统一（`src/lib/rate-limit.ts` + 全部写路由）

- `RATE_LIMIT_CONFIGS` 增加 `templateWrite: { windowMs: 60*60*1000, maxRequests: 30 }`
- 删除 `route.ts` 内的本地 `rateLimitStore`/`checkRateLimit` 实现，改用共享 `checkRateLimit(identifier, "templateWrite", ...)`；identifier 取 session `userId`（登录用户），无 session 场景取 `x-forwarded-for` 首 IP
- 接入端点：POST /api/templates、PUT、DELETE、duplicate、representative-result（GET 与 candidates 为读端点不限流）；429 响应沿用 `{ error, code: "RATE_LIMITED", retryable: true }`

#### 2. POST /api/templates（保存流程提交体）

请求体扩展字段（数据来源，架构 §7.3）：`description?`(user_input ≤500)、`retainedRules?`(user_input ≤12 条 × ≤200 字符)、`negativeConstraints?`(同上)、`styleTokens?` / `enhancementHints?`(frontend_computed ≤16 条 × ≤80 字符)、`representativeGenerationTaskId?`(user_input)。

- 校验：`representativeGenerationTaskId` 若存在必须等于 `sourceGenerationTaskId`，且该任务归属本人、`completed`、`resultAssetId` 非空（复用既有来源迭代校验逻辑）；数组上限越界 → 400 `INVALID_REQUEST`；**请求体含 `verificationStatus` 字段一律 400 拒绝**（ADR-1 信任边界）
- 透传 plan-01 的 `createTemplate` 完成状态派生
- 日志（架构 §8.5）：`template_created` 增记 `verificationStatus`、规则计数、`representativePresent`

#### 3. GET /api/templates（列表）

- query：`search`(≤100，trim 空串等同不过滤，沿用)、`status`（白名单 `all | user_verified | pending_verification`，缺省 `all`）、`cursor`、`limit`（默认 10 上限 50，沿用既有契约）
- 调用 plan-01 列表联查，返回 `StyleMemoryListItem` 分页结构（items/hasMore/nextCursor，游标为 `(sortTs,id)` 编码串）

#### 4. GET /api/templates/[id]（详情）

调用 `findStyleMemoryDetail`，404/401 沿用；日志 `template_detail_queried` 增记 `verificationStatus`。

#### 5. PUT /api/templates/[id]（编辑五字段）

- 接受：`name` / `description` / `variables`（默认值编辑）/ `retainedRules` / `negativeConstraints`；`content` 保留兼容既有调用方，但不触发回退（PRD 口径）
- `variables` 校验沿用既有 `validateVariables`；规则数组校验同 POST
- 名称冲突时返回 409 **`TEMPLATE_NAME_CONFLICT`**（由现状 `CONFLICT` 统一，架构 §8.2）
- 调用 plan-01 `updateTemplate`（内部 `ruleSetsChanged` 判定回退）；响应含更新后 `verificationStatus`；日志 `template_updated` 增记 `verificationStatus` 与 `rulesChanged`，回退时记 `template_verification_reset { templateId, trigger: "rules"|"constraints" }`

#### 6. DELETE /api/templates/[id]

行为不变（物理删行、204、404）；删除后 Iteration 解链由 plan-01 的 FK `SET NULL` 生效。

#### 7. POST /api/templates/[id]/duplicate（复制）

调用扩展后的 `duplicateTemplate`，201 返回复制品（`pending_verification`、无代表结果）；限流接入。

#### 8. POST /api/templates/[id]/representative-result（设置/替换代表结果）

- body：`{ generationTaskId: string }`(user_input，26 位 ULID)
- 校验（全部负向 → 400/404）：Memory 归属本人；目标任务归属本人、`completed`、`resultAssetId` 非空、**属于相关集**（`task.sourceTemplateId === templateId || task.id === memory.sourceGenerationTaskId`，与 plan-01 候选查询同口径）
- 调用 `setRepresentativeResult` 原子更新；200 返回更新后记录（`user_verified`）
- 日志：`representative_result_set { templateId, generationTaskId, action: "set" | "replace" }`（action 按原 representative 是否为空判定）

#### 9. GET /api/templates/[id]/representative-candidates（候选列表）

- query：`cursor` / `limit`（默认 20 上限 50）
- 调用 `listRepresentativeCandidates`；404 口径同详情

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | rate-limit 增配置 + 移除路由本地实现并接入 5 个写端点 | backend | done | §实现规格 1 |
| 2 | POST 扩展体校验 + 派生透传 + 日志 | backend | done | 拒绝 verificationStatus 字段 |
| 3 | GET 列表 status/搜索/新 DTO | backend | done | 白名单校验 |
| 4 | GET 详情 DTO | backend | done | 防御降级在 plan-01 已实现 |
| 5 | PUT 五字段 + 回退 + 409 统一 | backend | done | 含 verification_reset 日志 |
| 6 | duplicate 扩展 | backend | done | 透传 plan-01 复制边界 |
| 7 | representative-result 端点 | backend | done | 相关集校验 + 原子更新 + 日志 |
| 8 | representative-candidates 端点 | backend | done | 游标分页 |
| 9 | 全部路由测试补齐 | backend | done | 覆盖验收矩阵 |

## 验收标准

### 后端验收

- [x] AC-04 POST 带 `representativeGenerationTaskId`（等于 sourceGenerationTaskId 且合法）→ 201 `user_verified`；不带 → `pending_verification`；请求体携带 `verificationStatus` → 400
- [x] AC-11 POST/PUT 名称冲突均返回 409 `TEMPLATE_NAME_CONFLICT`（统一后无 `CONFLICT` 残留）
- [x] AC-02 `status=user_verified|pending_verification|all` 与 `search` 组合生效；搜索命中规则/排除/token/增强词/变量名/label/description，且不因变量 JSON 键名误命中（API 层测试）
- [x] AC-03 GET 详情返回完整 `StyleMemoryDetail`（含 usage 与代表结果链）
- [x] AC-05 PUT 仅改名称/说明/变量默认值 → 状态不变；改 `retainedRules` 或 `negativeConstraints`（实质变化）→ 响应 `pending_verification`；representative-result 置为 `user_verified` 且非法目标（非相关集/非 completed/非本人）→ 400/404
- [x] AC-07 DELETE 被引用 Memory → 204；随后 GET 该 Memory → 404，原 Iteration 详情 `sourceTemplateName` 为 null 且仍可访问
- [x] AC-09 详情防御降级：构造脏数据行时 DTO 返回 `pending_verification`
- [x] 限流：第 31 次/小时写请求 → 429 `RATE_LIMITED`（对 5 个写端点分别断言接入，单端点抽查即可）
- [x] 输入上限：>12 条规则 / >200 字符规则 / >500 说明 → 400
- [x] `pnpm type-check && pnpm vitest --run src/app/api/templates` 通过；`pnpm verify:fast` 通过

### 契约对接验收

- [x] 响应 DTO 与 `src/types/models.ts` 类型完全一致（plan-04～07 的消费契约）

## 验证命令

```bash
pnpm vitest --run src/app/api/templates src/lib/__tests__/rate-limit.test.ts
pnpm type-check
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §7.3（端点表与字段数据来源）、§6.3（POST 语义）、§6.4（PUT 回退/相关集/复制/删除）、§6.1（列表 query）、§8.2（错误码统一）、§8.3（校验上限/限流/鉴权）、§8.5（日志事件）
- **相关代码**: 既有校验函数 `validateVariables` / `validateSourceGenerationTaskId`（route.ts 内，扩展而非重写）；`findGenerationTaskById`（来源校验复用）
- **契约 / 数据对象**: `SaveStyleMemoryRequest` / `UpdateStyleMemoryRequest` / `StyleMemoryListItem` / `StyleMemoryDetail` / `RepresentativeCandidate`
- **下游消费方**: plan-04（GET 列表）、plan-05（GET/PUT/DELETE/duplicate/两个新端点）、plan-06（POST）、plan-07（无直接调用，经 plan-04/05 入口）

## 风险与边界

- **执行顺序**: 按 Task 列表顺序；Task 1 先行（其余端点依赖限流工具）。
- **验证失败排查方向**: 路由测试 401（mock session 缺失，参照既有 `route.test.ts` 的 auth mock 模式）；429 误触发（测试间限流状态共享——测试内用不同 identifier 或清空 store）。
- **允许修改的额外文件**: 无（日志 helper 沿用各 route 内既有 `log` 函数）。
- **暂停条件**: plan-01 契约与本功能实现出现字段级冲突且无法按架构 §7 判定归属时。
- **E2E 不适用说明**: 纯 API 层，red 阶段以路由契约测试先行；用户可观察行为由 plan-04～07 的 e2e 覆盖。
- **风险备注**: 409 code 统一会改变 PUT 冲突响应（`CONFLICT` → `TEMPLATE_NAME_CONFLICT`），需全局搜索确认无消费方依赖旧 code。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 请求体携带 `verificationStatus` | 400 拒绝（信任边界） | done |
| representative ≠ sourceGenerationTaskId（POST） | 400 `INVALID_REQUEST` | done |
| representative-result 目标不在相关集 | 400 | done |
| 越界数组/超长字段 | 400，错误信息不回显全文 | done |
| 未登录调用任一端点 | 401 `UNAUTHORIZED`（既有口径） | done |
| DB 不可用 | 503 `SERVICE_UNAVAILABLE` + retryable（既有识别逻辑沿用） | done |
| Memory 已被并发删除（PUT/representative） | 404，无部分写入 | done |
