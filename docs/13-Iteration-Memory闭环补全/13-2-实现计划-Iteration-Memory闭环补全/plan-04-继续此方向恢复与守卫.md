---
feat_id: "plan-04"
title: "继续此方向恢复与守卫"
dimension: frontend
phase: 4
status: done
depends_on: ["plan-03"]
---

# plan-04: 继续此方向恢复与守卫

## 功能概要

- **目标**: 交付"继续此方向 / 修正并继续"的完整恢复链路——守卫纯函数（三豁免）、替换确认对话框、恢复载荷应用与工作台接线、应用后同步 flush 再导航（架构 §6.3 原则）、恢复后再次生成形成新 Iteration。
- **完成后可观察结果**: 用户在已完成详情点击"继续此方向"（失败详情为"修正并继续"）后：若当前工作台为空、已是同一 Iteration 或内容与目标一致，直接回到工作台且上下文恢复为该次迭代快照、原结果作为上一轮保留可见；若工作台存在不同的未完成内容，先弹出替换确认，展示当前方向与目标方向的提示摘要，取消则停留详情且两侧零变更，确认才切换。恢复动作不触发任何生成请求；用户修改并主动生成后产生一条新的 Iteration，原记录不变。
- **依赖**: plan-03（详情面板动作插槽与 IterationDetail 契约）
- **关联验收标准**: [AC-02, AC-04, AC-05]
- **涉及架构模块**: 恢复与视图状态（恢复 hook 与守卫）、Iteration Memory 页面与组件（动作接线）
- **前置条件**: plan-03 已合入；`use-workspace-state` 的 sessionStorage 持久化通道可复用
- **不在范围**: 保存为 Style Memory（plan-05）；近期条/导航入口（plan-06）；任何服务端新写路径（ADR-4：恢复为纯客户端动作）

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/iterations/restore-guard.ts` | 守卫纯函数 `computeRestoreGuard` |
| create | `src/lib/iterations/__tests__/restore-guard.test.ts` | 三豁免 + 确认分支单测 |
| create | `src/hooks/use-iteration-restore.ts` | 恢复载荷组装、应用、flush 后导航 |
| create | `src/components/iterations/replace-confirm-dialog.tsx` | 替换确认对话框 |
| modify | `src/components/iterations/iteration-detail-panel.tsx` | 填充 primaryActions（继续此方向 / 修正并继续） |
| modify | `src/app/workspace/page.tsx` | 恢复消费接线（currentIterationId、currentTemplateId、上一轮结果）与生成请求体携带 sourceTemplateId |
| modify | `src/hooks/use-workspace-state.ts` | 暴露同步 flush 能力（覆盖防抖窗口） |
| create | `src/components/iterations/__tests__/replace-confirm-dialog.test.tsx` | 对话框交互组件测试 |
| create | `e2e/workspace-iteration-restore.spec.ts` | 恢复与守卫 E2E（red → green） |

## 实现规格

### 前端部分

#### 1. 守卫纯函数（`restore-guard.ts`）

- `computeRestoreGuard(current: WorkspaceSnapshot | null, target: IterationDetail): { action: 'direct' | 'confirm'; reason: string }`。
- 三豁免（架构 §6.3 步骤 2，任一成立返回 `direct`）：① `current` 为空（工作台无内容）；② `current.currentIterationId === target.id`（已是同一 Iteration）；③ 内容一致——`promptText`、`negativePromptText`、`params.aspectRatio`、`params.quality` 逐字段相等。
- 其余返回 `confirm`（reason 供对话框与埋点使用）。纯函数、无副作用，单测覆盖四类分支。

#### 2. 恢复 hook（`use-iteration-restore.ts`）

- 载荷组装：`IterationDetail` → 工作台状态字段（与 `use-history-restore` 的 `RestoredData` 对齐并扩展）：`promptSnapshot` → 提示文本、`negativePromptSnapshot` → 排除项、`params` → 输出参数、`variables` → 当前变量、`recipe` → 配方视图、`sourceImageUrl` / `sourceAssetId` / `analysisTaskId` → 来源上下文、`resultFileUrl` → 上一轮结果；并写入 `currentIterationId = target.id`。
- 应用流程：守卫判定 → `direct` 直接应用；`confirm` 等待对话框确认。应用后调用 `use-workspace-state` 的同步 flush（架构 §6.3 原则：防抖窗口内必须显式落盘），再 `router.push('/workspace')`。
- 幂等：对同一目标重复恢复不产生额外副作用。

#### 3. 替换确认对话框（`replace-confirm-dialog.tsx`）

- 触发：守卫返回 `confirm`。内容：标题 + 说明（继续后工作区将切换到所选 Iteration；当前内容不会作为新 Iteration 保存）+ 两个摘要槽（当前方向 `{当前提示摘要}` / 将切换为 `{所选提示摘要}`）。
- 回调：`取消` → 关闭对话框，详情与工作台零变更（停留详情）；`继续切换` → 应用载荷 + flush + 导航。

#### 4. 详情动作与工作台接线

- `iteration-detail-panel.tsx`：completed 填充 `primaryActions = 继续此方向`，failed 填充 `primaryActions = 修正并继续`（同一恢复链路，架构 §6.3 步骤 1）；processing 不提供动作（plan-03 已定）。
- `src/app/workspace/page.tsx`：恢复入口消费 sessionStorage 通道中的恢复载荷（模式与既有 `useHistoryRestore` 一致）；维护 `currentIterationId`；上一轮结果（`resultFileUrl`）进入既有"上一轮结果"展示位。
- **来源模板标记（AC-02 数据来源）**：工作台维护 `currentTemplateId`——从 Style Memory 进入（`?templateId=`）加载模板时记录；恢复携带 `sourceTemplateId` 的迭代时还原该值；直接上传分析时为空。生成提交在 `page.tsx` 既有 `handleGenerate`（内联组装 POST 请求体，约 L585-626）中，于 `currentTemplateId` 非空时在请求体携带 `sourceTemplateId`（frontend_computed）。没有该发送方，`generation_tasks.source_template_id` 永远为空，"按来源 Style Memory 名称搜索"（AC-02 / PRD 业务规则 4）无法成立。
- `use-workspace-state.ts`：暴露 `flush()`（同步写 sessionStorage，绕过防抖），仅新增导出，不改变既有自动持久化行为。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | E2E red | frontend | done | `workspace-iteration-restore.spec.ts` 8 用例全部预期失败，red 证据 `docs/e2e/evidence/plan-04-e2e-red-2026-08-17.md` |
| 2 | 守卫纯函数 + 单测 | frontend | done | `restore-guard.ts` 三豁免 + confirm 四类分支（含参数缺失保守侧），9 用例全绿 |
| 3 | use-workspace-state flush 暴露 | frontend | done | 实例 `flush()` 同步落盘；通道扩展恢复上下文字段（currentIterationId / currentTemplateId / previousResultUrl / restoredParams / pendingIterationRestore），300ms 防抖机制不变，33 既有用例全绿 |
| 4 | 恢复 hook | frontend | done | `use-iteration-restore.ts`：载荷组装（含 sourceTemplateId 还原）、守卫接入、同步写通道（flush 语义）再导航，纯客户端零请求 |
| 5 | 替换确认对话框 + 组件测试 | frontend | done | 两侧完整摘要、取消零变更、Escape 取消、“受控关闭不应用”边界，7 用例全绿 |
| 6 | 详情动作接线 | frontend | done | completed“Continue this direction” / failed“Fix and continue”内置主动作（插槽显式传入时不重复渲染）；processing 不渲染动作区（plan-03 回归 9/9） |
| 7 | 工作台消费接线 | frontend | done | 恢复载荷经通道传递，工作台以 history_restored 恢复态初始挂载（提示/排除项/参数/变量/来源/上一轮结果），页面级消费参数与来源上下文；previous-result-preview 展示位；恢复态不轮询分析端点（防过期分析覆盖快照） |
| 8 | 生成请求携带 sourceTemplateId | frontend | done | `handleGenerate` 于 currentTemplateId 非空时携带；`?templateId=` 进入时记录；E2E TC-4.7 断言请求体 |
| 9 | 实现至 E2E green | frontend | done | 8/8 通过（含“恢复→修改→生成新 Iteration” POST 捕获断言） |

## 验收标准

### 功能验收

- [x] AC-05 守卫三豁免生效：空工作台 / 已是同一 Iteration / 内容一致时直接继续，不弹确认（E2E TC-4.1/4.8 + `restore-guard.test.ts` 豁免③）
- [x] AC-05 存在不同未完成内容时先弹替换确认；取消后详情与工作台两侧状态均不变（E2E TC-4.2/4.3）
- [x] AC-05 确认后进入工作台：恢复所选记录的参考图（来源上下文）、证据与不变量、提示、变量、排除项和生成设置，不自动生成，原结果保留为上一轮可见（E2E TC-4.1/4.4，previous-result-preview）
- [x] AC-04 failed 详情的“修正并继续”走同一恢复链路且不自动提交（E2E TC-4.5）
- [x] 恢复后用户修改并主动生成 → 发出既有 `POST /api/generation` 请求形成新 Iteration，原记录不动（E2E TC-4.6 mock POST 捕获断言）
- [x] 恢复载荷应用后同步 flush 再导航（工作台挂载读到的是恢复后的快照；恢复 hook 同步写通道 + 页面消费后 `ws.flush()` 固化）
- [x] AC-02 从 Style Memory 进入工作台生成时请求体携带 `sourceTemplateId`；恢复携带来源模板的迭代后再次生成同样携带（`?templateId=` 记录 currentTemplateId；E2E TC-4.7 断言恢复链路携带，保障记录可按模板名搜索）
- [x] `restore-guard` 单测、组件测试与 `pnpm verify:fast` 通过（9 + 7 + 18 用例；verify:fast 98 文件 789 用例全绿）

### E2E 验收（red → green）

- [x] `pnpm e2e -- e2e/workspace-iteration-restore.spec.ts --project=workspace`：8/8 通过（direct 恢复不弹确认、confirm 取消两侧不变、确认后快照恢复且无生成请求、恢复→修改→生成新 Iteration、failed 同链路、sourceTemplateId、重复恢复幂等）；red 证据 `docs/e2e/evidence/plan-04-e2e-red-2026-08-17.md`

## 验证命令

```bash
pnpm e2e -- e2e/workspace-iteration-restore.spec.ts --project=workspace
pnpm vitest --run src/lib/iterations/__tests__/restore-guard.test.ts src/components/iterations/__tests__/replace-confirm-dialog.test.tsx
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.3（恢复链路与三豁免）、ADR-4（纯客户端恢复）、§8.6（守卫误判风险与保守侧取舍）
- **相关代码**: `src/hooks/use-history-restore.ts`（既有恢复模式与 `RestoredData` 结构）、`src/hooks/use-workspace-state.ts`（sessionStorage 持久化，300ms 防抖）、`src/app/workspace/page.tsx` 既有恢复消费段（约 L413-L460）与 `handleGenerate` 生成请求体组装（约 L585-626）
- **契约 / 数据对象**: 恢复载荷 = `IterationDetail` 字段子集 + `currentIterationId`；守卫输入 `WorkspaceSnapshot`（提示/排除项/参数/currentIterationId）
- **下游消费方**: plan-06（全流程集成回归覆盖恢复段）

