---
source: docs/11-Workspace三栏工作台重构/11-1-架构文档-Workspace三栏工作台重构.md
created: 2026-05-31
---

# E2E 测试用例：Workspace 三栏工作台重构

## 资产现状

- Playwright projects: `workspace` 使用 `AUTH_REQUIRED=false pnpm dev --port 3001`，本期工作台测试默认走 mock API。
- 现有相关 spec: `workspace-layout.spec.ts`, `workspace-two-pane.spec.ts`, `workspace-generation-dialog.spec.ts`, `workspace-degradation.spec.ts`, `analysis-template-autofill.spec.ts`。
- 可复用 helpers: `mockAuthSession`, `mockUploadPresign`, `mockAnalysisCreate`, `mockAnalysisPolling`, `mockAnalysisPollingSequence`, `mockGenerationCreate`, `mockGenerationPolling`, `loadFixture`。
- 可复用 fixtures: `analysis-completed.json`, `generation-completed.json`, `analysis-degraded.json`, `test-image.png`。

## PLAN-01：三列骨架与模式切换

> 来源：架构文档 §6.1、§7.4、§8.2；实现计划 PLAN-01 验收 AC-01、AC-07。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-1.1 | 空态进入工作台渲染三列骨架 | Happy | 无参考图、无持久化工作台状态 | 打开 `/workspace` | `WorkspaceThreeColumnLayout` 可见；Reference / Visual Recipe / Prompt 三张卡片均可见；旧 two-pane 主布局不再渲染；Analyze 模式高亮 | `e2e/workspace-three-column-layout.spec.ts` |
| TC-1.2 | 上传/分析中三列位置保持稳定 | Happy | mock 上传成功，分析轮询返回 `processing` | 上传测试图片 | 三列骨架仍可见；Reference / Recipe / Prompt 卡片不消失；Analyze 模式保持高亮 | `e2e/workspace-three-column-layout.spec.ts` |
| TC-1.3 | 分析完成后自动映射到 Editing | Happy | mock 分析轮询返回 `completed` + prompt/recipe | 上传测试图片并等待分析完成 | 三列骨架仍可见；Editing 模式高亮；Prompt 卡片仍处于第三列 | `e2e/workspace-three-column-layout.spec.ts` |
| TC-1.4 | 手动点击模式标签只切换高亮 | Happy | 已完成分析，Prompt 非空 | 点击 Analyze，再点击 Generate | `aria-pressed` 高亮随点击切换；工作台仍保留已分析内容，不重置参考图/Prompt | `e2e/workspace-three-column-layout.spec.ts` |
| TC-1.5 | 桌面视口三列比例稳定 | Edge | 无参考图 | 分别以 1280px、1440px 打开工作台 | Reference 与 Recipe 宽度接近；Prompt 略宽；卡片间距约 16px；三列不折行 | `e2e/workspace-three-column-layout.spec.ts` |
| TC-1.6 | sessionStorage 损坏时回到 idle 三列空态 | 降级 | sessionStorage 写入非法 JSON | 打开 `/workspace` | 损坏状态被清理；三列骨架仍渲染；Analyze 模式高亮；Reference 卡片显示上传空态 | `e2e/workspace-three-column-layout.spec.ts` |

### 需要新增的 mock / fixture

- 无。复用现有上传、分析轮询 mock 和 `analysis-completed.json`。

### 需要新增的源码 data-testid

- `src/components/workspace/workspace-three-column-layout.tsx` -> `data-testid="workspace-three-column-layout"`
- `src/components/workspace/reference-card.tsx` -> `data-testid="reference-card"`
- `src/components/workspace/recipe-card.tsx` -> `data-testid="recipe-card"`
- `src/components/workspace/prompt-card.tsx` -> `data-testid="prompt-card"`
- `src/components/workspace/top-mode-switcher.tsx` -> `data-testid="top-mode-switcher"`
- TopModeSwitcher 四个按钮使用可访问名称 `Analyze` / `Editing` / `Generate` / `Result`，并通过 `aria-pressed` 暴露当前高亮。

