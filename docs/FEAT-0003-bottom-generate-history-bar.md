---
title: 'Workspace 底部长条 Generate 与历史整合'
type: 'feature'
created: '2026-05-26'
status: 'done'
context:
  - 'docs/design/DESIGN.md'
  - 'docs/FEAT-0001-floating-generate-window.md'
  - 'docs/FEAT-0002-merge-image-analyze-card.md'
  - 'docs/09-2-实现计划-workspace布局与生成弹窗重构/FEAT-03-轻量生成区与生成弹窗.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** 当前 GENERATE 仍是 workspace 主内容上的底部悬浮窗口，历史生成记录则在 workspace 最右侧独立抽屉中，两个创作后续动作被拆散且占用了额外右侧空间。

**方案：** 将 GENERATE 改造成 workspace 最下方的长条形区块，并把历史生成记录整合为该区块内的横向历史区域；移除独立右侧历史抽屉，并禁止恢复成参考图所示主内容下方的独立 History 条。

## 边界

**必须：** 底部 Generate 区块必须常驻在 workspace 主区域最下方，横向承载生成参数、生成按钮、错误恢复入口和历史缩略图；生成请求体、轮询、结果弹窗、历史恢复语义和历史列表 API 必须保持兼容。

**先问：** 如果需要改动 `/api/generation`、数据库 schema、历史返回字段、生成结果弹窗语义，或新增与当前 Generate/History 无关的 workspace 导航结构，必须先获得人工批准。

**禁止：** 不新增后端能力；不保留 `HistoryPanel` 作为 workspace 最右侧独立抽屉；不新增参考图中主内容下侧那种独立 History shelf；不把生成结果图直接塞进主编辑区或替代现有 `GenerationDialog`。

## 需求变更

### 修改
- **REQ-1**: [GENERATE 作为 `FloatingGenerateWindow` 以 overlay 形式悬浮在两栏内容底部居中] → [GENERATE 作为 workspace 底部常驻长条区块，宽度随中央 workspace 内容延展]。
- **REQ-2**: [历史生成记录由 `HistoryPanel` 在 workspace 最右侧以收起/展开抽屉呈现] → [历史生成记录在底部 Generate 区块内以横向缩略图区域呈现，并支持恢复历史生成]。
- **REQ-3**: 底部 Generate 区块 SHALL 保留现有 Aspect Ratio、Quality、生成禁用原因、generation error 的 Resume Generation、GENERATE/GENERATING 状态和 `onGenerate(params)` 行为。
- **REQ-4**: 历史缩略图区域 SHALL 复用 `useHistoryList` 和 `useHistoryRestore` 语义，生成完成后仍通过 `generation-history` query invalidation 刷新列表。
- **REQ-5**: workspace SHALL 不再因为右侧历史抽屉占用宽度而压缩中央两栏布局；底部 Generate 区块出现时，两栏内容应通过布局预留空间避免被遮挡。
- **REQ-6**: 底部 Generate 区块 SHALL 在空态、分析中、分析完成、生成中、生成完成、历史恢复态都可见；历史为空、加载中、加载失败和加载更多状态必须在该区块内成立。

</frozen-after-approval>

## 代码地图

- `src/app/workspace/page.tsx` -- 当前在主内容 overlay 中渲染 `FloatingGenerateWindow`，并在最外层右侧渲染 `HistoryPanel`；需要把两者组合进底部 Generate 区块并移除右侧抽屉占位。
- `src/components/workspace/floating-generate-window.tsx` -- 当前生成控制组件宽度限制为 `max-w-[640px]` 且以 floating/embedded variant 区分；需要改造成可横向铺开的底部长条或迁移到新组件。
- `src/components/workspace/history-panel.tsx` -- 当前维护右侧抽屉展开状态、纵向网格和无限滚动 sentinel；需要抽出/改造成 Generate 区块内部的横向历史缩略图区域。
- `src/hooks/use-history-list.ts` -- 历史列表查询 hook，当前通过 `enabled` 延迟请求；底部内嵌历史区域需要继续复用它并保持分页/刷新能力。
- `src/hooks/use-history-restore.ts` -- 历史恢复 hook，恢复历史生成时仍需回填 result、recipe、prompt、negative prompt 和 analysisTaskId。
- `src/components/workspace/workspace-two-pane-layout.tsx` -- 当前两栏布局占满可用高度，底部常驻 Generate 区块需要父级 flex 分配后不被覆盖。
- `src/app/globals.css` -- 已有 `glass-panel`、`surface-panel`、按钮与 surface tokens；需要按 `docs/design/DESIGN.md` 为底部长条和横向历史缩略图使用克制玻璃层级。
- `src/components/workspace/__tests__/floating-generate-window.test.tsx` -- 当前断言 floating class、`max-w-[640px]` 和生成参数行为；需要改为底部长条行为/样式断言。
- `src/components/workspace/__tests__/history-panel.test.tsx` -- 当前断言右侧抽屉默认收起、展开宽度和纵向内容；需要改为底部区块内历史区域加载、空态、错误、点击恢复和加载更多断言。
- `e2e/workspace-layout.spec.ts` -- 当前断言 `floating-generate-window` 底部居中 overlay；需要改为断言底部长条 Generate 区块、历史区域和右侧抽屉不存在。
- `e2e/workspace-generation-dialog.spec.ts`、`e2e/happy-path.spec.ts`、`e2e/edge-cases.spec.ts`、`e2e/degradation.spec.ts`、`e2e/analysis-template-autofill.spec.ts` -- 多处通过 `floating-generate-window` 定位 GENERATE 按钮；需要更新稳定选择器或保持兼容测试 id。

