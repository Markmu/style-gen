---
source: docs/09-1-架构文档-workspace布局与生成弹窗重构.md
created: 2026-04-30
---

# E2E 测试用例：Workspace 布局与生成弹窗重构

## 资产现状

- Playwright projects: `workspace` 使用 `AUTH_REQUIRED=false pnpm dev --port 3001`
- 现有相关 spec: `workspace-layout.spec.ts`, `workspace-degradation.spec.ts`, `template.spec.ts`
- 可复用 helpers: `uploadAndStartAnalysis`, `uploadAndCompleteAnalysis`, `mockGenerationCreate`, `mockGenerationPolling`
- 可复用 fixtures: `analysis-completed.json`, `generation-completed.json`

## FEAT-01：左右双区与分析区

| 用例 | 场景 | 操作 | 断言 | 目标 spec |
| --- | --- | --- | --- | --- |
| E2E-09-01 | 未上传空态布局稳定 | 进入 `/workspace` | 左侧分析区、参考图区、风格拆解区、右侧编辑区均存在 | `e2e/workspace-two-pane.spec.ts` |
| E2E-09-02 | 分析中布局稳定 | 上传测试图并进入分析中 | 左上参考图区和左下分析进度共存，右侧编辑区不消失 | `e2e/workspace-two-pane.spec.ts` |
| E2E-09-03 | 分析完成后参考图小占比 | 完成上传与分析 | 参考图在左上，风格拆解为左侧主内容，右侧编辑区存在 | `e2e/workspace-two-pane.spec.ts` |
| E2E-09-04 | 宽屏无旧三列漂移 | 1280px 和 1440px 打开完成态 | 不出现旧三列主布局，左右双区容器稳定 | `e2e/workspace-two-pane.spec.ts` |

## FEAT-02：合一编辑区与变量模式

| 用例 | 场景 | 操作 | 断言 | 目标 spec |
| --- | --- | --- | --- | --- |
| E2E-09-05 | 合一编辑区模式切换 | 分析完成后查看右侧 | 出现模板模式/文本模式切换，文本模式展示完整 Prompt | `e2e/workspace-unified-editor.spec.ts` |
| E2E-09-06 | 模板变量在正文外编辑 | 携带模板内容进入模板模式，填写变量 | 变量输入位于模板正文外，切到文本模式后渲染变量值 | `e2e/workspace-unified-editor.spec.ts` |
| E2E-09-07 | 草稿不因切换丢失 | 编辑模板、变量和文本后往返切换 | 模板原文、变量值、文本草稿保留 | `e2e/workspace-unified-editor.spec.ts` |

## FEAT-03：轻量生成区与生成弹窗

| 用例 | 场景 | 操作 | 断言 | 目标 spec |
| --- | --- | --- | --- | --- |
| E2E-09-08 | 生成进度进入弹窗 | 完成分析后点击生成 | 弹窗打开并展示生成进度，主工作台保持左右双区 | `e2e/workspace-generation-dialog.spec.ts` |
| E2E-09-09 | 生成完成结果在弹窗内 | 生成任务完成 | 弹窗展示生成结果，主区域不常驻结果图 | `e2e/workspace-generation-dialog.spec.ts` |
| E2E-09-10 | 关闭弹窗保留上下文 | 关闭生成结果弹窗 | 参考图、风格拆解、编辑区文本仍存在 | `e2e/workspace-generation-dialog.spec.ts` |
| E2E-09-11 | 负面提示 UI 移除且请求兼容 | 点击生成并捕获请求 | 页面不可见 Negative Prompt，生成请求 `negativePromptText` 为空字符串 | `e2e/workspace-generation-dialog.spec.ts` |
