---
feat_id: "plan-01"
title: "数据层与契约扩展"
dimension: backend
phase: 1
status: done
depends_on: []
---

# plan-01: 数据层与契约扩展

## 功能概要

- **目标**: 把架构 §7 的数据契约落地：`templates` 表新增验证状态、代表结果引用与规则四元组列；修正 `generation_tasks.source_template_id` FK 为 `SET NULL` 并补索引；定义全部 TS 类型；扩展 repository 读写（含服务端状态派生、使用聚合与搜索谓词）。
- **完成后可观察结果**: 迁移执行后，存量 Memory 全部显示为"待验证"且规则数组为空；repository 层能按架构 §7.2 的 DTO 完成创建（状态派生）、列表（搜索/筛选/聚合联查）、详情（组装+防御降级）、编辑（规则变更回退）、复制（不携带验证字段）与代表结果原子更新；删除一条被 Iteration 引用的 Memory 时数据库不再阻断、引用自动置空。API 路由尚未接入（plan-02），本功能通过 repository 测试与本地迁移演练验证。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-07, AC-09]
- **涉及架构模块**: ① 数据与契约层（schema / 迁移 / 类型 / repository）
- **前置条件**: 本地 PostgreSQL 运行（`pnpm db:up`）；架构文档 §7.2、§6.1、§6.4 算法口径已定。
- **不在范围**: API 路由行为与请求校验（plan-02）；任何前端改动；既有 `POST /api/templates` 调用方适配。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/db/schema.ts` | templates 新列 + CHECK + 代表结果 FK；generation_tasks FK 改 SET NULL + 新索引 |
| create | `drizzle/0005_*.sql` | `pnpm db:generate` 产出（文件名以工具输出为准），含关联 meta 快照更新 |
| modify | `src/types/models.ts` | 新增验证状态与 §7.2 全部 DTO 类型 |
| create | `src/lib/style-memory-rules.ts` | 规则集合规范化比较纯函数（服务端回退判定与前端提示共用，单一实现） |
| modify | `src/lib/repositories/template-repository.ts` | 扩展既有写函数 + 新增读/代表结果函数 |
| modify | `src/lib/repositories/__tests__/template-repository.test.ts` | 覆盖新行为与负向用例 |
| create | `src/lib/__tests__/style-memory-rules.test.ts` | 规范化比较函数测试 |

## 实现规格

### 后端部分

#### 1. schema 扩展（`src/lib/db/schema.ts`）

`templates` 表新增：

- `verificationStatus` → `verification_status varchar(20) NOT NULL DEFAULT 'pending_verification'`，CHECK 约束 `IN ('user_verified', 'pending_verification')`
- `description text`（可空）
- `retainedRules` / `negativeConstraints` / `styleTokens` / `enhancementHints` → 四个 `text[] NOT NULL DEFAULT '{}'` 列
- `representativeGenerationTaskId` → `representative_generation_task_id varchar(26)`，FK → `generation_tasks.id ON DELETE SET NULL`；循环引用用 `AnyPgColumn` 注解（同表内 `sourceGenerationTaskId` 既有写法）

`generation_tasks` 表修改：

- `sourceTemplateId` FK 由 `NO ACTION` 重建为 `ON DELETE SET NULL`（drizzle 定义改动 + 迁移重建约束）
- 新增索引 `idx_generation_tasks_source_template`（单列 `source_template_id`，支撑使用聚合与候选查询）

#### 2. 迁移生成与复核（`drizzle/0005_*.sql`）

1. `pnpm db:generate` 生成后人工逐条复核 SQL：
   - 新列默认值使存量行自动回填 `pending_verification` 与空数组（不得出现破坏性 DROP）
   - FK 重建语句：先 DROP 旧约束 `generation_tasks_source_template_id_templates_id_fk` 再 ADD `... ON DELETE SET NULL`
   - CHECK、索引语句齐全
2. `pnpm db:push` 应用成功；`pnpm db:reset` 后重新应用成功（两轮演练，记录输出为证据）。

#### 3. 类型定义（`src/types/models.ts`）

按架构 §7.2 原样落地：`TemplateVerificationStatus`、`StyleMemoryRecord`、`StyleMemoryListItem`、`StyleMemoryDetail`、`RepresentativeCandidate`，以及 plan-02 将消费的请求类型 `SaveStyleMemoryRequest`、`UpdateStyleMemoryRequest`（字段与架构 §7.3 请求体一致，均不含 `verificationStatus`）。日期字段在 DTO 中为 ISO 字符串。

#### 4. 规则集合比较纯函数（`src/lib/style-memory-rules.ts`）

架构 §6.4 回退判定算法的唯一实现，供 repository（服务端判定）与 plan-05（前端保存前提示）共用：

```ts
export function normalizeRuleArray(rules: string[]): string[] {
  // 逐元素 trim，过滤空串，按字典序排序（顺序无关的集合语义）
}
export function ruleSetsChanged(previous: string[], next: string[]): boolean {
  // normalizeRuleArray 后逐元素深比较（长度不同即 changed）
}
```

#### 5. repository 扩展（`template-repository.ts`）

沿用既有函数名扩展，不做更名（架构 ADR-8）：

- **`createTemplate`**：入参增加 `description`、四组规则数组、`representativeGenerationTaskId`。状态派生：入参 representative 非空 → `'user_verified'`，否则 `'pending_verification'`（调用方 API 层已校验 representative 合法性，repository 不重复查任务表）。
- **`findAllByUserId` 重写为列表联查**（架构 §6.1）：
  - WHERE：`user_id` + 可选 `verification_status`（白名单 `user_verified | pending_verification`）+ 可选 search 谓词
  - search 谓词（单子串 ILIKE）：`name` OR `description` OR `array_to_string(retained_rules,' ')` OR `array_to_string(negative_constraints,' ')` OR `array_to_string(style_tokens,' ')` OR `array_to_string(enhancement_hints,' ')` OR 变量子查询 `(SELECT string_agg(coalesce(v->>'label', v->>'name'), ' ') FROM jsonb_array_elements(variables) v)`
  - 聚合：`LEFT JOIN LATERAL (SELECT max(created_at) AS last_used, count(*) AS derived_count FROM generation_tasks WHERE source_template_id = templates.id)`
  - 代表结果图：`LEFT JOIN generation_tasks rep ON rep.id = representative_generation_task_id` + `LEFT JOIN assets ra ON ra.id = rep.result_asset_id` 取 `ra.file_url`
  - 排序：`COALESCE(last_used, updated_at) DESC, id DESC`；游标 = 末条 `(sortTs, id)` 编码串，取回时解码为双键比较
  - 返回 `StyleMemoryListItem[]`（`retainedRulesPreview` 取前 2 条）
- **新增 `findStyleMemoryDetail(id, userId)`**：组装 `StyleMemoryDetail`（来源资产 URL、来源迭代 `{id, createdAt}`、代表结果 `{iterationId, imageUrl, createdAt}`、usage）；**读时防御降级**：`verification_status='user_verified'` 且 representative 引用为空 → DTO 返回 `pending_verification`。
- **`updateTemplate`**：入参增加 `description` / `retainedRules` / `negativeConstraints`；加载现存行后用 `ruleSetsChanged` 判定，任一集合变化 → 写 `verification_status='pending_verification'`（代表结果引用保留不清除）。
- **`duplicateTemplate`**：复制 `content` / `variables` / `description` / 四组规则 / `sourceAssetId` / `sourceImageUrl` / `sourceGenerationTaskId`（后三项中 description 与 sourceGenerationTaskId 为**新增复制项**，现状不复制）；**不复制** `representativeGenerationTaskId`；`verificationStatus` 固定 `'pending_verification'`；名称 `"(copy)"` 去重沿用既有算法。
- **新增 `setRepresentativeResult(templateId, userId, generationTaskId)`**：单条 UPDATE 原子写 `representative_generation_task_id` + `verification_status='user_verified'`；返回更新后记录。
- **新增 `listRepresentativeCandidates(templateId, userId, cursor?, limit?)`**：相关集 SQL（架构 §6.4）：`generation_tasks.source_template_id = :templateId OR generation_tasks.id = (SELECT source_generation_task_id FROM templates WHERE id = :templateId)`，且 `status='completed'` 且 `result_asset_id IS NOT NULL`，JOIN assets 取结果图 URL，`created_at DESC` 游标分页，条目映射为 `RepresentativeCandidate`（promptSummary 截断 120 字符，服务端口径）。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | schema.ts 列/FK/索引定义 | backend | done | §实现规格 1 |
| 2 | db:generate 生成迁移并复核 SQL | backend | done | 逐条核对默认值回填、FK 重建、CHECK、索引 |
| 3 | db:push + db:reset 双演练 | backend | done | 两轮成功输出留存为迁移证据 |
| 4 | types/models.ts 新类型 | backend | done | §7.2 DTO + 请求类型 |
| 5 | style-memory-rules.ts 纯函数 + 测试 | backend | done | normalize/ruleSetsChanged，含 trim、空串、改序、增删用例 |
| 6 | repository 写路径扩展 | backend | done | create 派生 / update 回退 / duplicate 复制边界 |
| 7 | repository 读路径新增 | backend | done | 列表联查 / 详情组装+防御降级 / 候选查询 |
| 8 | repository 测试补齐 | backend | done | 覆盖下方验收矩阵全部场景 |

## 验收标准

### 后端验收

- [x] AC-07 迁移后删除一条被 ≥ 1 个 Iteration 引用的 Memory：删除成功且对应 `generation_tasks.source_template_id` 为 NULL、行保留（db:reset 演练 + repository 测试双证据）
- [x] AC-09 存量行全部 `pending_verification`、规则数组默认空、`description` 与 representative 为 NULL（迁移后断言）
- [x] AC-01 列表查询返回 `verificationStatus` / `retainedRulesPreview`（前 2 条）/ `representativeImageUrl` / `lastUsedAt`（无使用为 null）（测试断言）
- [x] 状态派生矩阵测试通过：创建带 representative → `user_verified`；不带 → `pending_verification`；`setRepresentativeResult` → `user_verified`；update 中 `ruleSetsChanged` 任一为真 → 回退 `pending_verification`；仅改序/trim 差异 → 不回退
- [x] duplicate 复制边界测试：规则/说明/来源迭代被复制，representative 不被复制，状态为 `pending_verification`
- [x] 详情读时防御降级：手工构造 `user_verified` + 空 representative 的行，DTO 返回 `pending_verification`
- [x] 搜索谓词测试：规则词、token 词、变量名、变量 label、description 命中；变量 defaultValue 内容与 JSON 键名（如 `name`、`defaultValue`）不产生命中
- [x] `pnpm type-check && pnpm vitest --run src/lib/repositories/__tests__/template-repository.test.ts src/lib/__tests__/style-memory-rules.test.ts` 通过

### 契约对接验收

- [x] `SaveStyleMemoryRequest` / `UpdateStyleMemoryRequest` 不含 `verificationStatus` 字段（供 plan-02 校验使用）

## 验证命令

```bash
pnpm db:up
pnpm db:generate          # 生成 0005 迁移
pnpm db:push && pnpm db:reset   # 双演练（reset 后需重新 db:push）
pnpm vitest --run src/lib/repositories/__tests__/template-repository.test.ts src/lib/__tests__/style-memory-rules.test.ts
pnpm type-check
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §7.2（Schema）、§7.4（写点矩阵）、§6.1（列表 SQL 算法）、§6.4（回退判定与相关集定义）、§3.3（状态机不变式）、ADR-1/2/3/4、§8.3（CHECK 与输入上限的分工：上限校验在 API 层，本层只落约束）
- **相关代码**: `src/lib/db/schema.ts`（`sourceGenerationTaskId` 的 AnyPgColumn 循环引用写法照抄）、`src/lib/repositories/generation-task-repository.ts`（`linkTemplateToGenerationTask` 既有行为不变）
- **契约 / 数据对象**: `StyleMemoryRecord` / `StyleMemoryListItem` / `StyleMemoryDetail` / `RepresentativeCandidate` / `TemplateVerificationStatus`
- **下游消费方**: plan-02（全部 API 路由直接调用本层函数与类型）；plan-05（导入 `style-memory-rules.ts` 做客户端同口径提示）

