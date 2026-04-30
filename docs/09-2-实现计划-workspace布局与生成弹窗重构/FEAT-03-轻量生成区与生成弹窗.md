---
feat_id: "FEAT-03"
title: "轻量生成区与生成弹窗"
dimension: frontend
phase: 3
status: done
depends_on: ["FEAT-01", "FEAT-02"]
---

# FEAT-03: 轻量生成区与生成弹窗

## 功能概要

- **目标**: 将右侧生成区压缩为轻量操作层，并把生成中、生成完成和生成失败状态迁移到生成对话框；提交生成时使用合一编辑区解析出的完整生成提示，负面提示字段兼容传空字符串。
- **完成后可观察结果**: 用户在右侧较小的生成区只看到必要输出设置、不可用原因和生成入口。点击生成后，页面打开对话框显示生成进度；生成完成后对话框展示结果图和后续操作；生成失败时对话框提供重试和返回编辑。关闭对话框后，用户回到原工作台，参考图、风格拆解、模板原文、变量值和完整提示词都保持不丢失。
- **依赖**: FEAT-01, FEAT-02
- **关联验收标准**: [AC-04, AC-05, AC-08, AC-10]
- **涉及架构模块**: LightGeneratePanel, GenerationDialog, EditingPane, WorkspaceContext
- **前置条件**: FEAT-01 左右双区稳定；FEAT-02 能提供 `resolvedPromptText` 或等价完整生成提示。
- **不在范围**: 新增生成 API、后端字段迁移、结果对比页、历史筛选、移动端专用弹窗。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/light-generate-panel.tsx` | 新建轻量生成区，承载必要设置、生成入口和不可用原因 |
| create | `src/components/workspace/generation-dialog.tsx` | 新建生成对话框，承载生成中、结果、失败状态 |
| modify | `src/components/workspace/output-settings.tsx` | 拆分或压缩为参数选择子组件，供轻量生成区复用 |
| modify | `src/components/workspace/generation-progress.tsx` | 作为生成对话框进度内容复用或轻量化 |
| modify | `src/components/workspace/result-display.tsx` | 作为生成对话框结果内容复用或迁移 |
| modify | `src/app/workspace/page.tsx` | 读取合一编辑区完整提示，生成时传空 `negativePromptText`，控制对话框开关 |
| modify | `src/hooks/use-workspace-state.ts` | 如需要，确保生成失败/关闭弹窗不清空工作台上下文；不改变后端任务状态语义 |
| modify | `src/hooks/__tests__/use-workspace-state.test.tsx` | 更新负面提示 UI 移除后的前端状态断言，保留接口兼容 |
| modify | `src/components/workspace/__tests__/output-settings.test.tsx` | 更新为轻量生成区或参数选择测试 |
| create | `src/components/workspace/__tests__/light-generate-panel.test.tsx` | 覆盖生成按钮、不可用原因、参数选择 |
| create | `src/components/workspace/__tests__/generation-dialog.test.tsx` | 覆盖进度、结果、失败、关闭不 reset |
| create | `e2e/workspace-generation-dialog.spec.ts` | 生成弹窗、失败恢复、关闭回上下文 E2E |
| modify | `e2e/helpers/mock-api.ts` | 如需要，补充生成中/完成/失败 mock |
| modify | `e2e/helpers/workspace-actions.ts` | 如需要，补充生成弹窗操作 helper |

## 实现规格

### 前端部分

#### 1. `LightGeneratePanel`

- 位于 `EditingPane` 下方或次级区域，视觉和空间占比小于合一编辑区。
- 只展示必要输出设置、生成按钮、生成不可用原因。
- 不展示生成结果图，不承载长状态文案。
- `canGenerate` 条件至少包含：当前有完整生成提示、当前状态允许生成、生成服务未被标记为不可用。
- 生成不可用时，在按钮附近展示短原因和恢复提示。

#### 2. 生成提交契约

- 从 FEAT-02 的合一编辑区读取 `resolvedPromptText`。
- 若当前是模板模式，生成前使用 `templateSource + variableValues` 渲染完整提示。
- 若当前是文本模式，直接使用 `promptText`。
- 调用现有 `POST /api/generation` 时：
  - `promptText = resolvedPromptText`
  - `negativePromptText = ""`
  - `params = LightGeneratePanel` 当前输出设置
- 不新增后端字段，不修改生成任务表。

#### 3. `GenerationDialog`

- `open` 状态由 `WorkspacePage` 或局部 controller 管理。
- `generating` 时展示 `GenerationProgress` 和排队提示。
- `generation_ready` 时展示结果图、关闭、重新生成等动作。
- `generation_failed` 时展示错误说明、重新生成、返回编辑。
- 关闭对话框只改变 dialog 状态，不调用 `ws.reset()`，不清空合一编辑区草稿。
- 对话框内容过长时内部滚动，关闭和主要行动入口保持可访问。

#### 4. 失败恢复与上下文保留

- 生成失败只接管对话框，不替换主工作台布局。
- 返回编辑时关闭对话框，保留参考图、风格拆解、模板原文、变量值、文本草稿和输出设置。
- 重新生成复用当前完整生成提示和输出设置。

#### 5. E2E red spec

- `e2e/workspace-generation-dialog.spec.ts` 必须先 red。
- 覆盖生成中弹窗、生成完成结果、关闭后上下文保留、生成失败返回编辑、负面提示输入不可见。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `workspace-generation-dialog` E2E red spec | frontend | done | 覆盖 AC-04/05/08/10 |
| 2 | 创建 `LightGeneratePanel` | frontend | done | 轻量参数和生成入口 |
| 3 | 创建 `GenerationDialog` | frontend | done | 进度、结果、失败、关闭 |
| 4 | 拆分或压缩 `OutputSettings` | frontend | done | 提供参数选择能力，移除主布局结果占位 |
| 5 | 改造 `WorkspacePage` 生成提交 | frontend | done | 使用 resolved prompt，负面提示传空字符串，打开弹窗 |
| 6 | 确保生成失败和关闭弹窗不清空上下文 | frontend | done | 必要时微调 `useWorkspaceState` 或局部状态 |
| 7 | 更新组件测试和 hook 测试 | frontend | done | 轻量生成区、对话框、负面提示 UI 移除 |
| 8 | 跑通 E2E green 和全局验证 | frontend | done | 记录 green 证据 |

## 验收标准

### 前端验收

- [x] AC-04 生成进度、生成完成图片、生成失败说明都在对话框内呈现。
- [x] AC-04 主工作台不出现常驻生成结果区，背景仍保持左右双区。
- [x] AC-05 关闭生成完成或失败弹窗后，参考图、风格拆解、模板原文、变量值、完整提示词和输出设置保持不丢失。
- [x] AC-08 生成失败提供重新生成和返回编辑；返回编辑不清空上下文。
- [x] AC-10 生成区占据右侧较小空间，只展示必要输出设置、生成入口和不可用原因。
- [x] AC-10 生成服务不可用时，轻量生成区显示原因，合一编辑区仍可编辑。
- [x] 负面提示输入不再作为可见 UI 出现在工作台生成区；生成请求仍以 `negativePromptText: ""` 兼容现有 API。
- [x] 历史恢复回归：点击历史项后工作台保持左右双区，模板/文本内容正确恢复，不触发生成弹窗。
- [x] E2E-TDD：`e2e/workspace-generation-dialog.spec.ts` 先 red 后 green。
- [x] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-03-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-03-e2e-green-{date}.md`。

