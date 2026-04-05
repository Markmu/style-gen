---
task_id: "T02"
title: "决策面板与步骤组件"
dimension: frontend
phase: 2
status: done
depends_on: ["T01"]
---

# T02: 决策面板与步骤组件（前端）

## 任务概要

- **目标**: 创建右侧 DecisionPanel 容器组件，拆分 RecipeCard 为 RecipeStep（Step 1），集成 PromptEditor 为 Step 2，改造 GeneratePanel 为 OutputSettings（Step 3），实现步骤解锁规则和按钮文案随阶段变化
- **依赖**: T01（两段式布局骨架就位）
- **所属模块**: DecisionPanel / RecipeStep / OutputSettings
- **前置条件**: T01 完成，page.tsx 已有两栏布局和 StatusBar
- **不在范围**: 降级提示嵌入 Step 区域（T04）、画布相关组件（T03）、测试迁移（T05）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/decision-panel.tsx` | 右侧决策面板容器 |
| create | `src/components/workspace/recipe-step.tsx` | Step 1 风格拆解（RecipeSummary + RecipeDetail 展开/收起） |
| create | `src/components/workspace/output-settings.tsx` | Step 3 输出设置（从 GeneratePanel 改造） |
| modify | `src/app/workspace/page.tsx` | 右栏 placeholder 替换为 DecisionPanel |

## 实现规格

### 1. DecisionPanel 容器 (`decision-panel.tsx`)

DecisionPanel 是纯容器组件，组织 Step 1/2/3 的渲染。不抽象通用 StepPanel 容器（ADR-4 明确不做）。

```typescript
interface DecisionPanelProps {
  state: WorkspaceState;
  recipe: VisualRecipe | null;
  promptText: string;
  negativePromptText: string;
  isRecipeExpanded: boolean;
  degradation: DegradationState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  onPromptChange: (text: string) => void;
  onNegativePromptChange: (text: string) => void;
  onToggleRecipeExpanded: () => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
}
```

实现要点：

- 垂直排列三个 Step 区域，使用 `space-y-6` 间距
- 条件渲染逻辑下沉到此组件：
  - Step 1（RecipeStep）：`analyzing` / `analysis_ready` / `generating` / `generation_ready` 状态下渲染
  - Step 2（PromptEditor）：`analysis_ready` / `generating` / `generation_ready` 状态下渲染
  - Step 3（OutputSettings）：`analysis_ready` / `generating` / `generation_ready` 状态下渲染
- `analyzing` 状态下渲染 AnalysisProgress（复用现有组件）
- `idle` 且无 error 时渲染空态预览（三步说明文案：1.AI 分析风格 2.编辑生成指令 3.设置参数生成）

### 2. RecipeStep (Step 1) (`recipe-step.tsx`)

从现有 RecipeCard 拆分而来，新增 5 字段核心摘要视图。

```typescript
interface RecipeStepProps {
  recipe: VisualRecipe | null;
  isExpanded: boolean;
  state: WorkspaceState;
  onToggleExpanded: () => void;
}
```

实现要点：

- **默认视图**：RecipeSummary — 展示 5 个核心字段（主体/场景/光线/色彩/情绪），键值对形式
  - 使用架构文档 §7.2 `extractSummary` 逻辑：直接映射 `recipe.subject / scene / lighting / color / mood`
  - 字段标签：主体、场景、光线、色彩、情绪
- **展开视图**：RecipeDetail — 展示完整 VisualRecipe 全部字段（构图/镜头语言/质感/关键词/保留项/可替换项）
  - 复用现有 RecipeCard 的 `RecipeSection`、`FieldValue`、`TagList` 内部组件逻辑
- **展开/收起**：通过 `isExpanded` prop 控制，使用 CSS `grid-rows-[0fr]` / `grid-rows-[1fr]` 动画（复用现有 RecipeCard 的动画方案），动画时长 ≤ 300ms（架构 §8.1）
- **展开按钮文案**："展开完整配方" / "收起完整配方"
- Step 标题：`Step 1 · 风格拆解`
- `generation_ready` 状态下，Step 标题变为 `Step 1 · 本次生成参数`，同时 `isRecipeExpanded` 应自动重置为 `false`（架构 §4.1 "折叠为本次生成参数摘要"）。重置逻辑在 `useWorkspaceState.completeGeneration` action 中实现
- `RecipeSummary` 接口在本组件文件内部定义（仅此组件消费），使用架构 §7.2 的 `extractSummary` 映射逻辑
- 此任务**不处理**降级提示（L1/L3/L4），留给 T04

### 3. OutputSettings (Step 3) (`output-settings.tsx`)

从现有 GeneratePanel 改造而来，调整按钮文案逻辑。

```typescript
interface OutputSettingsProps {
  state: WorkspaceState;
  generationUnavailable: boolean;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
}
```

实现要点：

- 复用 GeneratePanel 的宽高比选择器和画质选择器逻辑（含 localStorage 持久化）
- 按钮文案随阶段变化（架构文档 §7.2）：
  - `analysis_ready` → "生成首版"
  - `generating` → "正在生成..."（loading 态，disabled）
  - `generation_ready` → "重新生成"
- Step 标题：`Step 3 · 输出设置`
- `generation_ready` 状态下，标题变为 `Step 3 · 再次生成`
- `generationUnavailable` 为 true 时按钮 disabled
- 此任务**不处理** L2 降级提示，留给 T04

### 4. PromptEditor 集成为 Step 2

PromptEditor 组件直接复用，不修改内部实现。在 DecisionPanel 中包裹时：

- 添加 Step 标题：`Step 2 · 生成指令`
- `generation_ready` 状态下，标题变为 `Step 2 · 继续调整指令`

### 5. page.tsx 更新

- 将右栏 placeholder 替换为 `<DecisionPanel />`
- 传递所有必需 props
- 移除 page.tsx 中已下沉到 DecisionPanel 的条件渲染逻辑（showRecipe / showPromptEditor / showGeneratePanel 等布尔计算）

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 RecipeStep 组件 | done | 5 字段摘要 + 完整配方展开/收起，复用 RecipeCard 内部组件 |
| 2 | 创建 OutputSettings 组件 | done | 从 GeneratePanel 改造，按钮文案随阶段变化 |
| 3 | 创建 DecisionPanel 容器 | done | 组织 Step 1/2/3、条件渲染下沉、空态预览 |
| 4 | 更新 page.tsx | done | 右栏引入 DecisionPanel，移除已下沉的条件逻辑 |
| 5 | 验证编译和类型检查 | done | `pnpm type-check && pnpm build` 通过 |

## 验证命令

```bash
pnpm type-check && pnpm lint && pnpm build
```

## 预期结果

1. 右侧面板展示三步决策结构：Step 1 风格拆解、Step 2 生成指令、Step 3 输出设置
2. Step 1 默认展示 5 字段核心摘要，点击可展开完整配方
3. Step 3 按钮文案在 analysis_ready / generating / generation_ready 下正确切换
4. idle 状态下面板展示空态预览文案
5. page.tsx 条件渲染逻辑已下沉到 DecisionPanel

## 交接上下文

- **架构章节**: ADR-3（渐进披露）、ADR-4（组件策略）、ADR-6（薄编排层）、§5.2（DecisionPanel / RecipeStep / OutputSettings 职责）、§7.2（RecipeSummary / GenerateButtonConfig）
- **相关代码**: `src/components/workspace/recipe-card.tsx`（拆分来源）、`src/components/workspace/generate-panel.tsx`（改造来源）、`src/components/workspace/prompt-editor.tsx`（直接复用）
- **契约 / 数据对象**: `VisualRecipe`、`RecipeSummary`、`AspectRatio`、`Quality`、`WorkspaceState`
- **提供给下游的契约摘要**:

```typescript
// DecisionPanel props（T04 需要在此基础上增加降级/错误 slot）
interface DecisionPanelProps {
  state: WorkspaceState;
  recipe: VisualRecipe | null;
  promptText: string;
  negativePromptText: string;
  isRecipeExpanded: boolean;
  degradation: DegradationState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  onPromptChange: (text: string) => void;
  onNegativePromptChange: (text: string) => void;
  onToggleRecipeExpanded: () => void;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
}