## 任务清单

- [x] `src/components/workspace/floating-generate-window.tsx` -- 改造为底部长条 Generate 区块组件，或新建 `src/components/workspace/generate-history-bar.tsx` 并让旧组件只保留兼容导出。
- [x] `src/components/workspace/history-panel.tsx` -- 移除右侧抽屉 UI，抽出可内嵌的横向历史区域，覆盖加载中、失败、空态、生成中占位、缩略图恢复和加载更多。
- [x] `src/app/workspace/page.tsx` -- 删除最外层右侧 `HistoryPanel` 渲染，把 Generate 区块作为中央 workspace flex column 的底部 `shrink-0` 区域接入 `generationParams`、`handleGenerate`、`handleGenerateRetry`、`handleHistoryRestore`。
- [x] `src/components/workspace/workspace-two-pane-layout.tsx` -- 调整两栏容器高度和 padding，使主内容与底部 Generate 区块自然分层，不再依赖 absolute overlay 避让。
- [x] `src/app/globals.css` -- 为底部长条、历史缩略图、当前生成提示和横向滚动状态补充必要样式，遵守 Precision Glass 的 ghost border、轻阴影和非硬分隔规则。
- [x] `src/components/workspace/__tests__/floating-generate-window.test.tsx` -- 更新为底部长条 Generate 区块测试，覆盖宽向布局、参数切换、禁用原因、生成回调和 Resume Generation。
- [x] `src/components/workspace/__tests__/history-panel.test.tsx` -- 更新为内嵌历史区域测试，确认不再有 Expand/Collapse history 右抽屉语义，并覆盖点击缩略图触发 `onRestore(id)`。
- [x] `e2e/workspace-layout.spec.ts` -- 更新空态、分析完成、生成完成和历史恢复布局断言，确认底部 Generate 区块位于 workspace 最下方、横向可见，且右侧历史抽屉不存在。
- [x] `e2e/workspace-generation-dialog.spec.ts`、`e2e/happy-path.spec.ts`、`e2e/edge-cases.spec.ts`、`e2e/degradation.spec.ts`、`e2e/analysis-template-autofill.spec.ts` -- 保留 `floating-generate-window` 兼容选择器并验证生成请求、弹窗和失败恢复断言不变。

## 验收标准

- Given 用户打开 `/workspace`, when 页面处于空态, then workspace 中央区域底部可见一个横向长条 Generate 区块，且页面最右侧不再出现可展开的 History 抽屉。
- Given 用户查看底部 Generate 区块, when 历史列表正在加载、为空或加载失败, then 对应状态在该区块内展示，不出现独立的主内容下方 History shelf 或右侧抽屉。
- Given 分析尚未完成或 prompt 为空, when 用户查看底部 Generate 区块, then GENERATE 按钮禁用并展示现有短原因文案，历史区域仍可用于查看/恢复已有生成。
- Given 分析完成且 prompt 已解析, when 用户在底部 Generate 区块切换 Aspect Ratio 或 Quality 并点击 GENERATE, then 请求仍携带当前参数、resolved prompt 和 `negativePromptText: ""`。
- Given 生成任务完成, when query cache 被刷新, then 底部 Generate 区块内的历史缩略图区域刷新并可展示新生成记录。
- Given 用户点击底部 Generate 区块内的历史缩略图, when 历史详情恢复成功, then workspace 进入 `history_restored` 语义并回填 result image、recipe、prompt、negative prompt 和 analysisTaskId。
- Given 用户生成图片或恢复历史后关闭结果弹窗, when 回到 workspace, then 参考图、分析内容、编辑内容、底部 Generate 参数和历史区域均保持可见且不互相遮挡。
- Given viewport 为常见桌面宽度, when 底部 Generate 区块显示历史缩略图和生成按钮, then 文本、按钮、缩略图不重叠，主两栏内容不会被底部区块覆盖。
