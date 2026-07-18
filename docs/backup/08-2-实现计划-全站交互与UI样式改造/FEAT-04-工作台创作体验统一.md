---
feat_id: "FEAT-04"
title: "工作台创作体验统一"
dimension: frontend
phase: 3
status: ready-to-dev
depends_on: ["FEAT-01", "FEAT-02"]
---

# FEAT-04: 工作台创作体验统一

## 功能概要

- **目标**: 在保留 07 期三段式信息架构和现有 hooks 的基础上，统一工作台画布、Recipe、Prompt、OutputSettings、HistoryPanel、进度和失败恢复体验。
- **完成后可观察结果**: 用户上传、分析、编辑、生成、查看结果、恢复历史时，布局保持稳定；参考图、Prompt、Recipe、输出设置不会在失败或等待中丢失；当前任务始终是视觉中心，辅助面板不抢焦点。
- **依赖**: FEAT-01, FEAT-02
- **关联验收标准**: [AC-02, AC-03, AC-04, AC-06, AC-07, AC-08]
- **涉及架构模块**: WorkspaceExperience, StatePresenter, PageLayoutContract
- **前置条件**: FEAT-01 状态契约可用，FEAT-02 工作区壳层稳定。
- **不在范围**: 改变分析/生成 API、改变模板数据模型、重写 `useWorkspaceState` 业务状态机。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 统一三段式内容区域、模板加载失败提示、状态恢复入口 |
| modify | `src/components/workspace/status-bar.tsx` | 接入状态文案契约，轻质化状态 badge 和更换入口 |
| modify | `src/components/workspace/workspace-canvas.tsx` | 图片承载、分析 overlay、结果/对比状态统一 |
| modify | `src/components/workspace/upload-zone.tsx` | 上传区状态接入共享样式 |
| modify | `src/components/workspace/analysis-progress.tsx` | 分析中/排队提示接入 StatePresenter |
| modify | `src/components/workspace/generation-progress.tsx` | 生成中状态接入 StatePresenter |
| modify | `src/components/workspace/error-display.tsx` | 失败文案和恢复动作统一 |
| modify | `src/components/workspace/recipe-editor.tsx` | Recipe 表面、展开、编辑、降级提示轻质化 |
| modify | `src/components/workspace/prompt-editor.tsx` | 输入区 focus/error/disabled 状态统一 |
| modify | `src/components/workspace/output-settings.tsx` | 生成按钮、参数控件、失败/排队提示统一 |
| modify | `src/components/workspace/history-panel.tsx` | 历史抽屉、缩略图、恢复中、错误/空态统一 |
| modify | `src/components/workspace/canvas-toolbar.tsx` | 图标按钮状态统一 |
| modify | `src/components/workspace/style-tag-bar.tsx` | chips 统一为 Precision Chips |
| create | `e2e/precision-glass-workspace.spec.ts` | 工作台核心流程、失败恢复、宽屏稳定 E2E |

## 实现规格

### 前端部分

#### 1. 页面布局稳定

- 保留现有左侧导航、中央工作区、右侧历史面板结构。
- 工作台内部可在二列/三列之间切换，但常规宽屏下主任务区域位置不能大幅漂移。
- `promptText`、`negativePromptText`、参考图、Recipe 和输出设置在失败时不得被清空。

#### 2. 画布与媒体承载

- 参考图、结果图、对比图统一使用 `.media-lens` 或等价样式。
- 图片区域设定稳定 aspect ratio / max-height，避免加载时布局跳动。
- 分析中 overlay 使用轻质 blur 和明确状态说明，不用沉重黑幕。

#### 3. 编辑与生成区域

- Recipe、Prompt、OutputSettings 使用一致 panel 层级。
- Prompt 文本区使用 `input-precision` 或等价 focus/error 状态。
- 生成按钮在 processing / disabled 时说明原因，不只灰掉。

#### 4. 失败与恢复

