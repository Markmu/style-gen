---
feat_id: "plan-04"
title: "Render Dock readiness 与生成恢复"
dimension: frontend
phase: 2
status: done
depends_on: ["plan-03"]
---

# plan-04: Render Dock readiness 与生成恢复

## 功能概要

- **目标**: 将 OutputCard 演进为 Render Dock，使变量完整度、风格信号、服务状态、参数、不可生成原因、重试和生成动作集中在一个可见控制面，并与现有生成 guard 保持一致。
- **完成后可观察结果**: 用户准备生成时，不再只看到一个孤立 Generate 按钮，而是看到 prompt resolved、variables resolved、style signals available、service available、workspace idle 等 readiness 项。若变量未填、分析还没完成、服务不可用或任务正在运行，Generate 按钮保持禁用并显示明确原因和下一步行动。生成失败后，结果区和 Render Dock 都保留 reference、prompt、variables 和参数，用户可以返回编辑、重试服务或保存当前方向。生成期间参数控件禁用但保持可见，避免重复提交。
- **依赖**: plan-03（Workspace Reference/Evidence/Prompt 风格复刻）
- **关联验收标准**: [AC-04, AC-08]
- **涉及架构模块**: WorkspaceExperience、Evidence/Prompt/Render 契约、StatePresenter/StatusLanguage
- **前置条件**: plan-03 已提供 prompt、variables、facets 和 workspace state；现有 `/api/generation` 和 `useGeneration` 轮询保持不变。
- **不在范围**: 新增 generation API、队列/WebSocket、AI Provider、完整参数系统、历史列表 UI、Style Memory 列表页。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 派生 RenderReadiness，统一 canGenerate/disabledReason/generation failure 恢复接线 |
| modify | `src/components/workspace/output-card.tsx` | 演进为 Render Dock，展示 readiness list、参数、disabled reason、retry、save action |
| modify | `src/components/workspace/output-settings.tsx` | 若仍被 OutputCard 使用，保持参数控件禁用/可见状态一致 |
| modify | `src/components/workspace/generation-dialog.tsx` | 失败/成功文案与 Render Dock 状态语言对齐，保留上下文 |
| create | `src/lib/render-readiness.ts` | 纯函数计算 `RenderReadiness` 和 disabledReason |
| create | `src/lib/__tests__/render-readiness.test.ts` | 覆盖 prompt、variables、signals、service、busy 的组合 |
| modify | `src/components/workspace/__tests__/output-card.test.tsx` | 覆盖 readiness list、禁用原因、retry、参数禁用 |
| modify | `src/components/workspace/__tests__/generation-dialog.test.tsx` | 覆盖失败恢复 copy 和不清空上下文提示 |
| create | `e2e/workspace-ai-first-render-dock.spec.ts` | Render Dock targeted E2E |

## 实现规格

### 前端部分

#### 1. RenderReadiness 纯函数

创建 `src/lib/render-readiness.ts`：

- 输入：`promptText`、`variables`、`hasUnresolvedVariables` 结果、`facets`、`workspaceState`、`degradation`、`error`。
- 输出符合架构 §7.2 的 `RenderReadiness`：`promptResolved`、`variablesResolved`、`styleSignalsAvailable`、`serviceAvailable`、`workspaceIdle`、`canGenerate`、`disabledReason`、`nextAction`。
- `canGenerate` 必须与现有生成 guard 一致：prompt 非空、无未解析变量、非 busy、服务可用，且存在可用 analysis context。
- 不做网络请求，不写 sessionStorage，不改变 generation task 状态。

#### 2. Workspace 生成 guard 收敛

在 `src/app/workspace/page.tsx`：

- 使用同一个 `RenderReadiness` 结果驱动 `canGenerate`、`disabledReason` 和 Render Dock UI。
- `handleGenerate` 保留现有 API 请求与错误解析，但 guard 与 UI readiness 一致。
- `SERVICE_UNAVAILABLE` 或 `generationUnavailable` 只阻断生成动作，不阻断编辑、历史查看和保存 Style Memory。
- 生成失败调用 `ws.failGeneration` 后保持 `generation_ready` 或可恢复状态，不清空 prompt/params。

#### 3. OutputCard -> Render Dock

`src/components/workspace/output-card.tsx`：

- 接收 `readiness: RenderReadiness`，不再在组件内部自行推断所有状态。
- 显示 compact readiness list：Prompt、Variables、Style signals、Service、Workspace idle。
- 参数控件在 generating 时 disabled 但可见；按钮使用 icon+text 或熟悉图标，不使用孤立 SVG 文本按钮。
- disabled reason 可见在按钮附近，不只放 `title`。
- 生成失败时显示 Retry 和 Back to Edit/Keep Editing 行动；保存 Style Memory 入口保留但不重复 PromptCard 的主保存入口。

#### 4. GenerationDialog 恢复文案

`GenerationDialog` 成功/失败都要说明上下文：

- 成功：结果可继续编辑、再次生成、保存 Style Memory。
- 失败：当前 reference/prompt/params 已保留，可重试或返回编辑。
- 内部错误码只作为辅助细节，不展示密钥、stack 或 provider 内部信息。