### 性能验收

- [x] 生成对话框复用现有 generation polling，不新增额外轮询通道。（架构 §8.1）
- [x] 模式切换和变量编辑不会触发生成请求；只有点击生成才调用生成 API。（架构 §8.4）

### 降级回归验收

- [x] L2 生成服务不可用时，轻量生成区显示原因，合一编辑区继续可用。（架构 §8.2）
- [x] L4 生成失败在对话框内展示，允许重试或返回编辑。（架构 §8.2）

## 验证命令

```bash
pnpm e2e -- e2e/workspace-generation-dialog.spec.ts
pnpm vitest --run src/components/workspace/__tests__/light-generate-panel.test.tsx src/components/workspace/__tests__/generation-dialog.test.tsx src/components/workspace/__tests__/output-settings.test.tsx src/hooks/__tests__/use-workspace-state.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-04/05/08/10，§3.2，§4.2，§6.4，§6.5，§6.6，§7.3，§8.2，§8.4
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/output-settings.tsx`、`src/components/workspace/generation-progress.tsx`、`src/components/workspace/result-display.tsx`、`src/hooks/use-workspace-state.ts`
- **契约 / 数据对象**: `ResolvedGenerationInput`、`GenerationDialogState`、`GenerationParams`
- **下游消费方**: 本功能是 09 期最后一个功能，完成后应跑全局工作台 E2E 回归。

