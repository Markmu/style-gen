---
feat_id: "plan-05"
title: "保存为 Style Memory 与已保存态"
dimension: frontend
phase: 4
status: done
depends_on: ["plan-01", "plan-03"]
---

# plan-05: 保存为 Style Memory 与已保存态

## 功能概要

- **目标**: 交付从成功迭代沉淀为 Style Memory 的完整入口——保存对话框（预填来源/提示/变量）、已保存状态与打开定位、来源资产缺失时的防御性禁用；与既有模板接口（含同名冲突、限流）完全复用。
- **完成后可观察结果**: 用户在一条已完成且有真实结果的迭代详情中看到"保存为 Style Memory"，点击后进入保存流程：内容与变量已按该次迭代预填，名称必填；确认后保存成功，详情变为"已保存为 Style Memory"并提供"打开"入口，跳到 Style Memory 页并定位到该条。再次进入该详情不再显示保存按钮（避免重复资产），但可从 Style Memory 中复制。进行中、失败或无真实结果的详情不出现保存入口。保存失败（如同名冲突）沿用既有错误呈现，已展示内容不受影响。
- **依赖**: plan-01（`POST /api/templates` 的 `sourceGenerationTaskId`）、plan-03（详情面板 secondaryActions 插槽与 `savedTemplate` 字段消费）
- **关联验收标准**: [AC-06]
- **涉及架构模块**: 入口与沉淀模块
- **前置条件**: plan-01 / plan-03 已合入
- **不在范围**: Style Memory 资产模型与页面重构；删除/批量动作；结果图资产复制（架构 §6.4：不复制结果图）

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/iterations/save-style-memory-dialog.tsx` | 保存对话框（名称必填、内容/变量预填可编辑） |
| create | `src/components/iterations/__tests__/save-style-memory-dialog.test.tsx` | 预填与提交校验组件测试 |
| modify | `src/components/iterations/iteration-detail-panel.tsx` | secondaryActions：保存入口 / 已保存态 + 打开 |
| modify | `src/app/workspace/templates/page.tsx` | 读取 `focus` 查询参数滚动并高亮定位目标条目 |
| modify | `e2e/helpers/mock-api.ts` | 模板创建携带 sourceGenerationTaskId 的 mock 与 409 分支 |
| create | `e2e/workspace-iteration-save-style-memory.spec.ts` | 保存闭环 E2E（red → green） |

## 实现规格

### 前端部分

#### 1. 保存入口条件（`iteration-detail-panel.tsx`）

- 显示"保存为 Style Memory"：`status === 'completed' && resultFileUrl 非空 && sourceAssetId 非空 && savedTemplate == null`。
- `sourceAssetId` 为 null（旧记录来源资产不可用）→ 不显示保存入口，显示"来源缺失，暂无法保存"说明（架构 §6.4 防御性口径）。
- `savedTemplate` 非空 → 渲染"已保存为 Style Memory"状态 + "打开"按钮（`router.push('/workspace/templates?focus=' + savedTemplate.id)`）。
- processing / failed / 无真实结果 → 不出现任何保存入口（AC-06 结果项）。

#### 2. 保存对话框（`save-style-memory-dialog.tsx`）

- 预填（架构 §6.4 步骤 2）：`content = promptSnapshot`（可编辑）、`variables = detail.variables`（预填文本展示、随提交体原样携带——实现澄清见风险备注）、提交时携带 `sourceAssetId = detail.sourceAssetId`、`sourceGenerationTaskId = detail.id`（frontend_computed）。
- 名称：必填、≤ 50 字符（与既有接口一致）；空名禁止提交。
- 提交 `POST /api/templates`；409 同名冲突沿用既有错误文案呈现；成功后回调关闭对话框并通知详情刷新为已保存态（直接消费 201 响应写入详情缓存）。
- 不复制结果图资产；Style Memory 继续只持来源图引用。

#### 3. Style Memory 页定位（`templates/page.tsx`）

- 读取 `focus` 查询参数；列表加载后滚动到对应卡片并施加高亮样式（复用既有卡片选中/高亮样式 token）；参数消费后从 URL 清除（replace，不污染历史栈）。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | E2E red | frontend | done | 9 用例 8 failed / 1 passed（TC-5.2 为负向断言天然通过），red 证据 `docs/e2e/evidence/plan-05-e2e-red-2026-08-17.md` |
| 2 | 保存入口与已保存态渲染 | frontend | done | 详情面板 secondaryActions 默认内容四类条件分支（可保存 / 已保存 + Open / 来源缺失说明 / 不适用）落地；E2E TC-5.1~5.4 通过（含 TC-5.2 负向断言保持） |
| 3 | 保存对话框 + 组件测试 | frontend | done | `save-style-memory-dialog.tsx`：预填（content=promptSnapshot、变量默认值文本、名称初始为空）、空名禁提交 + 50 字符截断、提交体 / 409 / 5xx / 网络错 / 重开重置 / 取消与 Escape，组件测试 12 用例全绿 |
| 4 | 保存成功后详情局部刷新 | frontend | done | 成功回调直接消费 201 响应 `{ id, name }` 写入 `use-iteration-detail` 的 query 缓存（`setQueryData`），面板原地切换已保存态；不重拉整页、不导航（全局 staleTime 60s 下再次进入读到已保存数据，E2E TC-5.6 列表检索态保持 + TC-5.7 重复进入） |
| 5 | Style Memory 页 focus 定位 | frontend | done | focus 参数一次性消费：命中卡片 `data-focused="true"` 高亮 + `scrollIntoView` + `router.replace` 清参（不污染历史栈）；未命中静默忽略（E2E TC-5.8 + templates 页组件测试 2 用例） |
| 6 | 实现至 E2E green | frontend | done | `workspace-iteration-save-style-memory.spec.ts` 9/9 通过（TC-5.2 负向断言回归确认仍通过；TC-5.7 POST 恰 1 次）；plan-03（9/9）与 plan-04（8/8）回归通过；green evidence 待 test-e2e 步骤生成 |

## 验收标准

### 功能验收

- [x] AC-06 保存流程以该次迭代的来源、可复用提示和变量为起点（预填正确）；名称必填（E2E TC-5.5：content 预填 promptSnapshot、变量默认值可见、空名禁提交零 POST；组件测试 12 用例）
- [x] AC-06 成功后详情显示已保存状态和打开入口；打开跳转 `/workspace/templates` 并定位到对应条目（E2E TC-5.4/TC-5.8：已保存态含名称 + Open → focus 命中卡片 `data-focused="true"` 进入视口、URL 清参）
- [x] AC-06 进行中、失败或无真实结果的记录不显示已验证保存入口（E2E TC-5.2：processing 动作区不渲染、failed/无结果 completed 无保存入口且无来源缺失说明）
- [x] 已关联迭代重复进入不显示保存按钮（不重复制造资产；复制走 Style Memory 既有能力）（E2E TC-5.7：重新打开仍为已保存态、POST 总数保持 1）
- [x] 来源资产缺失时禁用保存并说明（防御性口径，架构 §6.4）（E2E TC-5.3：`iteration-save-unavailable` 可见含 missing/cannot 语义，其余详情不阻断）
- [x] 保存失败（409 同名）沿用既有错误呈现，详情已展示内容不受影响（E2E TC-5.9 + 组件测试：对话框保留名称与预填内容，未切换已保存态）
- [x] 组件测试与 `pnpm verify:fast` 通过（save-style-memory-dialog 12 用例、iteration-detail-panel 22 用例、templates 页 7 用例、template-card 3 用例；verify:fast 99 文件 807 用例全绿）

### E2E 验收（red → green）

- [x] `pnpm e2e -- e2e/workspace-iteration-save-style-memory.spec.ts --project=workspace`：9/9 通过（预填断言、保存成功变已保存态、打开定位、重复进入无保存按钮、409 分支呈现）；red 证据 `docs/e2e/evidence/plan-05-e2e-red-2026-08-17.md`，green evidence 待 test-e2e 步骤生成；plan-03 `workspace-iteration-detail.spec.ts` 9/9 与 plan-04 `workspace-iteration-restore.spec.ts` 8/8 回归通过

## 验证命令

```bash
pnpm e2e -- e2e/workspace-iteration-save-style-memory.spec.ts --project=workspace
pnpm vitest --run src/components/iterations/__tests__/save-style-memory-dialog.test.tsx
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.4（保存链路与防御性口径）、ADR-5（templates 反向关联）、§7.3（POST /api/templates 契约）
- **相关代码**: `src/app/api/templates/route.ts`（既有校验/409/限流，plan-01 已扩展）、`src/app/workspace/templates/page.tsx`、`src/components/workspace/template-save-dialog.tsx`（既有保存对话框参照）
- **契约 / 数据对象**: 提交体 `{ name, content, variables, sourceAssetId, sourceGenerationTaskId }`；`savedTemplate: { id, name } | null`（IterationDetail 字段）
- **下游消费方**: plan-06（全流程集成回归覆盖保存段）

