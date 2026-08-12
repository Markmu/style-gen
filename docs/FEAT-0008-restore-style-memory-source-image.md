---
workflow_type: 'new-feature'
spec_id: 'FEAT-0008'
title: '恢复 Style Memory 的分析来源图'
type: 'bugfix'
created: '2026-08-12'
status: 'done'
context:
  - 'PRODUCT.md'
  - 'docs/design/DESIGN.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** Style Memory `piggy fashion clothes template` 没有 `source_asset_id/source_image_url`，因此卡片显示 No source preview；其原分析图片已保存在 assets，且图片地址可正常访问。

**方案：** 保存 Memory 时，以用户拥有的 `sourceAnalysisTaskId` 在服务端恢复分析任务的 source asset 与图片 URL，并对已精确匹配到原分析任务的唯一历史记录做受控回填。

## 边界

**必须：** Memory 图片只能取该 Memory 对应分析任务的 reference asset；服务端验证 task、asset、user 三者归属并以数据库中的 `assets.file_url` 为准；保留现有显式 `sourceAssetId` 保存路径。

**先问：** 若将来存在无法通过 task 关联或内容精确匹配的历史 Memory，必须人工确认来源后再回填，不按用户、时间或名称猜测。

**禁止：** 不把生成结果图或客户端任意 URL 当作分析来源图；不重复保存图片二进制；不新增已有的图片 URL 字段或修改 `/api/analysis` 的 provider 流程；不覆盖无确定关联证据的历史数据。

## 需求变更

### 修改

- **REQ-1**: [`POST /api/templates` 仅记录 `sourceAnalysisTaskId` 是否存在] → [接口用该 task 派生并持久化 `templates.source_asset_id/source_image_url`]。
- **REQ-2**: [task 与显式 asset 可不一致且缺少服务端约束] → [task 不存在、越权、source asset 非 reference，或 task/显式 asset 冲突时返回 400，不创建 Memory]。
- **REQ-3**: [已确认来源的历史 Memory 保持 Prompt-only] → [仅对内容与分析模板完全相等的记录 `01KT20MHAQDDDJBVBBKGKJKK93` 回填已确认的 source asset 与其数据库 URL]。

</frozen-after-approval>

## 代码地图

- `src/app/api/analysis/route.ts` -- 当前已通过 `upsertAsset` 保存上传图片，并让 analysis task 引用 asset；本次只保留回归证据，不修改流程。
- `src/app/api/templates/route.ts` -- Memory 创建边界；当前接收 `sourceAnalysisTaskId` 但未解析，应在此从分析任务派生来源图。
- `src/lib/repositories/analysis-task-repository.ts`、`src/lib/repositories/asset-repository.ts` -- 按当前用户查询 task、读取已保存 reference asset 的服务端数据源。
- `src/app/api/templates/__tests__/route.test.ts` -- 覆盖 task 派生、归属校验、冲突拒绝和旧显式 asset 路径。
- `src/app/api/analysis/__tests__/route.test.ts` -- 证明分析提交仍保存 `assets.file_url` 与 `analysis_tasks.source_asset_id`。
- `templates`、`analysis_tasks`、`assets` 本地数据库记录 -- 对已通过 content 完全相等确认来源的唯一历史 Memory 做一次性回填和查询验证。

## 任务清单

- [x] `src/app/api/templates/route.ts` -- 让 `sourceAnalysisTaskId` 成为服务端来源解析依据，验证 task/asset/user/type 及显式 asset 一致性后写入来源字段。
- [x] `src/app/api/templates/__tests__/route.test.ts` -- 增加仅传 task 即成功派生、非法/越权 task、非 reference asset、task/asset 冲突与现有兼容路径测试。
- [x] 本地 `templates` 数据 -- 在 content 与 analysis template 再次完全匹配的保护条件下，回填已确认历史行并验证列表数据与图片地址。

## 验证命令

- `pnpm vitest --run src/app/api/analysis/__tests__/route.test.ts src/app/api/templates/__tests__/route.test.ts` -- 验证分析图片持久化与 Memory 服务端来源解析。
- `pnpm type-check` -- 验证 repository 调用和请求处理类型。
- `pnpm workflow:check && pnpm test:workflow` -- 验证 standalone spec 与项目工作流契约。
- `pnpm verify:fast` -- 执行最终仓库快速门禁。
- `docker compose exec -T db psql -U user -d style_gen -P pager=off -c "SELECT source_asset_id, source_image_url FROM templates WHERE id = '01KT20MHAQDDDJBVBBKGKJKK93';"` -- 验证目标历史 Memory 已关联分析来源图。

## 验收标准

- [x] Given 用户拥有的 analysis task 已关联 reference asset, when 客户端只携带 `sourceAnalysisTaskId` 创建 Memory, then 服务端把该 asset ID 和数据库中的 file URL 写入模板并返回 Source-backed Memory。
- [x] Given 请求中的 analysis task 不存在、属于其他用户或未关联合法 reference asset, when 创建 Memory, then 接口返回 400 且不写入模板。
- [x] Given 请求同时携带 task 与不同的显式 source asset, when 创建 Memory, then 接口返回 400，避免错图关联。
- [x] Given 未携带 analysis task 但携带用户拥有的 reference asset, when 创建 Memory, then 现有模板保存行为保持可用并继续以数据库 URL 覆盖客户端 URL。
- [x] Given 历史 Memory 内容与目标 analysis template 完全相等, when 执行受控回填, then 该 Memory 获得匹配 task 的 source asset 和可返回 200 的分析图片 URL；保护条件不满足时不更新任何行。

## 验证记录

- Red: `pnpm vitest --run src/app/api/templates/__tests__/route.test.ts` -- 预期失败（5 failed / 3 passed）；现有接口未查询 `sourceAnalysisTaskId`，未拒绝 task/asset 冲突或缺少数据库来源的客户端 URL。
- Green: `pnpm vitest --run src/app/api/analysis/__tests__/route.test.ts src/app/api/templates/__tests__/route.test.ts` -- 通过（2 files，28 tests）；覆盖分析图片持久化、task 派生、task/asset/user/type 校验及显式 asset 兼容路径。
- Green: `pnpm type-check` -- 通过。
- Data: 受控 SQL 在固定 template/task、同用户、reference asset、content 完全相等且原来源为空的条件下更新 1 行；回填后 `source_asset_id=01KT1ZGX5QEBRFZDMS6ABH61BY`，`source_image_url` 非空，地址 HEAD 返回 HTTP 200。
- Regression: `pnpm verify:fast` -- 通过；工作流检查通过，TypeScript 通过，ESLint 0 errors（15 warnings），Vitest 92 files / 693 tests 通过。