## 风险与边界

- **执行顺序**: Task 1（red E2E）必须最先完成并留存失败证据，再按 Task 2-8 顺序实现，Task 9 收口转 green
- **验证失败排查方向**: 恢复后工作台显示旧内容 → 检查 flush 是否在导航前调用；守卫误判 → 检查比较字段集是否与规格一致（提示/排除项/两参数）
- **允许修改的额外文件**:
  - `e2e/helpers/mock-api.ts` — red E2E 步骤已声明（任务指令授权）：纯新增 `mockGenerationCreateCapture` 捕获式 POST mock，未改动任何既有 helper
  - `src/components/iterations/__tests__/iteration-detail-panel.test.tsx` — plan-03 交付的“动作区空占位、无内置动作”断言被 plan-04 计划内行为变更（填充默认主动作）取代，按 AGENTS.md“组件行为变更须同步相邻组件测试”更新；同时补充 `next/navigation` mock 与恢复动作/导航/通道写入断言，既有其余断言未放宽
- **暂停条件**: 发现恢复所需字段无法从 `IterationDetail` 获得（需回改 plan-01 契约）、或既有 `useHistoryRestore` 恢复路径与新链路行为冲突需要合并重构时
- **风险备注**: 守卫保守侧（多弹确认）可接受（架构 §8.6）；与既有历史恢复共用工作台消费段时以新链路为准但不移除旧入口；`workspace-history-strip.spec.ts` 的 TC-4.1/TC-4.2+4.3 失败为存量问题——其断言的 `floating-generate-button` / `top-mode-switcher` 已被更早的已提交重构（0ee90d4、3f2187e）移除，与本期改动无关（近期条 completed-only 行为由 `workspace-ai-first-iteration-memory.spec.ts` 全绿承载）
- **E2E 不适用说明**: 不适用（用户可观察功能，E2E 必选）

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 工作台为空时恢复 | direct，无确认 | done（E2E TC-4.1） |
| 恢复目标即当前 Iteration | direct，无确认 | done（E2E TC-4.8） |
| 当前内容与目标逐字段一致 | direct，无确认 | done（单测豁免③；参数不在持久化通道、E2E 无法稳定构造，按 red 证据说明由 `restore-guard.test.ts` 承载） |
| 确认对话框期间用户切换详情 | 关闭对话框，不应用载荷 | done（面板 detail.id 变化即取消挂起请求；`replace-confirm-dialog.test.tsx` 受控关闭不应用断言） |
| 恢复时来源图缺失 | 恢复其余字段，来源位保持缺失占位 | done（恢复态豁免通道 assetId/referenceImageUrl 校验，ReferenceCard 空态占位，不渲染裂图） |
| flush 前页面被关闭 | 未落盘即未应用，等同取消（无半恢复态） | done（恢复写入为同步单步（写入即落盘）；页面消费前通道中的待应用载荷不产生任何可见副作用） |
| 恢复后立即再次生成 | 走既有 POST，新 Iteration，原记录不动 | done（E2E TC-4.6/4.7 POST 捕获断言；生成完成清除上一轮结果展示位） |