// RecipeStep props（T04 需要增加降级相关 props）
interface RecipeStepProps {
  recipe: VisualRecipe | null;
  isExpanded: boolean;
  state: WorkspaceState;
  onToggleExpanded: () => void;
}
```

## 执行指引

- **工具链**: pnpm, React 19, Tailwind CSS 4
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 RecipeStep 从 RecipeCard 复用的内部组件（RecipeSection / FieldValue / TagList）是否需要抽取为共享组件或直接内联、检查 OutputSettings 的 localStorage 读写逻辑是否从 GeneratePanel 正确迁移
- **允许修改的额外文件**: `src/components/workspace/generate-panel.tsx`（如需导出 AspectRatio / Quality 类型供 OutputSettings 使用）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- RecipeStep 与 RecipeCard 的拆分需要保证展开/收起动画流畅
- OutputSettings 从 GeneratePanel 改造时注意保留 localStorage 持久化逻辑
- PromptEditor 直接复用不修改，仅在外层添加 Step 标题包装

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| recipe 为 null 时 Step 1 展示 | RecipeStep 在 recipe 为 null 时不渲染摘要，由 DecisionPanel 条件控制 | done |
| analyzing 状态下面板内容 | 仅展示 AnalysisProgress，Step 2/3 不渲染 | done |
| generation_ready 状态下 Step 标题切换 | 三个 Step 标题均需切换文案 | done |
| 空状态下面板展示 | idle 且无 error 时展示三步说明文案预览 | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
