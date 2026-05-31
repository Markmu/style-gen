---
feat_id: "PLAN-01"
title: "三列骨架与模式切换"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# PLAN-01: 三列骨架与模式切换

## 功能概要

- **目标**: 将 Workspace 从双栏布局重构为三列骨架（Reference / Recipe / Prompt），创建 TopModeSwitcher 组件并嵌入 StatusBar，实现工作台状态到模式高亮的视图映射。
- **完成后可观察结果**: 进入 Workspace 页面后看到稳定的三列卡片布局（Reference 空态上传区 / Recipe 空态引导 / Prompt 空态引导），顶部状态栏显示 4 个模式标签（Analyze / Editing / Generate / Result），当前状态正确高亮对应标签。三列骨架在所有 WorkspaceState 下保持位置固定，不随状态切换改变列数。手动点击模式标签可切换高亮，但不改变工作台数据状态。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-07]
- **涉及架构模块**: WorkspaceThreeColumnLayout, TopModeSwitcher, StatusBar
- **前置条件**: 现有工作台页面、双栏布局和 StatusBar 正常运行
- **不在范围**: ReferenceCard 完整实现（上传流程、分析摘要）、RecipeCard 5 分类展示、PromptCard 编辑器集成、FloatingGenerateButton、HistoryStrip、HistoryDetailDialog

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/workspace-three-column-layout.tsx` | CSS Grid 三列布局容器，替代 WorkspaceTwoPaneLayout |
| create | `src/components/workspace/top-mode-switcher.tsx` | 4 阶段模式标签组件，纯视图映射（ADR-2） |
| create | `src/components/workspace/reference-card.tsx` | 参考图卡片壳（空态上传区 + 基本图片展示，不含分析摘要） |
| modify | `src/components/workspace/recipe-card.tsx` | 配方卡片壳（空态引导 + 骨架屏，不含 5 分类） |
| create | `src/components/workspace/prompt-card.tsx` | 提示词卡片壳（空态引导，不含编辑器） |
| modify | `src/components/workspace/status-bar.tsx` | 内部重组：左工作区名称 + 中嵌入 TopModeSwitcher + 右图标区 |
| modify | `src/app/workspace/page.tsx` | 替换 TwoPaneLayout 为 ThreeColumnLayout + 基本接线 |
| create | `src/components/workspace/__tests__/workspace-three-column-layout.test.tsx` | 三列布局组件测试 |
| create | `src/components/workspace/__tests__/top-mode-switcher.test.tsx` | 模式切换组件测试 |

## 实现规格

### 前端部分

#### 1. WorkspaceThreeColumnLayout

CSS Grid 三列布局容器，替代 WorkspaceTwoPaneLayout（ADR-1）。

- 使用 `grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(320px,1.2fr)]` 固定比例，Prompt 卡片略宽
- `gap-4`（16px 间距），三列等高约束（Grid stretch 默认行为）
- 接受 3 个 ReactNode props：`reference`、`recipe`、`prompt`
- 外层容器 `overflow-x-auto` 允许窄屏横向滚动
- `data-testid="workspace-three-column-layout"`

#### 2. TopModeSwitcher

4 阶段模式标签组件（ADR-2：纯视图映射，不引入独立 mode 状态）。

- 接受 props：`state: WorkspaceState`、`manualModeOverride: TopMode | null`、`onModeChange: (mode: TopMode) => void`
- 内部计算高亮标签：优先 manualModeOverride，否则使用 `stateToMode` 映射表
- 映射规则：`idle|uploading|analyzing` → analyze，`analysis_ready` → editing，`generating` → generate，`generation_ready` → result，`history_restored` → editing
- 4 个胶囊形按钮：Analyze（绿色）/ Editing（紫色）/ Generate（橙色）/ Result（绿色）
- 选中态使用对应颜色填充，非选中态浅色背景
- 可用条件：Analyze 始终可点击；Editing 在分析完成后可点击；Generate 在提示词非空时可点击；Result 在生成完成后可点击
- 不可点击标签显示浅灰且无 hover 效果
- 点击标签调用 `onModeChange(mode)` 回调

#### 3. ReferenceCard（基础壳）

参考图卡片基础实现，仅含空态、上传态和基本图片展示。

- 空态：拖拽/点击上传区，虚线边框 + 引导文案（复用 upload-zone.tsx 的视觉模式）
- 上传中：显示进度条
- 有图态：全宽图片展示（不含分析摘要，PLAN-02 补充）
- 接受 props：`state`、`referenceImageUrl`、`isUploading`、`uploadProgress`、`onFileSelected`、`onReplace`
- 卡片头部：标题"Reference" + 帮助图标 + "更换图片"按钮（有图时显示）

#### 4. RecipeCard（基础壳修改）

修改现有 recipe-card.tsx，调整为独立三列卡片壳。

- 空态："上传参考图以生成视觉配方"引导文案
- 分析中：骨架屏加载态
- 有数据态：卡片头部（标题"Visual Recipe" + 帮助图标）（不含 5 分类，PLAN-02 补充）
- 接受 props：`state`、`recipe: VisualRecipe | null`
- `data-testid="recipe-card"`

#### 5. PromptCard（基础壳）

提示词卡片基础实现，仅含空态和加载态。

- 空态："分析完成后将自动生成提示词"引导文案
- 有数据态：卡片头部（标题"Prompt" + 帮助图标）（不含编辑器，PLAN-03 补充）
- 接受 props：`state`、`promptText: string`、`onSaveTemplate?: (content: string) => void`（仅用于保留既有 TemplateSaveDialog 入口）
- `data-testid="prompt-card"`

#### 6. StatusBar 重组

修改现有 StatusBar，内部布局重组。

- 左侧保留工作区名称（粗体）
- 中间嵌入 TopModeSwitcher
- 右侧保留现有图标区（帮助图标/品牌标识/用户头像）
- 新增 props：`state`（透传给 TopModeSwitcher）、`manualModeOverride`、`onModeChange`
- 风格下拉选择器预留插槽但不渲染
- 移除现有按状态切换 label/description 的逻辑，由 TopModeSwitcher 承担阶段指示

#### 7. page.tsx 布局替换

重构 workspace/page.tsx 的布局编排。

- 移除 WorkspaceTwoPaneLayout，改用 WorkspaceThreeColumnLayout
- 移除 AnalysisPane 和 EditingPane 直接引用，改为 ReferenceCard / RecipeCard / PromptCard
- 新增 `manualModeOverride: TopMode | null` state，初始值 null
- 新增 `handleModeChange` 回调：设置 manualModeOverride（手动切换时）
- StatusBar 传入 `state`、`manualModeOverride`、`onModeChange`
- ReferenceCard 传入 `state`、`referenceImageUrl`、`isUploading`、`uploadProgress`、`onFileSelected`、`onReplace`
- RecipeCard 传入 `state`、`recipe`
- PromptCard 传入 `state`、`promptText`
- 状态变化时清除 manualModeOverride（在 useEffect 中检测 state 变化时重置）
- 保留现有 GenerateHistoryBar（PLAN-04 替换）
- 保留现有 GenerationDialog 和 TemplateSaveDialog
- 现有 hooks（useWorkspaceState, useUpload, useAnalysis, useGeneration, useHistoryRestore）和回调函数不变

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写三列布局和模式切换组件测试 | frontend | done | 覆盖布局渲染、三列比例、模式高亮映射、手动覆盖 |
| 2 | 创建 WorkspaceThreeColumnLayout | frontend | done | CSS Grid 三列布局容器 |
| 3 | 创建 TopModeSwitcher | frontend | done | 4 阶段标签 + 可用条件 + 手动覆盖 |
| 4 | 创建 ReferenceCard 基础壳 | frontend | done | 空态上传区 + 基本图片展示 |
| 5 | 修改 RecipeCard 为基础壳 | frontend | done | 空态引导 + 骨架屏 |
| 6 | 创建 PromptCard 基础壳 | frontend | done | 空态引导文案 |
| 7 | 重组 StatusBar 嵌入 TopModeSwitcher | frontend | done | 左中右三区布局 |
| 8 | 重构 page.tsx 布局编排 | frontend | done | 替换 TwoPaneLayout + manualModeOverride state + 卡片接线 |
| 9 | 类型检查和构建验证 | frontend | done | pnpm type-check && pnpm build |

## 验收标准

### 功能验收

- [x] AC-01 进入 Workspace 页面后看到三列卡片（Reference / Recipe / Prompt），各列在所有 WorkspaceState 下位置固定
- [x] AC-01 三列布局比例遵循 1:1:1.2（Prompt 略宽），卡片间距 16px
- [x] AC-07 顶部 TopModeSwitcher 正确高亮当前状态对应的模式标签（idle/uploading/analyzing → Analyze，analysis_ready → Editing，generating → Generate，generation_ready → Result）
- [x] AC-07 手动点击模式标签切换高亮，但不改变 WorkspaceState
- [x] 空态下三列卡片均显示引导文案
- [x] E2E-TDD：三列骨架布局渲染 + 模式标签切换（`e2e/workspace-three-column-layout.spec.ts`，red 先失败，green 后通过）

### 降级回归验收

> 架构 §8.2 降级策略在新的三列布局结构中正确呈现。

- [x] L4 全局降级（sessionStorage 损坏 → 回到 idle 状态）在新布局中正常工作
- [x] 上传中/分析中状态下的三列骨架保持稳定，无布局抖动

### 性能验收（架构 §8.1 目标）

- [x] 工作台首屏渲染 <1s（三列骨架 + 空态引导）（production shell visible 抽样中位数 821ms，见 `docs/e2e/evidence/PLAN-01-e2e-green-20260531.md`）
- [x] 三列布局状态切换无布局抖动（E2E 几何断言 + 浏览器首屏检查通过；CLS DevTools 数值待 review 阶段抽样）

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/workspace-three-column-layout.test.tsx src/components/workspace/__tests__/top-mode-switcher.test.tsx
pnpm type-check
pnpm build
pnpm e2e -- e2e/workspace-three-column-layout.spec.ts
```