## PLAN-02：参考图与分析摘要卡片

> 来源：架构文档 §6.2、§6.3；实现计划 PLAN-02 验收 AC-02、AC-03、AC-08。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-2.1 | ReferenceCard 上传并展示参考图 | Happy | PLAN-01 已完成 | 上传测试图片并完成分析 | Reference 卡片展示参考图和更换入口 | `e2e/workspace-reference-recipe.spec.ts` |
| TC-2.2 | 分析完成后展示 5 维度摘要 | Happy | mock 分析 completed | 等待分析完成 | Reference 卡片展示 Style / Material / Lighting / Composition / Mood 摘要 | `e2e/workspace-reference-recipe.spec.ts` |
| TC-2.3 | RecipeCard 展示 5 分类模块 | Happy | mock recipe 完整 | 等待分析完成 | Visual Recipe 卡片展示 Structure / Materials / Lighting / Color Palette / Mood & Atmosphere | `e2e/workspace-reference-recipe.spec.ts` |
| TC-2.4 | 分析失败时卡片独立降级 | Error | mock 分析 API 返回可重试错误 | 上传测试图片 | Reference 保留图片和失败态；Recipe/Prompt 显示分析失败或重试，不影响三列骨架 | `e2e/workspace-reference-recipe.spec.ts` |

## PLAN-03：提示词编辑与浮动生成

> 来源：架构文档 §6.4、§6.5、§8.2；实现计划 PLAN-03 验收 AC-04、AC-05、AC-08。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-3.1 | PromptCard 承载编辑器和参数 | Happy | PLAN-01/02 已完成，分析 completed | 编辑 Prompt 和参数 | Prompt 文本、负向提示、宽高比/分辨率/引导强度控件在 Prompt 卡片内 | `e2e/workspace-prompt-generate.spec.ts` |
| TC-3.2 | 浮动生成按钮可触发生成 | Happy | Prompt 非空 | 点击右侧浮动 Generate | 创建生成任务，GenerationDialog 展示进度 | `e2e/workspace-prompt-generate.spec.ts` |
| TC-3.3 | Enter 快捷键等效生成 | Happy | Prompt 非空且焦点不在多行编辑冲突状态 | 按 Enter | 创建生成任务，按钮进入 loading | `e2e/workspace-prompt-generate.spec.ts` |
| TC-3.4 | 生成失败不清空编辑上下文 | Error | mock generation 返回 SERVICE_UNAVAILABLE | 点击 Generate | Generate 按钮恢复可用；Prompt 内容不丢；TopModeSwitcher 切回 Editing | `e2e/workspace-prompt-generate.spec.ts` |

## PLAN-04：历史条与回溯

> 来源：架构文档 §6.6；实现计划 PLAN-04 验收 AC-06。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-4.1 | 生成完成后历史条新增缩略图 | Happy | PLAN-03 已完成，mock generation completed | 完成一次生成 | HistoryStrip 左侧新增结果缩略图 | `e2e/workspace-history-strip.spec.ts` |
| TC-4.2 | 点击历史缩略图打开详情 | Happy | mock 历史列表有记录 | 点击缩略图 | HistoryDetailDialog 展示结果图、Prompt 快照和参数 | `e2e/workspace-history-strip.spec.ts` |
| TC-4.3 | 恢复历史到工作台 | Happy | 历史详情已打开 | 点击恢复到工作台 | 三列卡片填充历史数据；TopModeSwitcher 高亮 Editing | `e2e/workspace-history-strip.spec.ts` |
| TC-4.4 | 查看全部进入历史页 | Edge | 历史条可见 | 点击查看全部 | 路由进入 `/history` | `e2e/workspace-history-strip.spec.ts` |

## 汇总

| 类型 | 数量 |
|------|------|
| Happy Path | 13 |
| Error Path | 2 |
| Edge | 2 |
| 降级场景 | 1 |
| 合计 | 18 |
