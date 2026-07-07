---
feat_id: "plan-05"
title: "Iteration Memory 与保存记忆入口"
dimension: frontend
phase: 3
status: done
depends_on: ["plan-04"]
---

# plan-05: Iteration Memory 与保存记忆入口

## 功能概要

- **目标**: 将近期生成历史表达为 Iteration Memory，保留现有 generation history API 与 restore 流程，同时让用户能比较、恢复、继续生成变体，并把满意方向保存为 Style Memory。
- **完成后可观察结果**: 用户完成生成后，Recent iterations 区域出现最近结果缩略图和“比较、恢复、复用”的明确提示。点击历史项会打开详情弹层，展示结果图、prompt snapshot、negative prompt、参数和恢复行动；确认恢复后，Workspace 回到可编辑状态并保留恢复来的 recipe、prompt、result 和参数。没有历史时，区域不是空白，而是说明后续 renders 会作为 visual evidence 出现。用户可以从恢复后的方向继续生成，也可以通过现有 TemplateSaveDialog 保存为 Style Memory，且保存时携带 source asset/image 和 variables。
- **依赖**: plan-04（Render Dock readiness 与生成恢复）
- **关联验收标准**: [AC-02, AC-05, AC-08]
- **涉及架构模块**: WorkspaceExperience、IterationMemory、StatePresenter/StatusLanguage
- **前置条件**: plan-04 已完成 Render Dock 和生成失败恢复；现有 `useHistoryList`、`useHistoryRestore`、`HistoryStrip`、`HistoryDetailDialog`、`TemplateSaveDialog` 可用。
- **不在范围**: 新增 history API、独立比较 API、后端模板字段、全量历史页、批量管理历史记录。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 接入 Iteration Memory 空态、restore、继续生成和保存 Style Memory 上下文 |
| modify | `src/components/workspace/history-strip.tsx` | 表达为 Recent iterations / Iteration Memory，补齐空态教学和比较入口 |
| modify | `src/components/workspace/history-detail-dialog.tsx` | 展示 result/prompt/negative/params/restore/save/continue actions |
| modify | `src/hooks/use-history-list.ts` | 保持 API contract，必要时暴露 loading/error/empty 状态供 UI 区分 |
| modify | `src/hooks/use-history-restore.ts` | 保持 restore contract，确保错误不清空 workspace |
| modify | `src/components/workspace/template-save-dialog.tsx` | 确认从 restored/history context 保存时 sourceAssetId/sourceImageUrl/variables 可传入 |
| modify | `src/components/workspace/__tests__/history-strip.test.tsx` | 覆盖空态、populated、选择、比较入口 |
| modify | `src/components/workspace/__tests__/history-detail-dialog.test.tsx` | 覆盖恢复、保存、继续生成、失败文案 |
| create | `src/hooks/__tests__/use-history-restore.test.tsx` | 新建 hook 测试，覆盖 restore 成功/失败不清空上下文 |
| create | `e2e/workspace-ai-first-iteration-memory.spec.ts` | Iteration Memory targeted E2E |

### Review remediation 补充文件清单（2026-07-06）

