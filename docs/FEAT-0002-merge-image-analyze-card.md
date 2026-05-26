---
title: '合并 IMAGE 与 ANALYZE 工作台卡片'
type: 'feature'
created: '2026-05-26'
status: 'done'
context:
  - 'docs/design/DESIGN.md'
  - 'docs/09-2-实现计划-workspace布局与生成弹窗重构/FEAT-01-左右双区与分析区.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** 当前 workspace 左侧把 IMAGE 与 ANALYZE 渲染为两张独立卡片，空状态和分析完成状态被视觉边界拆散，参考图与分析结果不像一个连续工作对象。

**方案：** 将左侧 IMAGE 区和 ANALYZE 区整合为一张统一分析卡片，在同一卡片内承载上传空态、上传/分析进度、错误恢复、参考图预览和分析完成后的 Recipe 展示。

## 边界

**必须：** 统一卡片遵循 `docs/design/DESIGN.md` 的 Precision Glass 规则，只保留一个外层 `surface-panel` 边界；空状态和分析完成状态都必须在同一张卡片内成立。

**先问：** 如果需要改变上传、分析 API、workspace 状态机、Recipe 数据结构、生成流程或右侧编辑区职责，必须先获得人工批准。

**禁止：** 不新增后端能力；不改变自动触发分析、Retry、Replace Reference、生成弹窗或历史恢复语义；不在统一卡片内部再嵌套独立玻璃卡片边界。

## 需求变更

### 修改
- **REQ-1**: [左侧 `AnalysisPane` 分别渲染 `ReferencePreview` IMAGE 卡片和 `StyleBreakdownPanel` ANALYZE 卡片] → [左侧 `AnalysisPane` 渲染一张统一分析卡片，参考图与分析内容作为卡片内的区域呈现]。
- **REQ-2**: 空状态 SHALL 只显示一张统一分析卡片，卡片内提供上传入口和分析结果占位提示，不再出现独立 ANALYZE 空卡。
- **REQ-3**: 上传完成但分析未完成时 SHALL 在统一卡片内显示参考图预览、上传/分析进度、排队提示和分析失败恢复入口。
- **REQ-4**: 分析完成后 SHALL 在统一卡片内同时展示紧凑参考图预览和 `RecipeEditorWithDegrade` 风格拆解内容，保持 Recipe 字段、降级提示和错误处理不丢失。
- **REQ-5**: `ReferencePreview` 与 `StyleBreakdownPanel` 如继续存在，只能作为无外层卡片边界的内部区域组件；测试定位可保留，但视觉上不得再表现为两张独立卡片。

</frozen-after-approval>

## 代码地图

- `src/components/workspace/analysis-pane.tsx` -- 当前以 `gap-2` 纵向组合 `ReferencePreview` 与 `StyleBreakdownPanel`，是合并单卡的主要入口。
- `src/components/workspace/reference-preview.tsx` -- 当前拥有独立 `surface-panel`、固定高度和 IMAGE 标题，需要改为统一卡片内的参考图/上传区域。
- `src/components/workspace/style-breakdown-panel.tsx` -- 当前拥有独立 `surface-panel`、ANALYZE 标题、空态和完成态，需要改为统一卡片内的分析内容区域。
- `src/components/workspace/upload-zone.tsx` -- 当前承载上传、拖拽、校验、上传进度和替换确认，合并后应继续复用且不改变文件校验行为。
- `src/components/workspace/analysis-progress.tsx` -- 当前承载分析中和旧错误态，需要在统一卡片内部保持视觉和计时行为。
- `src/components/workspace/recipe-editor.tsx` -- `RecipeEditorWithDegrade` 承载完成态、L1/L3/L4 降级和分析错误，需要保持原有逻辑。
- `src/components/workspace/workspace-two-pane-layout.tsx` -- 左栏尺寸与 overflow 会影响单卡高度分配，需要确认统一卡片在空态和完成态都能滚动且不挤压右侧编辑区。
- `src/components/workspace/__tests__/upload-zone.test.tsx` -- 上传入口和文件校验回归参考。
- `src/components/workspace/__tests__/analysis-progress.test.tsx` -- 分析中和旧错误态回归参考。
- `src/components/workspace/__tests__/recipe-editor.test.tsx` -- Recipe 完成态内容回归参考。
- `e2e/workspace-layout.spec.ts` -- 当前断言 `reference-preview` 与 `style-breakdown-panel` 两张卡，需要改为断言统一卡片的空态、分析中、完成态。
- `e2e/workspace-two-pane.spec.ts` -- 当前断言参考图卡高度小于分析卡高度，需要改为断言左栏只有一个统一分析卡且内部区域职责保持。
- `e2e/workspace-generation-dialog.spec.ts` -- 生成后回到 workspace 的上下文断言需要同步新的统一卡片选择器。