- 分析失败：保留参考图，提供重试分析和更换参考图。
- 生成失败：保留 Prompt 和输出设置，提供重新生成和返回编辑。
- 等待超过 60s：保留既有排队提示逻辑，但文案统一为可行动状态。
- 历史恢复失败：在历史面板或当前区域提示重试，不只 `console.error`。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写工作台 E2E red spec | frontend | todo | 上传、分析、生成、失败恢复、历史恢复和宽屏布局 |
| 2 | 统一工作台 page 布局和模板加载失败提示 | frontend | todo | 不改变业务 hooks |
| 3 | 改造画布和上传区 | frontend | todo | 图片承载、上传状态、分析 overlay |
| 4 | 改造状态栏、分析/生成进度、错误展示 | frontend | todo | 消费 StatusCopy / StatePresenter |
| 5 | 改造 Recipe / Prompt / OutputSettings | frontend | todo | 表面层级和控件状态统一 |
| 6 | 改造 HistoryPanel 和 CanvasToolbar | frontend | todo | 缩略图、恢复、icon button 状态 |
| 7 | 更新相关组件测试 | frontend | todo | status-bar、workspace-canvas、error-display、output-settings、history-panel |
| 8 | 跑通工作台 E2E green | frontend | todo | 常规宽屏截图/断言 |
| 9 | 运行类型检查和构建 | frontend | todo | 确保无类型和构建错误 |

## 验收标准

### 前端验收

- [ ] AC-02 工作台表面、导航、图片承载、卡片质感和文字层级与首页/模板库一致。
- [ ] AC-03 上传区、图标按钮、文本输入、历史缩略图、选择器和主行动按钮状态可判断。
- [ ] AC-04 上传、分析、分析完成、生成中、生成完成状态下布局稳定。
- [ ] AC-04 失败和状态切换不清空参考图、Recipe、Prompt、negativePrompt 或输出设置。
- [ ] AC-06 分析失败提供重试分析/更换参考图，生成失败提供重新生成/返回编辑。
- [ ] AC-07 1280px / 1440px 下工作台主任务、辅助信息、历史区域比例稳定。
- [ ] AC-08 空态、排队、处理中、成功、失败、历史恢复文案统一可行动。
- [ ] E2E-TDD：`e2e/precision-glass-workspace.spec.ts` 先 red 后 green。
- [ ] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-04-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-04-e2e-green-{date}.md`。

### 性能验收

- [ ] 上传、分析中、生成中、完成、失败之间无整页重排。
- [ ] 历史面板继续分页加载，不增加一次性全量请求。

### 降级回归验收

- [ ] L1 等待过久提示不遮挡主任务，用户可继续等待或更换输入。
- [ ] L3 上传/分析/生成失败保留上下文并提供恢复入口。
- [ ] 历史列表失败只影响历史区域，不阻断工作台编辑。

## 验证命令

```bash
pnpm e2e -- e2e/precision-glass-workspace.spec.ts
pnpm vitest --run src/components/workspace/__tests__/status-bar.test.tsx src/components/workspace/__tests__/workspace-canvas.test.tsx src/components/workspace/__tests__/error-display.test.tsx src/components/workspace/__tests__/output-settings.test.tsx src/components/workspace/__tests__/history-panel.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-04/AC-06/AC-07/AC-08、§6.2、§6.5、§6.6、§8.2
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/*`、`src/hooks/use-workspace-state.ts`
- **契约 / 数据对象**: `WorkspaceSessionState`、`ProductStatus`、`StatusCopy`
- **下游消费方**: FEAT-05 使用模板回到工作台后的加载体验依赖本功能的工作台状态呈现；模板浮层和变量向导的视觉统一由 FEAT-05 承接，FEAT-04 只保证工作台模板加载失败和状态入口。

## 风险与边界

- **执行顺序**: 先 E2E red，再页面布局和状态，再组件局部样式，最后测试。
- **验证失败排查方向**: 检查现有 E2E mock 文案、轮询状态、图片加载 mock、history query key 和 CSS grid 宽度。
- **允许修改的额外文件**: `e2e/helpers/workspace-actions.ts`、`e2e/helpers/mock-api.ts`，仅限新增 Precision Glass 工作台 helper。
- **暂停条件**: 如果需要改变 `useWorkspaceState` 状态枚举或 API 响应体，暂停并报告，因为架构要求业务链路不变。
- **E2E 不适用说明**: 不适用；本功能必须有工作台核心流程 E2E。
- **风险备注**: `src/app/workspace/page.tsx` 较长，改动时优先小步接线，避免误删现有流程。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 分析接口失败 | 保留参考图，展示重试分析和更换参考图 | todo |
| 生成接口失败 | 保留 Prompt / 设置，展示重新生成和返回编辑 | todo |
| 模板加载失败 | 不清空当前工作台，展示可恢复提示 | todo |
| 历史恢复失败 | 历史区域或当前区展示重试，不只 console | todo |
| 生成中历史面板打开 | 历史面板显示轻量处理中，不挤压主任务 | todo |
| 1280px 三列拥挤 | 保持主任务可用，局部滚动，不做移动端折叠 | todo |