task-review B-01 指出 TC-5.5 只在 mock payload 下成立；用户已明确授权在不新增后端表、字段或新 API 的前提下，对现有 `GET /api/generation/[id]` completed detail response 做最小 contract 扩展，从既有 `analysis_tasks.source_asset_id`、source reference asset `file_url` 和 `analysis_tasks.analysis_template_variables` 派生 restored source context。

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/repositories/generation-task-repository.ts` | `findByIdWithRecipe` 读取 sourceAssetId/sourceImageUrl 和 analysisTemplateVariables，返回 variables/analysisTemplateVariables |
| modify | `src/lib/repositories/__tests__/generation-task-repository.test.ts` | 覆盖 repository completed detail 的真实 source context 与 variables contract |
| modify | `src/app/api/generation/[id]/route.ts` | completed detail JSON 转发 sourceAssetId/sourceImageUrl/variables/analysisTemplateVariables |
| modify | `src/app/api/generation/[id]/__tests__/route.test.ts` | 覆盖 route completed detail response 的 restored source context 字段 |
| modify | `e2e/workspace-ai-first-iteration-memory.spec.ts` | 让 targeted E2E mock detail 与真实 completed detail contract 对齐 |

## 实现规格

### 前端部分

#### 1. HistoryStrip -> Iteration Memory

`src/components/workspace/history-strip.tsx`：

- 保留 `aria-label="Recent iterations"`，可在标题/说明中同时表达 `Iteration Memory`。
- 有历史时展示最多 20 条，缩略图、序号、createdAt 或相对时间可见。
- 无历史时显示教学空态：“renders will appear here as visual evidence”，并提示生成后可比较、恢复、复用。
- Compare 按钮首版可打开当前详情/轻量对照，不新增比较 API；无历史时 disabled 且有原因。
- 组件不自行请求 API，只消费 props。

#### 2. HistoryDetailDialog

`src/components/workspace/history-detail-dialog.tsx`：

- 展示结果图、prompt snapshot、negative prompt、params、analysisTaskId 辅助信息。
- 操作：Restore to workspace、Generate variation/Continue editing、Save as Style Memory、Close。
- Restore 调用现有 `onRestore(id)`；保存入口回调给 workspace page 使用 TemplateSaveDialog。
- 弹层失败或关闭不改变原 history 记录。

#### 3. Workspace restore 接线

在 `src/app/workspace/page.tsx`：

- `restoreHistory(id)` 成功后继续调用 `ws.enterHistoryRestored`，并同步 `resolvedPromptText`、`generationParams`、当前 variables。
- 进入 `history_restored` 后 Render Dock readiness 能继续基于 restored prompt 生成。
- 保存 Style Memory 时复用 `TemplateSaveDialog`，传入 `sourceAnalysisTaskId`、`sourceAssetId`、`sourceImageUrl`、当前 variables 和 prompt content。
- generation complete 后 invalidate `generation-history`，历史 strip 自动刷新。

#### 4. 错误与降级

- history API 401 或失败时，显示 StatePresenter/inline status：authRequired 或 failedRecoverable。
- restore 失败不清空当前工作台，保留用户正在编辑的 prompt 和 reference。
- 无历史与 API error 区分展示，不能把失败误当空列表。

#### 5. E2E red/green

`e2e/workspace-ai-first-iteration-memory.spec.ts` 覆盖：

- 生成完成后 history strip 刷新并出现缩略图。
- 无历史时显示教学空态。
- 点击历史项打开详情，展示 prompt/params。
- Restore 后 Workspace Prompt/Style Intelligence/Render Dock 同步恢复。
- 从 restored state 保存 Style Memory 打开 TemplateSaveDialog，并携带 reference/source image 上下文。

### Review remediation：generation detail response contract

- 不新增后端表、字段或新 API；只扩展现有 `GET /api/generation/[id]` 在 `completed` detail 分支的 JSON。
- `findByIdWithRecipe` 从既有 `generation_tasks.analysis_task_id -> analysis_tasks.id -> analysis_tasks.source_asset_id -> assets.id` 关系派生 `sourceAssetId/sourceImageUrl`。
- `variables` 与 `analysisTemplateVariables` 均来自既有 `analysis_tasks.analysis_template_variables`，供 `useHistoryRestore` 保存 Style Memory 时消费。
- E2E mock 必须包含与真实 completed detail response 同名的 source context/variables 字段，避免测试比真实 contract 更乐观。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `workspace-ai-first-iteration-memory.spec.ts` red 用例和证据 | frontend | done | 证据已写入 `docs/e2e/evidence/plan-05-e2e-red-20260706.md` |
| 2 | 改造 HistoryStrip 空态、populated 态和比较入口 | frontend | done | 不新增 history API；Compare 空态有禁用原因 |
| 3 | 扩展 HistoryDetailDialog 操作和恢复/保存文案 | frontend | done | Restore/Generate variation/Save/Close 已提供 |
| 4 | 在 workspace page 接入 restored context 与保存 Style Memory | frontend | done | 复用 TemplateSaveDialog，保存携带 restored source image linkage |
| 5 | 调整 history hooks 状态暴露并创建 restore 错误处理测试 | frontend | done | 保持 API contract；已新建 `src/hooks/__tests__/use-history-restore.test.tsx` |
| 6 | 更新 history strip/dialog/hook 组件测试 | frontend | done | 覆盖空态、失败、恢复、保存入口 |
| 7 | 运行 red/green E2E、单元测试、类型检查和构建 | frontend | done | 指定命令均通过；green 证据由后续 `test-e2e` 步骤写入 |

## 验收标准

### Iteration Memory 验收

- [x] AC-02 Workspace 页面包含近期迭代区域，信息层级与 Reference/Evidence/Render 主链路一致。
- [x] AC-05 生成完成后 `generation-history` 刷新，Recent iterations 展示最新结果缩略图。
- [x] AC-05 点击历史项打开详情弹层，可查看结果、prompt、negative prompt 和参数。
- [x] AC-05 Restore 后调用 `enterHistoryRestored`，Workspace 回填 recipe/prompt/result/params，并可继续生成。
- [x] AC-05 用户可从 restored 或 generation_ready 状态打开 TemplateSaveDialog 保存 Style Memory，且 source image/context 不丢失。
- [x] AC-08 history API 失败或未登录时显示可恢复/登录状态，不把失败误显示为空历史。
- [x] E2E-TDD：`e2e/workspace-ai-first-iteration-memory.spec.ts` 已先 red 后 green；red 证据为 `docs/e2e/evidence/plan-05-e2e-red-20260706.md`，green 证据由后续 `test-e2e` 步骤写入。

### 性能验收（架构 §8.1 目标）

- [x] AC-05 history 列表最多展示最近 20 条，避免一次性渲染过多大图（架构 §8.1）。

### 降级回归验收（架构 §8.2）

- [x] AC-08 L4 未登录、L5 无历史、L3 restore 失败在 Iteration Memory 中区分显示，且不清空当前 workspace context。

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/history-strip.test.tsx src/components/workspace/__tests__/history-detail-dialog.test.tsx src/hooks/__tests__/use-history-restore.test.tsx
pnpm e2e -- e2e/workspace-ai-first-iteration-memory.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-05/AC-08、§3.2 历史恢复/保存风格记忆、§6.5、§7.3 generation history/template API、§8.1、§8.2。
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/history-strip.tsx`、`src/components/workspace/history-detail-dialog.tsx`、`src/hooks/use-history-list.ts`、`src/hooks/use-history-restore.ts`、`src/components/workspace/template-save-dialog.tsx`。
- **契约 / 数据对象**: `GenerationHistoryItem`、`RestoredData`、`HistoryDetail`、`TemplateVariable`、`PromptTemplate`。
- **下游消费方**: plan-08 汇总 history restore targeted E2E 和视觉 QA。

## 风险与边界

- **执行顺序**: 先 red E2E，再改 history strip/dialog，再接 workspace restore/save，最后测试。
- **验证失败排查方向**: 检查 React Query key `generation-history`、restore detail response、`enterHistoryRestored` 写回字段、TemplateSaveDialog source fields。
- **允许修改的额外文件**: 常规开发无；2026-07-06 failed review remediation 已获用户授权，补充文件清单中的 repository/route/test/E2E contract 文件可修改。
- **暂停条件**: 若需要新增 history compare API、超出上述最小 completed detail response 扩展、或新增 style memory 后端字段，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能为生成后用户可观察闭环。
- **风险备注**: 首版比较可使用现有详情弹层或轻量对照，不应引入复杂比较系统。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| history 为空 | 显示教学空态，说明 renders 会出现在这里 | done |
| history API 401 | 显示 authRequired，提供登录/返回工作台 | done |
| restore 失败 | 保留当前 workspace，显示 failedRecoverable | done |
| restored prompt 有变量 | 同步 variables 和 resolved prompt，Render Dock 重新判断 readiness | done |
| 保存 restored style memory | TemplateSaveDialog 携带 sourceAssetId/sourceImageUrl/variables | done |