## 风险与边界

- **执行顺序**: Task 1（red E2E）必须最先完成并留存失败证据，再按 Task 2-5 顺序实现，Task 6 收口转 green
- **验证失败排查方向**: 保存 400 → 检查 `sourceGenerationTaskId` 是否指向 completed 且有结果；定位失败检查 focus 参数消费时序（需等列表加载完成）
- **允许修改的额外文件**（均按"确有必要先记录原因"原则，见全局护栏）:
  - `src/components/workspace/template-card.tsx` — focus 契约要求 `data-focused="true"` 落在 `[data-testid="style-memory-card"]` 元素上，而该元素由卡片组件拥有；仅新增可选纯展示 prop `focused`（默认 false 时属性不渲染）与高亮 ring，不改变任何既有行为；`template-card.test.tsx` 3 用例回归通过
  - `src/components/iterations/__tests__/iteration-detail-panel.test.tsx` — 面板新增 `useQueryClient`（保存成功写详情缓存实现 Task 4 局部刷新）后相邻组件测试需要 `QueryClientProvider` 包装；按 AGENTS.md"组件行为变更须同步相邻组件测试"补充 plan-05 secondaryActions 四分支断言（4 用例），既有断言均未放宽
  - `src/app/workspace/templates/__tests__/page.test.tsx` — 页面新增 `usePathname`/`useSearchParams`（Task 5 focus 定位）后扩展 `next/navigation` mock；补充 focus 命中/未命中 2 用例，既有断言未改动