## 交接上下文

- **架构章节**: §4.1, §4.2（WorkspaceThreeColumnLayout, TopModeSwitcher, StatusBar）, §5 ADR-1, ADR-2, §6.1, §7.2（TopMode, ManualModeOverride）, §7.4
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/workspace-two-pane-layout.tsx`、`src/components/workspace/status-bar.tsx`、`src/components/workspace/recipe-card.tsx`
- **契约 / 数据对象**: `TopMode`、`ManualModeOverride`、`WorkspaceState`
- **下游消费方**: PLAN-02 在 ReferenceCard 和 RecipeCard 中增加完整功能；PLAN-03 在 PromptCard 中增加编辑器和参数；PLAN-04 替换 GenerateHistoryBar 为 HistoryStrip

## 风险与边界

- **执行顺序**: 按 Task 列表顺序执行。先创建布局和 TopModeSwitcher 组件（Task 2-3），再创建卡片壳（Task 4-6），再改 StatusBar（Task 7），最后改 page.tsx（Task 8）
- **验证失败排查方向**: 检查 CSS Grid 类名、TopModeSwitcher 的 stateToMode 映射、StatusBar 布局 flex/grid 设置、page.tsx 的 props 传递
- **允许修改的额外文件**: `src/app/globals.css`（如需新增三列布局 CSS 变量）
- **暂停条件**: 如果需要新增全局状态管理库或修改后端 API，停止并请求确认
- **E2E 不适用说明**: 不适用，本功能有用户可观察行为
- **风险备注**: 替换布局时现有 AnalysisPane 和 EditingPane 暂时保留为未使用代码，后续 PLAN-02/03 完成后清理

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 窄屏（<1024px） | 允许横向滚动，不回退双栏 | done |
| sessionStorage 损坏 | 静默清理，回到 idle 状态 | done |
| 手动切换模式后状态变化 | manualModeOverride 被清除，恢复自动映射 | done |
| TopModeSwitcher 不可点击标签 | 显示浅灰无 hover，点击无响应 | done |
