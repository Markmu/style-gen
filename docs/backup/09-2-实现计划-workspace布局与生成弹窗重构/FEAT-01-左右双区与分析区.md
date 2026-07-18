---
feat_id: "FEAT-01"
title: "左右双区与分析区"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# FEAT-01: 左右双区与分析区

## 功能概要

- **目标**: 将工作台外层从当前状态驱动的二/三列 grid，重构为稳定的左右双区，并完成左侧参考图小占比与风格拆解主空间的分析区。
- **完成后可观察结果**: 用户进入工作台时，无论是未上传、上传中、分析中还是分析完成，页面都保持左侧分析区和右侧编辑区的外层骨架。左上始终是上传/参考图职责区，左下始终是风格拆解职责区。分析完成后参考图保持轻量，风格拆解成为左侧主要阅读内容；长内容可滚动，工作台占满导航和侧边栏之外的剩余空间。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-02, AC-06, AC-07, AC-08]
- **涉及架构模块**: WorkspaceTwoPaneLayout, AnalysisPane, ReferencePreview, StyleBreakdownPanel, WorkspaceLayoutContract
- **前置条件**: 架构文档 `docs/09-1-架构文档-workspace布局与生成弹窗重构.md` 已 review_ready；现有工作台上传/分析 hooks 可用。
- **不在范围**: 合一编辑区模式切换、变量列表、轻量生成区、生成对话框、后端 API 变更。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 移除二/三列 grid 切换，接入左右双区布局和左侧分析区 |
| modify | `src/app/workspace/layout.tsx` | 确认工作区内容占满导航外剩余空间，避免顶层滚动失控 |
| create | `src/components/workspace/workspace-two-pane-layout.tsx` | 新建左右双区容器，定义宽度比例、最小宽度和滚动边界 |
| create | `src/components/workspace/analysis-pane.tsx` | 新建左侧分析区，组合参考图和风格拆解职责区 |
| create | `src/components/workspace/reference-preview.tsx` | 新建参考图上传/显示区，保持小占比职责 |
| create | `src/components/workspace/style-breakdown-panel.tsx` | 新建风格拆解区，承载空态、分析中、失败、完成态 |
| modify | `src/components/workspace/workspace-canvas.tsx` | 收敛为参考图/上传相关职责，移除作为主结果常驻区的依赖 |
| modify | `src/components/workspace/recipe-editor.tsx` | 作为风格拆解完成态内容接入左侧主区域 |
| modify | `src/components/workspace/analysis-progress.tsx` | 作为分析中状态内容接入风格拆解区 |
| modify | `src/components/workspace/error-display.tsx` | 确保分析失败只接管左侧对应区域，保留上下文 |
| create | `e2e/workspace-two-pane.spec.ts` | 工作台左右双区、空态一致、分析完成和宽屏滚动 E2E |
| modify | `e2e/helpers/workspace-actions.ts` | 如需要，补充进入分析完成态和视口断言 helper |
| modify | `e2e/helpers/mock-api.ts` | 如需要，补充 09 工作台布局 E2E mock 响应 |

## 实现规格

### 前端部分

#### 1. `WorkspaceTwoPaneLayout`

- 提供稳定外层结构：`AnalysisPane` 在左，`EditingPane` 占位在右。
- 首版右侧可以先渲染现有 Prompt/Output 区或空占位，但必须保留右侧容器位置，供 FEAT-02/03 接入。
- 主容器高度继承 `src/app/workspace/layout.tsx` 的剩余高度，内部使用 `min-h-0` 和明确 overflow 规则。
- 宽度策略遵循架构 `WorkspaceLayoutContract`：左侧分析，右侧编辑；参考图区 compact，风格拆解 primary。
- 常规桌面下不再基于 `showPromptEditor` 从二列切换到三列。

#### 2. `AnalysisPane`

- 上方渲染 `ReferencePreview`，下方渲染 `StyleBreakdownPanel`。
- `ReferencePreview` 高度/占比保持轻量，不因分析完成后抢占左侧主要空间。
- `StyleBreakdownPanel` 在未上传时展示风格拆解空态，在分析中展示 `AnalysisProgress`，在分析完成时展示 `RecipeEditorWithDegrade`。
- 分析失败时左上保留参考图，左下展示失败说明与重试/更换入口。

#### 3. `WorkspacePage` 接线

- 删除或旁路当前 `useThreeColumns` 布局分支。
- 保留现有 `handleFileSelected`、`handleRetry`、`handleReplace`、分析轮询和历史恢复逻辑。
- 在 FEAT-01 中不要改动生成提交语义；右侧现有编辑区只作为临时内容保留。
- 失败状态更新只改变错误对象和对应区域展示，不调用 `ws.reset()`。

#### 4. E2E red spec

- `e2e/workspace-two-pane.spec.ts` 必须先写出并在实现前 red。
- 覆盖未上传、分析中、分析完成三个状态，断言左上/左下/右侧职责区稳定存在。
- 覆盖 1280px 和 1440px 视口下无旧三列主布局漂移。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `workspace-two-pane` E2E red spec | frontend | done | 覆盖 AC-01/02/06/07 的预期失败 |
| 2 | 创建 `WorkspaceTwoPaneLayout` | frontend | done | 固定左右双区和滚动边界 |
| 3 | 创建 `AnalysisPane` / `ReferencePreview` / `StyleBreakdownPanel` | frontend | done | 左侧分析区职责拆分 |
| 4 | 改造 `src/app/workspace/page.tsx` 接入双区布局 | frontend | done | 移除旧二/三列 grid 切换 |
| 5 | 收敛 `WorkspaceCanvas` 的参考图职责 | frontend | done | 结果常驻展示留给 FEAT-03 弹窗处理 |
| 6 | 接入分析中、分析完成、分析失败内容 | frontend | done | 复用 AnalysisProgress / RecipeEditor / ErrorDisplay |
| 7 | 更新或新增组件测试 | frontend | done | 覆盖左侧空态、分析中、完成态和失败态 |
| 8 | 跑通 E2E green 和基础验证 | frontend | done | 记录 green 证据 |