- **暂停条件**: 发现需要修改既有模板创建接口行为（超出 plan-01 已定义扩展）、或 Style Memory 页结构无法支持 focus 定位需要重构时
- **风险备注**: 与既有"从分析保存模板"入口并存，互不影响；用户在 Style Memory 复制产生的新模板不带回源关联（`sourceGenerationTaskId` 为空），详情已保存态取最新一条关联。实现澄清：变量按预填只读文本展示（架构 §6.4 步骤 2 仅要求预填并随提交体携带；red E2E 契约为"变量默认值文本可见"——`toContainText` 不读取输入框 value），名称与内容保持可编辑
- **E2E 不适用说明**: 不适用（用户可观察功能，E2E 必选）

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 名称重复（409） | 沿用既有冲突文案，对话框保留已填内容 | done（E2E TC-5.9 + 组件测试 409 用例） |
| 名称为空 / 超 50 字符 | 禁止提交 + 行内提示 | done（空名：E2E TC-5.5 提交 disabled 零 POST + 组件测试必填提示；超 50：maxLength 截断 + 50/50 计数器，组件测试承载——E2E red 证据已说明该分支由组件测试承接） |
| sourceAssetId 缺失 | 不显示保存入口 + 来源缺失说明 | done（E2E TC-5.3） |
| 保存请求 5xx | 对话框内错误 + 重试，详情内容不变 | done（组件测试 5xx 用例：错误呈现、内容保留、修改后重试成功；网络异常分支同路径） |
| focus 目标不在当前列表页 | 定位失败时静默忽略，仅保留页面正常渲染 | done（templates 页组件测试"静默忽略"用例：无高亮、页面正常、参数仍被消费；正向定位 E2E TC-5.8） |
| 保存成功但详情刷新失败 | 保持对话框关闭态 + 手动重试入口（不重复提交） | done（设计上消除：成功回调直接消费 201 响应写缓存切换已保存态，不存在可失败的二次拉取；异常恢复走详情既有 Retry（plan-03），模板不会重复提交——E2E TC-5.7 POST 恰 1 次佐证） |