## 风险与边界

- **执行顺序**: 按 Task 列表顺序执行；Task 2/3 必须在 Task 6/7 之前（repository 依赖新列存在）。
- **验证失败排查方向**: `pnpm db:logs`（PostgreSQL 是否就绪）；迁移 journal 冲突（`drizzle/meta/_journal.json`）；repository 测试若连库失败先确认 `DATABASE_URL` 与 `db:push` 已应用 0005。
- **允许修改的额外文件**: `drizzle/meta/`（db:generate 自动产物）；`src/lib/db/index.ts` 仅在导出需要时。
- **暂停条件**: 迁移在 `db:reset` 演练中连续失败 2 次；或 db:generate 产出含破坏性 DROP 语句。
- **E2E 不适用说明**: 纯数据层功能，无用户可观察界面；red 阶段以 repository/纯函数测试先行（先写测试看到失败再实现），用户可观察行为由 plan-04～07 的 e2e 覆盖。
- **风险备注**: FK 重建在低峰执行（本地开发无影响）；ILIKE 谓词性能依赖单用户小数据量（架构 §8.6 已声明不做全文索引）。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 存量行无规则数据 | 默认空数组，详情分区显示"待补充"由 plan-05 处理 | done |
| representative 指向的任务被删除（防御） | FK `SET NULL` + 读时防御降级为 `pending_verification` | done |
| 规则数组仅顺序不同 / 仅空白差异 | `ruleSetsChanged` 为 false，不回退状态 | done |
| 游标跨页时同一 sortTs 多行 | 双键游标 `(sortTs, id)` 保证稳定排序 | done |
| 上限越界数组（>12 条规则等） | API 层拒绝（plan-02），repository 不重复校验 | done |
