---
title: 'Workspace 底部悬浮生成窗口'
type: 'feature'
created: '2026-05-24'
status: 'done'
context:
  - 'docs/design/DESIGN.md'
  - 'docs/09-2-实现计划-workspace布局与生成弹窗重构/FEAT-03-轻量生成区与生成弹窗.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** 当前 GENERATE 操作固定嵌在 workspace 右侧编辑区底部，像普通面板而不是创作过程中的悬浮行动入口，视觉层级不符合用户希望的底部居中对话框感。

**方案：** 在 workspace 主画布下方居中创建一个半透明玻璃质感的悬浮窗口，并把输出参数选择、不可用原因、重试入口和 GENERATE 按钮集成到这个窗口中。

## 边界

**必须：** 悬浮窗口位于 workspace 主区域底部居中，使用 `docs/design/DESIGN.md` 的玻璃层级、半透明背景、backdrop blur、ghost border 和轻阴影规则；保留现有生成请求体、轮询、生成状态、失败恢复和完成结果弹窗行为。

**先问：** 如果需要改动 `/api/generation`、数据库字段、生成结果弹窗语义，或把历史面板/状态栏重新布局，必须先获得人工批准。

**禁止：** 不新增后端能力；不把生成结果图塞进底部悬浮窗口；不引入重型阴影、实色灰边框、营销式说明文案或与设计系统冲突的装饰元素。

## 需求变更

### 修改
- **REQ-1**: [GENERATE 操作位于 `EditingPane` 内的底部常驻面板] → [GENERATE 操作位于 workspace 主区域底部居中的悬浮半透明窗口]。
- **REQ-2**: 悬浮窗口 SHALL 承载当前 `LightGeneratePanel` 的核心能力：Aspect Ratio、Quality、不可用原因、生成错误恢复入口和 GENERATE 按钮。
- **REQ-3**: 悬浮窗口 SHALL 覆盖在两栏 workspace 内容之上，但不得遮挡状态栏、历史面板主要内容或生成结果对话框。
- **REQ-4**: `EditingPane` SHALL 只承载 prompt/template 编辑能力，不再通过 `generatePanel` 插槽显示生成操作区。
- **REQ-5**: 点击 GENERATE 后 SHALL 沿用现有 `handleGenerate` 流程：使用 resolved prompt、`negativePromptText: ""`、当前 aspect ratio 和 quality，并打开现有 `GenerationDialog` 展示生成中/完成/失败。

</frozen-after-approval>

## 代码地图

- `src/app/workspace/page.tsx` -- 当前组装 `WorkspaceTwoPaneLayout`、`EditingPane`、`LightGeneratePanel` 和 `GenerationDialog`，需要把生成入口从编辑区移动到主区域悬浮层。
- `src/components/workspace/editing-pane.tsx` -- 当前通过 `generatePanel` prop 在编辑器下方渲染生成面板，需要移除或收窄该插槽职责。
- `src/components/workspace/light-generate-panel.tsx` -- 当前生成控制面板，包含参数、不可用原因、重试和按钮逻辑，需要改为可放入悬浮窗口的紧凑内容或被新悬浮组件复用。
- `src/components/workspace/workspace-two-pane-layout.tsx` -- 当前两栏布局容器，需要确保底部悬浮层有可定位父层且内容不会被永久挤压。
- `src/app/globals.css` -- 已有 `glass-panel`、`surface-floating`、`shadow-glass`、按钮 tokens，可复用或微调悬浮窗口类名。
- `src/components/workspace/__tests__/light-generate-panel.test.tsx` -- 覆盖生成参数和不可用状态，需要随组件结构调整。
- `src/components/workspace/__tests__/generation-dialog.test.tsx` -- 验证生成结果弹窗，需作为不回归参考。
- `e2e/workspace-layout.spec.ts` -- 覆盖 workspace 布局和生成入口，需要增加底部悬浮窗口定位/可用性断言。
- `e2e/workspace-generation-dialog.spec.ts` -- 覆盖生成流程和结果弹窗，需要更新生成入口定位选择器但保持行为断言。

## 任务清单

- [x] `src/components/workspace/floating-generate-window.tsx` -- 新建悬浮窗口组件，复用生成参数、不可用原因、重试和 GENERATE 行为，提供 `data-testid="floating-generate-window"`。
- [x] `src/components/workspace/light-generate-panel.tsx` -- 将生成控制内容抽成可复用的紧凑内容，或迁移到 `floating-generate-window.tsx` 后保留兼容导出。
- [x] `src/components/workspace/editing-pane.tsx` -- 移除 `generatePanel` prop 和底部渲染，让编辑区只管理 `UnifiedPromptEditor`。
- [x] `src/app/workspace/page.tsx` -- 在 workspace 主内容容器内添加 bottom-center overlay 渲染悬浮生成窗口，并接入现有 `generationParams`、`handleGenerate`、`handleGenerateRetry`。
- [x] `src/components/workspace/workspace-two-pane-layout.tsx` -- 如需要，为底部悬浮层预留合理安全距离或定位上下文，避免遮挡编辑器关键输入。
- [x] `src/app/globals.css` -- 已确认无需新增样式，悬浮窗口复用现有 `glass-panel`、按钮和 surface tokens。
- [x] `src/components/workspace/__tests__/light-generate-panel.test.tsx` -- 更新为悬浮窗口或控制内容测试，覆盖参数切换、禁用原因、生成回调和重试入口。
- [x] `src/components/workspace/__tests__/editing-pane.test.tsx` -- 如已有或新增测试，断言 `EditingPane` 不再要求或渲染生成面板插槽。
- [x] `e2e/workspace-layout.spec.ts` -- 增加悬浮窗口在空态/分析完成态可见、位于底部居中、按钮启用/禁用的端到端断言。
- [x] `e2e/workspace-generation-dialog.spec.ts` -- 更新 GENERATE 点击入口到悬浮窗口，并确认生成结果仍进入现有 `GenerationDialog`。

## 验收标准

- Given 用户打开 `/workspace`, when 页面处于空态或分析完成态, then 页面主区域底部居中可见 `floating-generate-window`，且该窗口呈半透明玻璃质感。
- Given 分析尚未完成或 prompt 为空, when 用户查看底部悬浮窗口, then GENERATE 按钮禁用并展示现有短原因文案。
- Given 分析完成且 prompt 已解析, when 用户在悬浮窗口切换 Aspect Ratio 或 Quality 并点击 GENERATE, then 请求仍携带当前参数、resolved prompt 和 `negativePromptText: ""`。
- Given 用户点击 GENERATE, when 生成任务进入 processing/completed/failed, then 状态仍由现有 `GenerationDialog` 展示，底部悬浮窗口不展示生成结果图。
- Given 用户关闭生成完成或失败对话框, when 回到 workspace, then 参考图、风格拆解、编辑内容、输出参数和底部悬浮窗口状态保持不丢失。
- Given 用户查看右侧编辑区, when 悬浮窗口存在, then `EditingPane` 内不再出现常驻 `LightGeneratePanel` 生成面板。
- Given 历史面板在右侧打开, when 悬浮窗口显示在底部居中, then 它不遮挡历史面板主要列表，也不压缩两栏布局宽度。