## 验收标准

### 前端验收

- [x] AC-01 工作台主区域稳定分为左侧分析区和右侧编辑区，不再按状态切换为旧二/三列。
- [x] AC-02 分析完成后参考图保持小占比，风格拆解占据左侧主要阅读空间。
- [x] AC-06 未上传、分析中、分析完成三个状态下左上、左下、右侧区块位置一致，只替换内部内容。
- [x] AC-07 工作台占满顶部导航和侧边栏之外的剩余空间，1280px / 1440px 下无不可恢复横向挤压。
- [x] AC-08 上传失败和分析失败均只接管左侧对应区域，保留参考图和右侧编辑区上下文，不在全局 reset。
- [x] E2E-TDD：`e2e/workspace-two-pane.spec.ts` 先 red 后 green。
- [x] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-01-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-01-e2e-green-{date}.md`。

### 降级回归验收

- [x] L3 上传失败时左上显示错误和重试入口，左下保持占位，右侧编辑区不清空。（架构 §6.6、§8.2）
- [x] L1 分析等待提示在新的左侧分析区中正确显示，不遮挡参考图或右侧编辑区。（架构 §8.2）
- [x] L3 分析失败时保留参考图和右侧编辑区，提供重试分析和更换参考图。（架构 §8.2）

### 性能验收

- [x] 模式无关的布局状态切换不新增阻塞 API 请求；工作台首屏布局不等待生成或模板接口。（架构 §8.1）

## 验证命令

```bash
pnpm e2e -- e2e/workspace-two-pane.spec.ts
pnpm vitest --run src/components/workspace/__tests__/workspace-canvas.test.tsx src/components/workspace/__tests__/analysis-progress.test.tsx src/components/workspace/__tests__/error-display.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-01/02/06/07/08，§3.1，§4.2，§6.1，§6.2，§6.6，§7.2，§8.2
- **相关代码**: `src/app/workspace/page.tsx`、`src/app/workspace/layout.tsx`、`src/components/workspace/workspace-canvas.tsx`、`src/components/workspace/recipe-editor.tsx`
- **契约 / 数据对象**: `WorkspaceLayoutContract`、`WorkspaceContext`
- **下游消费方**: FEAT-02 在右侧编辑区容器内接入合一编辑区；FEAT-03 在右侧轻量生成区接入生成入口和弹窗。

## 风险与边界

- **执行顺序**: 先 E2E red，再布局容器，再左侧组件，再页面接线，最后测试。
- **验证失败排查方向**: 优先检查 `page.tsx` 是否仍保留旧 `useThreeColumns` grid、容器是否缺少 `min-h-0`、E2E mock 是否进入预期状态。
- **允许修改的额外文件**: `src/components/workspace/status-bar.tsx` 仅限修复布局占位冲突；`e2e/helpers/*` 仅限新增测试 helper。
- **暂停条件**: 如果必须修改分析 API、生成 API 或 `WorkspaceState` 后端语义，停止并回报，因为本期要求 API 不变。
- **E2E 不适用说明**: 不适用；本功能是用户可观察布局能力，必须有 E2E。
- **风险备注**: `src/app/workspace/page.tsx` 较长，改动时保持业务 handler 不变，避免把布局重构扩大成流程重写。

### 文件清单偏差说明

| 文件 | 处理结论 | 原因 |
| --- | --- | --- |
| `src/app/workspace/layout.tsx` | waived - 无需修改 | 现有布局已提供 `flex-1 min-h-0 overflow-hidden` 的内容区契约，FEAT-01 只需在 `page.tsx` 内接入双区主骨架。 |
| `src/components/workspace/workspace-canvas.tsx` | waived - 工作台不再使用 | 新的 `ReferencePreview` 承接工作台参考图职责，旧组件保留给既有测试/legacy 调用，不在本期直接删除。 |
| `src/components/workspace/recipe-editor.tsx` | waived - 复用完成态内容 | `StyleBreakdownPanel` 直接复用 `RecipeEditorWithDegrade`，无需修改其内部展示逻辑。 |
| `src/components/workspace/analysis-progress.tsx` | waived - 复用分析中内容 | `StyleBreakdownPanel` 直接复用现有分析进度组件，避免无意义搬迁。 |
| `src/components/workspace/error-display.tsx` | waived - 复用错误呈现 | 分析失败由左侧 `StyleBreakdownPanel` 容器接管，错误组件本身无需改动。 |

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 未上传空态 | 左右双区仍完整渲染，左下/右侧显示职责占位 | done |
| 上传中 | 左上显示上传反馈，左下不被移除 | done |
| 上传失败 | 左上显示错误和重试入口，左下保持占位，右侧编辑区不清空 | done |
| 分析中超过阈值 | 左下显示排队提示，布局不跳变 | done |
| 分析失败 | 左上参考图保留，左下显示恢复入口，右侧不清空 | done |
| 1280px 视口 | 左右区可用，无旧三列横向溢出 | done |
| 长风格拆解 | 所属区域可滚动，生成/编辑区域不被永久挤出 | done |