## 风险与边界

- **执行顺序**: 先 E2E red，再轻量生成区，再对话框，再页面接线，最后更新测试。
- **验证失败排查方向**: 优先检查生成提交是否拿到 `resolvedPromptText`、是否仍展示负面提示输入、关闭弹窗是否误调用 reset、E2E mock 是否返回生成状态。
- **允许修改的额外文件**: `src/hooks/use-generation.ts` 仅限类型适配；`src/components/workspace/history-panel.tsx` 仅限结果完成后历史刷新显示问题。
- **暂停条件**: 如果必须修改 `POST /api/generation` 请求体或数据库字段，停止并回报，因为架构要求后端兼容不迁移。
- **E2E 不适用说明**: 不适用；本功能是用户可观察生成能力，必须有 E2E。
- **风险备注**: 生成对话框会接触现有生成/历史恢复逻辑，注意不要把历史恢复改成弹窗行为，历史恢复不在本 FEAT 范围内。全局验证时应覆盖历史恢复回归：点击历史项后左右双区保持、内容正确恢复。

### 文件清单偏差说明

| 文件 | 处理结论 | 原因 |
| --- | --- | --- |
| `src/components/workspace/output-settings.tsx` | waived - legacy 保留 | 轻量生成区由 `LightGeneratePanel` 承接，旧 `OutputSettings` 保留给既有测试和非 09 工作台路径。 |
| `src/components/workspace/generation-progress.tsx` | reused | `GenerationDialog` 复用现有进度内容，无需修改内部计时逻辑。 |
| `src/components/workspace/result-display.tsx` | waived - 主工作台不再使用 | 结果呈现已迁入 `GenerationDialog`，旧组件保留给 legacy 测试/调用。 |
| `src/hooks/use-workspace-state.ts` | waived - 状态语义保持不变 | 弹窗开关与当前输出设置由 `WorkspacePage` 局部 controller 管理，避免改变后端任务状态语义。 |
| `src/hooks/__tests__/use-workspace-state.test.tsx` | waived - hook 契约未变 | 负面提示字段仍保留接口兼容；工作台不再显示输入由组件/E2E 覆盖。 |
| `src/components/workspace/__tests__/output-settings.test.tsx` | waived - legacy 测试保留 | 旧组件测试继续覆盖原组件；新增轻量生成区测试覆盖 09 工作台行为。 |

### 审核修复记录

- 已补 `src/components/workspace/__tests__/light-generate-panel.test.tsx` 和 `src/components/workspace/__tests__/generation-dialog.test.tsx`。
- 已将输出参数提升到 `WorkspacePage`，`LightGeneratePanel` 和 `GenerationDialog` 共享当前 `aspectRatio` / `quality`，重新生成复用用户当前选择。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 完整生成提示为空 | 轻量生成区禁用生成并展示原因 | done |
| 生成服务不可用 | 轻量生成区显示不可用原因，编辑区保持可用 | done |
| 生成中等待过久 | 对话框内部展示排队提示 | done |
| 生成失败 | 对话框展示错误、重新生成、返回编辑 | done |
| 关闭结果弹窗 | 只关闭弹窗，不清空工作台上下文 | done |
| 负面提示旧字段 | UI 不展示，生成提交传空字符串 | done |
| 结果内容较长或图片较大 | 对话框内部滚动，关闭和主行动可访问 | done |