#### 5. E2E red/green

`e2e/workspace-ai-first-render-dock.spec.ts` 覆盖：

- 无 prompt/未分析时显示不可生成原因。
- prompt 有未解析变量时 disabled reason 指向变量。
- analysis_ready 且变量完整时可生成。
- generationUnavailable 时 Generate 禁用，但编辑和保存能力可见。
- generating 中禁止重复提交且参数保持可见。
- generation failed 后上下文保留，Retry/Back to Edit 可见。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `workspace-ai-first-render-dock.spec.ts` red 用例和证据 | frontend | done | Red 证据已存在：`docs/e2e/evidence/plan-04-e2e-red-20260705.md` |
| 2 | 实现 `render-readiness.ts` 与单元测试 | frontend | done | UI 与生成 guard 使用同一 `RenderReadiness` 结果 |
| 3 | 在 workspace page 接入 readiness 和 generation guard | frontend | done | 未改变 `/api/generation` contract |
| 4 | 改造 OutputCard 为 Render Dock | frontend | done | readiness list、disabled reason、retry、参数可见已实现 |
| 5 | 更新 GenerationDialog 成功/失败恢复文案 | frontend | done | 成功/失败说明上下文保留，并屏蔽内部 stack |
| 6 | 更新组件测试 | frontend | done | output-card 与 generation-dialog 已覆盖 |
| 7 | 运行 red/green E2E、单元测试、类型检查和构建 | frontend | done | 目标 spec 已 green；green 证据由后续 `test-e2e` 步骤写入 |

## 验收标准

### Render Dock 验收

- [x] AC-04 Render Dock 显示 prompt resolved、variables resolved、style signals available、service available、workspace idle 的 readiness list。
- [x] AC-04 `canGenerate=false` 时 Generate 禁用且按钮附近显示明确原因和下一步行动。
- [x] AC-04 `canGenerate=true` 时点击 Generate 调用现有 `/api/generation`，参数来自 UI，prompt 使用 resolved prompt。
- [x] AC-08 generation service unavailable 时保留编辑、历史查看和保存能力，不清空上下文。
- [x] AC-08 生成失败后保留 reference、prompt、variables、params，并提供 Retry/Back to Edit。
- [x] E2E-TDD：`e2e/workspace-ai-first-render-dock.spec.ts` 已先 red 后 green；red 证据为 `docs/e2e/evidence/plan-04-e2e-red-20260705.md`，green 证据由后续 `test-e2e` 步骤写入。

### 性能验收（架构 §8.1 目标）

- [x] AC-04 readiness 在 prompt/variables 变化后前端同步更新，不触发网络请求（架构 §8.1）。

### 降级回归验收（架构 §8.2）

- [x] AC-08 L1 generating queued、L2 service unavailable、L3 generation failed 均在 Render Dock 中可见，且不遮挡 prompt 编辑区。

## 验证命令

```bash
pnpm vitest --run src/lib/__tests__/render-readiness.test.ts src/components/workspace/__tests__/output-card.test.tsx src/components/workspace/__tests__/generation-dialog.test.tsx
pnpm e2e -- e2e/workspace-ai-first-render-dock.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-04/AC-08、§3.2 生成就绪判断/开始生成/生成完成、§6.4、§7.2 RenderReadiness、§8.1、§8.2、ADR-5。
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/output-card.tsx`、`src/components/workspace/output-settings.tsx`、`src/components/workspace/generation-dialog.tsx`、`src/lib/template-parser.ts`。
- **契约 / 数据对象**: `RenderReadiness`、`WorkspaceContext`、`DegradationState`、`WorkspaceError`、`GenerationParams`。
- **下游消费方**: plan-05 Iteration Memory 使用生成完成/失败后的上下文和保存入口；plan-08 汇总异常路径 E2E。

## 风险与边界

- **执行顺序**: 先补 red E2E 和 pure function 测试，再收敛 readiness，再改 OutputCard/GenerationDialog。
- **验证失败排查方向**: 检查 `hasUnresolvedVariables`、analysisTaskId 缺失、busy state、generationUnavailable、disabledReason 是否与 `handleGenerate` guard 不一致。
- **允许修改的额外文件**: 无。
- **暂停条件**: 若需要新增 `/api/readiness`、修改 generation API 请求体、引入 WebSocket/队列或新增 provider 状态 API，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能为生成前用户决策核心界面。
- **风险备注**: 保存 Style Memory 的最终历史路径在 plan-05 完成；本 plan 只保证 Render Dock 入口和上下文不丢失。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| prompt 为空 | Generate 禁用，nextAction 指向上传/分析或编辑 prompt | done |
| prompt 有未解析变量 | Generate 禁用，disabledReason 指向变量完整度 | done |
| facets 为空但 prompt 可用 | 显示 style signal 不足；若缺少 analysisTaskId 则 Generate 禁用并指向 wait_for_analysis/upload_reference | done |
| generationUnavailable | Generate 禁用，编辑/保存/历史可见 | done |
| generating 中重复点击 | 按钮 disabled，参数只读但可见 | done |
| generation failed retryable | 保留上下文，显示 Retry/Back to Edit | done |