## 任务清单

- [x] `src/components/workspace/analysis-pane.tsx` -- 将外层改为单个 `surface-panel` 统一分析卡，提供稳定 `data-testid="analysis-pane"` 和新的卡片内部布局。
- [x] `src/components/workspace/reference-preview.tsx` -- 移除独立卡片外观，保留上传区、参考图预览、Replace 行为和 `data-testid="reference-preview"` 作为内部区域。
- [x] `src/components/workspace/style-breakdown-panel.tsx` -- 移除独立卡片外观，保留分析进度、空态、错误、降级和 Recipe 完成态，作为统一卡片内的可滚动分析区域。
- [x] `src/components/workspace/upload-zone.tsx` -- 检查空态在统一卡片中的高度、文案和错误提示，必要时微调为不制造第二层卡片边界。
- [x] `src/components/workspace/workspace-two-pane-layout.tsx` -- 验证左栏统一卡片在 1280px、1440px 以及常见高度下不溢出、不遮挡底部悬浮生成窗口。
- [x] `e2e/workspace-layout.spec.ts` -- 更新空态、分析中、分析完成、替换重置和生成后上下文断言，覆盖统一卡片内状态变化。
- [x] `e2e/workspace-two-pane.spec.ts` -- 更新两栏布局断言，移除“两张左栏卡片高度对比”假设，改为检查单卡内部参考图与分析内容共存。
- [x] `e2e/workspace-generation-dialog.spec.ts` -- 更新生成完成/失败后回到 workspace 的卡片定位断言。
- [x] `src/components/workspace/__tests__/upload-zone.test.tsx`、`src/components/workspace/__tests__/analysis-progress.test.tsx`、`src/components/workspace/__tests__/recipe-editor.test.tsx` -- 运行并按需补充单卡内渲染相关单元测试。

## 验收标准

- Given 用户打开 `/workspace` 且未上传图片, when 页面进入空态, then 左侧只出现一张统一分析卡片，卡片内可见上传入口和分析占位提示。
- Given 用户选择合法图片, when 上传开始, then 统一分析卡片内显示上传进度，原有文件类型和 10MB 大小校验仍然生效。
- Given 图片上传完成且分析处理中, when 用户查看左侧区域, then 同一张卡片内可见参考图预览和分析进度或排队提示。
- Given 分析失败且错误可重试, when 用户查看左侧区域, then 同一张卡片内显示错误说明、Retry 入口，并按错误类型保留 Replace Reference 入口。
- Given 分析完成并返回完整 recipe, when 用户查看左侧区域, then 同一张卡片内同时可见参考图预览、Subject、Style、Lighting、Composition、Image Summary、Visual Keywords、Must Keep 和 Replaceable。
- Given 用户点击 Replace Reference, when workspace 重置完成, then 左侧回到统一卡片空态，不残留旧 recipe、旧参考图或第二张 ANALYZE 卡片。
- Given 用户生成图片并关闭结果弹窗, when 回到 workspace, then 统一分析卡片仍保留参考图和分析完成内容，右侧编辑区与底部悬浮生成窗口行为不变。
