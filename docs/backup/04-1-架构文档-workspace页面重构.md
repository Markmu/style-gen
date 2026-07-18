---
workflow_type: arch-gen
status: review_ready
last_step: 6
completed_steps: [1, 2, 3, 4, 5, 6]
input_documents: ["docs/04-0-需求设计-workspace页面重构.md"]
open_questions: []
---

# 04-1 架构文档：Workspace 页面重构

_本文件只保留当前版本真正影响实现的架构决策、边界和契约；DDL、目录树、环境变量、实施故事等内容默认不放入正文。_

## 1. 系统摘要

Workspace 页面重构将现有三栏并列布局升级为**两段式专业工作台**（内容画布 + 决策面板），核心闭环：**Upload → Analyze → Render → Iterate**。

本期是纯前端信息架构重构，不涉及后端 API 变更或数据模型变更。目标是将 Workspace 从"功能模块罗列"进化为"以图片为中心、按步骤组织的专业创作工作台"，降低用户认知负荷，提升首轮生成完成率和二次迭代率。

## 2. 范围、非目标与成功标准

### 2.1 P0 范围

1. **两段式布局重构**：左侧内容画布（60-65%）+ 右侧决策面板（35-40%），替代现有 `grid-cols-[5fr_5fr_3fr]` 三栏布局
2. **顶部状态栏**：页面标题 + 说明文案 + 状态标签（未开始/分析中/可生成/生成中/已完成）+ 更换参考图入口
3. **内容画布组件**：空态上传区 → 参考图主视图 → 结果图主视图（含对比切换）的状态流转，画布工具栏（结果图/对比查看/下载）
4. **右侧三步决策面板**：
   - Step 1 风格拆解：核心摘要（5 字段：主体/场景/光线/色彩/情绪）+ 展开完整配方
   - Step 2 生成指令：Prompt 编辑器 + Negative Prompt 编辑器
   - Step 3 输出设置：宽高比选择 + 画质选择 + 生成按钮
5. **按钮与文案随阶段变化**："生成首版" / "正在生成" / "重新生成"；生成完成后 Step 2→"继续调整指令"、Step 3→"再次生成"
6. **画布风格摘要 Tag**：画布底部展示 3-5 个关键词 pill/tag
7. **所有降级策略（L1-L4）在新布局中的正确呈现**
8. **错误态在新布局中的完整处理**
9. **全局导航 Header 保留**：保留根布局 (`layout.tsx`) 渲染的 `AuthHeader` 组件（Visoryn logo + 导航链接 + 登录状态），不做任何修改或移除。新布局的 `StatusBar` 位于 `AuthHeader` 下方，两者共存

### 2.2 P1 预留

1. 画布内图片放大查看（Lightbox / 全屏预览）
2. 结果图一键下载（集成到画布工具栏）
3. 风格摘要 Tag 的交互优化（点击 tag 可筛选/高亮相关 recipe 内容）
4. 画布区域拖拽调整宽度（用户自定义画布/面板比例）

### 2.3 明确不做

1. 移动端响应式布局方案（聚焦桌面端 ≥1280px）
2. 后端 API 或数据模型的变更（本轮纯前端重构）
3. 新功能范围扩展（批量生成、版本管理归入 P2）
4. 新依赖引入或大规模组件库替换
5. 特性开关 / feature flag 机制（首版不引入灰度能力）
6. 全局导航 Header (`AuthHeader`) 的修改或移除——本轮保留不变

### 2.4 成功标准

| 指标 | 首版目标 | 度量方式 |
|------|---------|---------|
| 功能完整性 | 所有 P0 用户故事（US-01 ~ US-09）交互路径可走通 | E2E 测试覆盖 |
| 布局正确性 | 桌面端 ≥1280px 下两段式布局正确渲染，画布占 60-65% | 视觉回归测试 |
| 状态流转正确 | idle → uploading → analyzing → analysis_ready → generating → generation_ready 全链路无误 | E2E 状态机测试 |
| 降级策略完整 | L1-L4 四种降级场景在新布局中均能正确展示 | E2E 降级场景测试 |
| 错误处理完整 | 上传失败、分析失败、生成失败三种错误态均有 ErrorDisplay | E2E 错误场景测试 |
| 首轮生成完成率 | 上线 14 天后 ≥ 50%（初期），后续迭代至 ≥ 60% | 首版通过 E2E 测试验证全链路可走通作为间接验证；自动度量依赖后续接入分析工具（Posthog / GA） |

## 3. 关键架构决策（ADR）

### ADR-1：两段式布局 — 内容画布 + 决策面板

- **选择**：采用 CSS Grid 两栏布局（`grid-cols-[1fr_380px]` 或 `grid-cols-[65%_35%]`），左侧为内容画布，右侧为三步决策面板。画布最小宽度 55%，面板固定宽度 360-400px（或使用 `min-w-[360px] max-w-[420px]`）。
- **理由**：图片始终是视觉焦点，获得最大展示空间；右侧面板天然承载步骤组织，每步职责单一；与 Figma、PhotoShop 等专业工具的心智模型一致。不选三栏增强方案是因为根本问题（图片不是焦点）无法通过补丁解决。
- **风险与对策**：窄屏（1280-1440px）下画布可能偏小。对策：设置画布最小宽度阈值 55%，低于此值时面板内容自适应压缩内边距。

### ADR-2：统一画布组件替代分散的图片展示区

- **选择**：新建 `WorkspaceCanvas` 组件作为左侧画布的统一入口，内部根据状态切换子视图：空态上传区（UploadZone）、参考图主视图（含风格摘要 Tag）、结果图主视图（含工具栏）、对比视图（左右分栏）。画布工具栏仅在 generation_ready 状态下显示。
- **理由**：当前 UploadZone / ComparisonView / ResultDisplay 分散在三栏中，生成完成后用户注意力被割裂。统一画布让"结果成为视觉中心"这一目标自然实现。不保留独立 ComparisonView 是因为对比功能降级为画布内的视图切换模式。
- **演进余地**：P1 阶段可在画布工具栏增加 Lightbox 放大查看和下载按钮；P2 阶段可支持拖拽调整宽度。

### ADR-3：渐进披露 Recipe — 摘要优先 + 按需展开

- **选择**：Step 1 面板默认展示 5 字段核心摘要（主体/场景/光线/色彩/情绪），以键值对形式呈现。下方提供"展开完整配方"按钮，点击后展示全部 VisualRecipe 字段（构图/镜头语言/质感/关键词/保留项/可替换项）。同时将摘要中的代表性关键词提取为 Tag 展示在画布底部。
- **理由**：大多数用户首次生成只需确认"AI 理解对了吗"，5 个字段足够传达核心信息。完整配方对非专业用户是信息过载。不选完整展示方案是因为首屏认知负荷过高会劝退新用户。
- **风险与对策**：若上线后 Recipe 展开率 > 80%，说明摘要不够用。对策：调整默认展示字段从 5 个增加到 8-10 个，或提供用户偏好设置。

### ADR-4：复用现有组件 + 新建容器组件的策略

- **选择**：现有组件按以下策略处理：
  - **直接复用**：`UploadZone`（props 不变）、`PromptEditor`（新增 disabled prop 已有）、`GeneratePanel`（调整按钮文案逻辑）、`ErrorDisplay`、`RetryButton`
  - **改造适配**：`RecipeCard` → 拆分为 `RecipeSummary`（5 字段摘要）+ `RecipeDetail`（完整配方），原组件可废弃或保留为内部实现
  - **新建组件**：`WorkspaceCanvas`（统一画布）、`StatusBar`（顶部状态栏）、`DecisionPanel`（右侧步骤容器）、`RecipeStep`（Step 1 风格拆解）、`CanvasToolbar`（画布工具栏）、`StyleTagBar`（画布底部风格标签）
  - **降级为功能**：`ComparisonView` 的对比能力吸收进 WorkspaceCanvas 内部视图切换；`ResultDisplay` 的下载和放大能力吸收进 CanvasToolbar
- **理由**：最大化复用已验证的组件逻辑（上传校验、错误展示、参数持久化），避免重写引入回归风险。新建组件聚焦布局编排和信息架构重组。
- **风险与对策**：RecipeCard 拆分可能影响已有测试。对策：拆分时同步迁移测试用例到新组件。

### ADR-5：状态管理扩展 — 在 useWorkspaceState 基础上增量扩展

- **选择**：在现有 `useWorkspaceState` hook 基础上增量扩展，新增以下状态：
  - `canvasView: "upload" | "reference" | "result" | "comparison"` — 画布当前视图模式
  - `isRecipeExpanded: boolean` — Recipe 完整配方是否展开
  其余状态（WorkspaceState 枚举、error、degradation 等）保持不变。
- **理由**：现有状态管理已经覆盖完整的业务状态机（idle → generation_ready），且包含 sessionStorage 持久化、L1-L4 降级状态等复杂逻辑。完全重写状态管理的收益不足以覆盖重构成本和回归风险。不引入 Zustand/Redux 等外部状态库是因为当前 useState + callback 模式足以满足需求。
- **演进余地**：若未来状态复杂度显著增长（如多版本管理），再考虑迁移到轻量状态管理方案。

### ADR-6：页面级组件编排 — WorkspacePage 作为薄编排层

- **选择**：`WorkspacePage`（page.tsx）保持为薄编排层，职责仅限于：
  1. 初始化各 hook（useWorkspaceState、useUpload、useAnalysis、useGeneration）
  2. 处理跨组件的业务回调（handleFileSelected、handleGenerate、handleRetry）
  3. 渲染顶层布局结构（StatusBar + WorkspaceCanvas + DecisionPanel），注意全局 AuthHeader 由根布局渲染，不在本页编排范围内
  所有 UI 条件渲染逻辑下沉到各容器/展示组件内部。
- **理由**：当前 page.tsx 已超过 500 行且包含大量条件渲染逻辑（showRecipe、showPromptEditor、showGeneratePanel 等布尔计算散落在 return 之前）。将条件渲染下沉后，page.tsx 可控制在 150 行以内，提升可读性和可测试性。
- **风险与对策**：回调函数仍需在 page 层定义（因为它们依赖多个 hook）。对策：将回调集中定义在文件顶部，与渲染逻辑清晰分离。

### ADR-7：降级与错误态嵌入对应 Step 区域

- **选择**：L1-L4 降级提示和 ErrorDisplay 不再作为独立区块散落布局中，而是嵌入对应的 Step 区域：
  - L1/L4 分析相关降级 → Step 1 风格拆解区域顶部
  - L3 LLM 降级 → Step 1 区域顶部 + Step 2 区域预填提示
  - L2 生成不可用 → Step 3 输出设置区域顶部
  - 分析错误 ErrorDisplay → Step 1 区域
  - 生成错误 ErrorDisplay → Step 3 区域
- **理由**：错误/降级信息紧邻其影响的操作区域，用户能立即理解"哪一步出了问题"。当前三栏布局中错误提示位置与操作区域分离，用户需要扫描全页定位问题。
- **风险与对策**：Step 区域空间有限，ErrorDisplay 可能挤压正常内容。对策：ErrorDisplay 使用紧凑模式（减少 padding），降级提示使用 amber 警告卡样式（比 error 样式更轻量）。

### 3.x 待确认问题

无未决问题。以下问题已在架构正文中收敛：

- ~~Q1 画布/面板比例~~：ADR-1 选择固定比例（65:35），PRD 明确不做拖拽
- ~~Q2 Recipe 摘要字段映射~~：§7.2 `extractSummary` 直接映射 VisualRecipe 的 5 个字段
- ~~Q3 Tag 提取策略~~：§7.2 `extractStyleTags` 优先从 styleTags 取前 5 个，不足时从核心字段补充

## 4. 用户流程与状态

### 4.1 主流程

```
用户进入 Workspace 页面
  → 看到左侧大尺寸空态上传区 + 右侧三步预览面板 + 顶部状态栏（"未开始"）
  → 点击/拖拽上传参考图
  → 左侧画布展示上传进度 → 完成后切换为参考图主视图
  → 自动触发分析，状态栏变为"分析中"
  → 右侧 Step 1 展示分析进度
  → 分析完成：
      - 左侧画布：参考图 + 底部风格摘要 Tag
      - 右侧 Step 1：5 字段核心摘要 + 展开入口
      - 右侧 Step 2：可编辑 Prompt / Negative Prompt
      - 右侧 Step 3：宽高比/画质选择 + "生成首版"按钮
      - 状态栏变为"可生成"
  → 用户浏览摘要 → （可选）展开完整配方 → （可选）微调 Prompt → 选参数 → 点"生成首版"
  → 状态栏变为"生成中"，Step 3 按钮 loading
  → 生成完成：
      - 左侧画布：切换为结果图主视图 + 工具栏[结果图|对比查看|下载]
      - 右侧 Step 1：折叠为"本次生成参数"摘要
      - 右侧 Step 2：保留 Prompt 可继续编辑（标题变为"继续调整指令"）
      - 右侧 Step 3：按钮变为"重新生成"（标题变为"再次生成"）
      - 状态栏变为"已完成"
  → 用户评估结果 → 对比查看 / 下载 / 迭代重新生成 / 更换参考图
```

### 4.2 关键分支

| 分支名 | 入口/触发条件 | 架构处理方式 |
|--------|-------------|-------------|
| 分析失败重试 | 分析过程出错（网络/服务端错误） | Step 1 区域展示 ErrorDisplay（code/message/retryable），提供重试和更换参考图两个出口 |
| L3 LLM 失败降级 | 视觉分析成功但 recipe 为空 | Step 1 顶部展示 amber 降级提示卡；Step 2 的 Prompt 区域预填基于原始分析的文本 |
| L2 生成不可用降级 | fal.ai 服务返回 SERVICE_UNAVAILABLE | Step 3 顶部展示 amber 降级提示卡，生成按钮 disabled；Prompt 编辑仍可用 |
| L1 排队超时降级 | 轮询超过 60 秒无结果 | 对应步骤区域展示排队提示卡片（替代原有进度指示），保持动画 |
| L4 分析不可用降级 | Gemini 服务返回 SERVICE_UNAVAILABLE | Step 1 顶部展示降级提示卡，Recipe 区域置灰 |
| 结果对比查看 | generation_ready 状态下点击工具栏"对比查看" | 画布内部视图切换为左右分栏对比模式（参考图 \| 结果图），不改变面板状态 |
| 更换参考图 | 非 idle 状态下点击状态栏"更换参考图" | 调用 ws.reset() 清除所有状态回到 idle，画布回到上传区 |

### 4.3 工作区前端状态机

```
idle ──[upload start]──→ uploading ──[upload complete]──→ analyzing
  ↑                        │                                  │
  │                        │                          [analysis complete]
  │                        │                                  ↓
  │                   [upload fail]                     analysis_ready
  │                        ↓                                  │
  └───────────[reset/replace]←───────────┐         [generate]  │
  │                                        │          ↓        │
  │                                 generating ←───────────────┘
  │                                        │
  │                    [generation complete]│ [generation fail]
  │                                        ↓ ↓
  └──────────────────── generation_ready ←──┘
                      │              ↑
           [regenerate]│              │[retry]
                      └──────────────┘
```

**关键规则**：
- `error` 字段可附加在任意稳定状态上（idle、generation_ready），不清空已有稳定结果
- `canvasView` 派生自 `state` + `resultImageUrl`：无图→upload，有参考图无结果→reference，有结果→result
- `isRecipeExpanded` 是独立 UI 状态，不受业务状态流转影响
- 从 generation_ready 点"更换参考图"走 reset() 回到 idle（完整重置）
- 从 generation_ready 点"重新生成"保持当前 Prompt 和参数，仅重新发起生成请求

## 5. 系统上下文与模块职责

### 5.1 系统上下文

```
┌────────────────────────────────────────────────────────────────┐
│                     浏览器 (Browser)                            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AuthHeader (全局导航, layout.tsx)            │  │
│  │              Visoryn logo / 导航 / 登录状态               │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │              Workspace Page (Next.js App Router)          │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │ StatusBar   │  │WorkspaceCanvas│  │ DecisionPanel   │  │  │
│  │  │ (顶部状态栏) │  │ (内容画布)    │  │ (右侧决策面板)   │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘  │  │
│  │       │                  │                    │          │  │
│  │       │     ┌────────────┼────────────┐        │          │  │
│  │       │     ▼            ▼            ▼        │          │  │
│  │       │  UploadZone  ReferenceView  ResultView   │          │  │
│  │       │  StyleTagBar  ComparisonView CanvasToolbar│         │  │
│  │       │                                          │          │  │
│  │       │  ┌──────────┬───────────┬──────────────┐ │          │  │
│  │       │  │ RecipeStep│PromptEditor│OutputSettings│ │          │  │
│  │       │  │ (Step 1) │ (Step 2)  │  (Step 3)    │ │          │  │
│  │       │  └──────────┴───────────┴──────────────┘ │          │  │
│  │                                                           │  │
│  │  useWorkspaceState / useUpload / useAnalysis / useGeneration│  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                    │
│              ┌────────────┼────────────┐                       │
│              ▼            ▼            ▼                       │
│        ┌──────────┐ ┌────────┐ ┌──────────────┐               │
│        │ R2 (S3)  │ │PostgreSQL│ │ fal.ai FLUX  │               │
│        │ 图片存储  │ │ 任务状态  │ │ 图像生成      │               │
│        └──────────┘ └────────┘ └──────────────┘               │
│                           │                                    │
│                    ┌──────┴──────┐                             │
│                    ▼             ▼                             │
│              ┌──────────┐ ┌──────────┐                         │
│              │  Gemini   │ │ API Routes│                         │
│              │(Vision+LLM)│ │(Next.js)  │                         │
│              └──────────┘ └──────────┘                         │
└────────────────────────────────────────────────────────────────┘
```

**数据流向**：
- 上传：浏览器 → R2 直传（预签名 URL）
- 分析：API Route → Gemini Vision → Gemini LLM → PostgreSQL
- 生成：API Route → fal.ai FLUX → R2 存储结果 → PostgreSQL
- 前端轮询：WorkspacePage → API Routes → PostgreSQL

### 5.2 模块职责

| 模块名 | 职责 | 上游输入 | 下游输出 |
|--------|------|---------|---------|
| **WorkspacePage** (page.tsx) | 页面编排层：初始化 hook、定义跨组件回调、渲染顶层布局 | useWorkspaceState / useUpload / useAnalysis / useGeneration | StatusBar / WorkspaceCanvas / DecisionPanel 的 props |
| **StatusBar** | 顶部状态栏（位于全局 AuthHeader 下方）：标题、说明文案、状态标签、"更换参考图"按钮 | ws.state, ws.error, ws.resultImageUrl | 用户点击"更换参考图"回调 |
| **WorkspaceCanvas** | 左侧内容画布：根据 canvasView 切换子视图（上传区/参考图/结果/对比） | ws.state, ws.referenceImageUrl, ws.resultImageUrl, ws.recipe, canvasView, onReplace | 视图切换回调、图片操作回调 |
| **DecisionPanel** | 右侧决策面板容器：组织 Step 1/2/3 的渲染顺序和间距 | ws.state, ws.recipe, ws.promptText, ws.degradation, ws.error | 各 Step 组件的 props 分发 |
| **RecipeStep** (Step 1) | 风格拆解区域：核心摘要展示、完整配方展开/收起、L1/L3/L4 降级提示、分析错误展示 | ws.recipe, ws.isRecipeExpanded, ws.state, ws.degradation, ws.error | 展开/收起回调 |
| **PromptEditor** (Step 2) | 生成指令编辑：Prompt 和 Negative Prompt 文本编辑 | ws.promptText, ws.negativePromptText, ws.state | 文本变更回调 |
| **OutputSettings** (Step 3) | 输出设置：宽高比选择、画质选择、生成按钮（文案随阶段变化） | ws.state, ws.degradation.generationUnavailable | 生成回调（含 aspectRatio + quality 参数） |
| **CanvasToolbar** | 画布工具栏：结果图/对比查看切换、下载按钮 | ws.resultImageUrl, ws.referenceImageUrl, canvasView | 视图切换回调 |
| **StyleTagBar** | 画布底部风格标签：从 recipe 提取关键词以 pill 形式展示 | ws.recipe (styleTags / 核心字段衍生) | 无（纯展示组件） |
| **useWorkspaceState** | 全局状态管理：业务状态机、错误、降级、sessionStorage 持久化 | 用户操作 / API 轮询结果 | WorkspaceContext（state + actions） |
| **useUpload** | 文件上传管理：预签名 URL 获取、R2 直传、进度追踪 | File 对象 | { assetId, fileUrl } + progress |
| **useAnalysis** | 分析任务管理：创建任务、轮询状态 | analysisTaskId | AnalysisTask 数据 |
| **useGeneration** | 生成任务管理：创建任务、轮询状态 | generationTaskId | GenerationTask 数据 |

### 5.3 需要刻意避免的过度设计

1. **不引入特性开关 / feature flag**：首版不做灰度发布，直接全量上线。回滚通过 `git revert` 完成（纯前端重构，30 分钟内可回滚）。
2. **不引入新状态管理库**：现有 `useWorkspaceState`（useState + callback）足以满足需求，增量扩展即可。
3. **不做画布拖拽调整宽度**：P1 功能，首版使用固定比例（65:35），避免引入 ResizeObserver 和拖拽交互复杂度。
4. **不做移动端适配**：聚焦桌面端 ≥1280px，避免响应式布局增加的条件分支复杂度。
5. **不新建自定义 Hook 封装 canvasView 逻辑**：canvasView 可直接从 ws.state + ws.resultImageUrl 派生计算，无需独立状态。
6. **不抽象 StepPanel 通用容器**：三个 Step 的 UI 差异较大（摘要/编辑器/参数选择），强行统一容器反而增加适配成本。
7. **不改后端 API 或数据模型**：本轮纯前端重构，所有 API 调用和数据结构保持不变。

## 6. 运行链路

### 6.1 上传 → 分析链路

1. 用户在 WorkspaceCanvas 的 UploadZone 中选择/拖拽图片文件
2. `handleFileSelected` 回调触发：
   - `ws.startUpload(mimeType)` — 状态切换为 uploading
   - `upload(file)` — 调用 `/api/upload/presign` 获取预签名 URL，直传 R2，返回 `{ assetId, fileUrl }`
   - 并行获取图片尺寸 `getImageDimensions(file)`
3. `ws.completeUpload(assetId, fileUrl)` — 状态切换为 analyzing
4. 自动发起分析请求 `POST /api/analysis`，body: `{ assetId, fileUrl, width, height, mimeType }`
5. 返回 `{ id: analysisTaskId }`，调用 `ws.startAnalysis(analysisTaskId)`
6. `useAnalysis` hook 开始轮询 `GET /api/analysis/[id]`
7. 轮询返回 completed 时：`ws.completeAnalysis(recipe, promptText, negativePromptText)` — 状态切换为 analysis_ready
8. 轮询返回 failed 时：`ws.failAnalysis(message, stage, code, retryable)` — 状态回退到 idle + error

**实现原则**：
- 文件上传走 R2 预签名 URL 直传，不经过业务 API（ADR-0 直传原则）
- 分析请求在上传完成后自动触发，无需用户额外操作
- 所有 API 错误通过 `parseApiError` 统一解析为 `{ error, code?, retryable? }` 结构

### 6.2 生成链路

1. 用户在 OutputSettings（Step 3）选择宽高比和画质后点击"生成首版"
2. `handleGenerate` 回调触发：
   - 检查 L2 降级状态（`ws.degradation.generationUnavailable`），若不可用则阻止
   - 发起 `POST /api/generation`，body: `{ analysisTaskId, promptText, negativePromptText, params: { aspectRatio, quality } }`
3. 返回 `{ id, status }`，调用 `ws.startGeneration(taskId)` — 状态切换为 generating
4. `useGeneration` hook 开始轮询 `GET /api/generation/[id]`
5. 轮询返回 completed 且有 resultFileUrl 时：`ws.completeGeneration(resultImageUrl)` — 状态切换为 generation_ready
6. 轮询返回 failed 时：`ws.failGeneration(message, code, retryable)` — 状态停留在 generation_ready + error

**实现原则**：
- 生成按钮文案由 OutputSettings 根据 ws.state 自动计算（"生成首版"/"正在生成"/"重新生成"）
- 重新生成时使用当前编辑器中的最新 Prompt 文本，非快照

### 6.3 重试与更换参考图链路

**分析重试**（Step 1 ErrorDisplay 的重试按钮）：
1. 用户点击"重试"→ `handleRetry`
2. `ws.clearError()` 清除错误
3. 使用已有的 `ws.assetId` 和 `ws.referenceImageUrl` 重新发起分析流程（同 6.1 步骤 4-8）

**更换参考图**（StatusBar 的"更换参考图"按钮或 ErrorDisplay 的替换按钮）：
1. 用户点击"更换参考图"→ `handleReplace` → `ws.reset()`
2. 清除 sessionStorage 持久化数据
3. 所有状态回到 initialContext（idle），画布回到上传区

**实现原则**：
- 重试复用已有 assetId 和 referenceImageUrl，无需用户重新上传
- 更换参考图是完整重置（reset），不是部分清除
- 降级标志（analysisUnavailable / generationUnavailable）在重试时同步清除

## 7. 领域对象与关键契约

### 7.1 核心对象

| 对象名 | Source of Truth | Owner | 用途 |
|--------|----------------|-------|------|
| **WorkspaceState** (枚举) | useWorkspaceState hook | 前端 | 页面级业务状态机，驱动所有条件渲染 |
| **VisualRecipe** | PostgreSQL (analysis_tasks.recipe) | 后端生成、前端展示 | AI 提取的结构化风格描述 |
| **AnalysisTask** | PostgreSQL (analysis_tasks 表) | 后端 | 分析任务实体，含状态/recipe/error |
| **GenerationTask** | PostgreSQL (generation_tasks 表) | 后端 | 生成任务实体，含结果 URL/参数快照 |
| **CanvasView** (派生) | 前端计算 (ws.state + resultImageUrl) | 前端 | 画布当前视图模式，驱动 WorkspaceCanvas 内部切换 |
| **DegradationState** | useWorkspaceState hook | 前端 | L1-L4 降级标志集合 |

### 7.2 推荐最小 Schema

```typescript
// ========== 画布视图模式（新增派生类型）==========
type CanvasView = "upload" | "reference" | "result" | "comparison";

// 派生函数（不在 state 中独立存储）
function deriveCanvasView(
  state: WorkspaceState,
  referenceImageUrl: string | null,
  resultImageUrl: string | null,
): CanvasView {
  if (!referenceImageUrl) return "upload";
  if (resultImageUrl && state === "generation_ready") return "result";
  return "reference";
}

// ========== Recipe 摘要（从 VisualRecipe 映射）==========
interface RecipeSummary {
  subject: string;      // ← recipe.subject
  scene: string;        // ← recipe.scene
  lighting: string;     // ← recipe.lighting
  color: string;        // ← recipe.color
  mood: string;         // ← recipe.mood
}

// 从 VisualRecipe 提取摘要
function extractSummary(recipe: VisualRecipe): RecipeSummary {
  return {
    subject: recipe.subject,
    scene: recipe.scene,
    lighting: recipe.lighting,
    color: recipe.color,
    mood: recipe.mood,
  };
}

// ========== 风格标签（从 VisualRecipe 衍生）==========
interface StyleTag {
  label: string;
  sourceField: string; // 来源字段名，用于 P1 交互扩展
}

// 提取策略：优先从 styleTags 取前 5 个，不足则从核心字段补充
function extractStyleTags(recipe: VisualRecipe): StyleTag[] {
  const tags: StyleTag[] = [];
  // 优先使用 styleTags 字段
  for (const tag of recipe.styleTags.slice(0, 5)) {
    tags.push({ label: tag, sourceField: "styleTags" });
  }
  // 不足 3 个时从核心字段补充关键词
  if (tags.length < 3) {
    const keywords = [recipe.subject, recipe.mood, recipe.color]
      .filter(Boolean)
      .slice(0, 3 - tags.length);
    for (const kw of keywords) {
      if (kw && !tags.some((t) => t.label === kw)) {
        tags.push({ label: kw, sourceField: "derived" });
      }
    }
  }
  return tags;
}

// ========== 状态栏配置（随状态变化）==========
interface StatusBarConfig {
  label: string;           // 状态标签文本
  description: string;     // 说明文案
  showReplaceButton: boolean; // 是否显示"更换参考图"
}

const STATUS_BAR_CONFIG: Record<WorkspaceState, StatusBarConfig> = {
  idle:           { label: "未开始",       description: "上传参考图，提炼风格特征，再生成可继续迭代的新图", showReplaceButton: false },
  uploading:      { label: "未开始",       description: "上传参考图，提炼风格特征，再生成可继续迭代的新图", showReplaceButton: false },
  analyzing:      { label: "分析中",       description: "AI 正在分析参考图的风格特征", showReplaceButton: false },
  analysis_ready: { label: "可生成",       description: "AI 已提炼出参考图的风格特征，你可以继续调整生成意图", showReplaceButton: true },
  generating:     { label: "生成中",       description: "正在生成图片，请稍候", showReplaceButton: true },
  generation_ready: { label: "已完成",     description: "已生成首版结果，可继续对比、下载或迭代", showReplaceButton: true },
};

// ========== Step 3 按钮配置（随状态变化）==========
interface GenerateButtonConfig {
  label: string;
  enabled: boolean;
  loading: boolean;
}
```

### 7.3 API 边界

本期无新 API 端点。现有 API 保持不变：

| 接口路径 | 用途 | 请求体 | 数据来源说明 |
|---------|------|--------|-------------|
| POST /api/upload/presign | 获取 R2 预签名上传 URL | 无 | - |
| POST /api/analysis | 创建分析任务 | { assetId, fileUrl, width, height, mimeType } | assetId: system_generated(upload), fileUrl: system_generated(upload), width/height: frontend_computed(从图片获取), mimeType: frontend_computed |
| GET /api/analysis/[id] | 轮询分析任务状态 | 无 | - |
| POST /api/generation | 创建生成任务 | { analysisTaskId, promptText, negativePromptText, params } | analysisTaskId: system_generated, promptText/negativePromptText: user_input(可编辑), params: user_input |
| GET /api/generation/[id] | 轮询生成任务状态 | 无 | - |

### 7.4 状态流转

**AnalysisTask 状态机**（后端，不变）：

```
pending → processing → completed
                      → failed (errorMessage + errorStage)
```

**GenerationTask 状态机**（后端，不变）：

```
pending → processing → completed (resultAssetId)
                      → failed (errorMessage)
```

**WorkspaceState 状态机**（前端，不变，见 4.3 节）

### 7.5 数据边界

| 存储层 | 职责 | 数据内容 | 生命周期 |
|--------|------|---------|---------|
| **Cloudflare R2** | 图片文件存储 | 参考图（原始上传）、生成结果图 | 由资产记录引用，无自动清理策略 |
| **PostgreSQL** | 任务状态与结构化数据 | assets / analysis_tasks / generation_tasks | 持久存储，任务记录长期保留 |
| **sessionStorage** | 前端会话级状态恢复 | assetId, referenceImageUrl, recipe, promptText, negativePromptText, generationTaskId | 浏览器标签关闭即清除；用于刷新后恢复到 analysis_ready |
| **localStorage** | 用户偏好持久化 | 宽高比/画质选择（GeneratePanel 参数） | 跨会话保留，手动清除 |
| **React State** | 页面运行时状态 | WorkspaceState 全量状态 + UI 派生状态（canvasView, isRecipeExpanded） | 组件卸载即丢失，关键数据通过 sessionStorage 双写 |

### 7.6 命名与标识规则

| 维度 | 规范 | 示例 |
|------|------|------|
| ID 策略 | ULID（已有约定，不变） | `01H...` |
| 组件命名 | PascalCase，功能描述性命名 | `WorkspaceCanvas`, `DecisionPanel`, `RecipeStep`, `OutputSettings` |
| Hook 命名 | camelCase，use 前缀 | `useWorkspaceState`（已有，增量扩展） |
| CSS 类名 | Tailwind CSS 工具类 + CSS 变量（已有设计 token 体系） | `bg-[var(--surface-mid)]`, `text-[var(--text-primary)]` |
| 状态枚举值 | snake_case | `idle`, `analysis_ready`, `generation_ready` |
| 术语映射 | UI 和代码统一使用以下术语 | 见下表 |

**术语映射规则**：

| UI 展示术语 | 代码/接口术语 | 说明 |
|------------|--------------|------|
| 风格拆解 | Recipe / VisualRecipe | Step 1 的正式名称 |
| 生成指令 | Prompt / Negative Prompt | Step 2 的正式名称 |
| 输出设置 | Generation Params (aspectRatio, quality) | Step 3 的正式名称 |
| 风格摘要 | RecipeSummary | 5 字段摘要的内部名称 |
| 风格标签 | StyleTags / StyleTagBar | 画布底部 pill 标签 |
| 内容画布 | WorkspaceCanvas | 左侧区域的组件名 |
| 决策面板 | DecisionPanel | 右侧区域的组件名 |
| 状态栏 | StatusBar | 顶部状态指示区域 |
| 画布工具栏 | CanvasToolbar | 结果态下画布顶部的操作栏 |

## 8. 非功能需求、风险与运行策略

### 8.1 性能与吞吐量目标

| 指标 | 目标 | 预期并发 |
|------|------|---------|
| 页面首屏渲染（FCP） | ≤ 1.5s（桌面端 ≥1280px） | 单用户 |
| 状态切换响应延迟 | ≤ 100ms（UI 更新，不含 API 调用） | 单用户 |
| 画布视图切换动画 | ≤ 200ms（CSS transition） | 单用户 |
| Recipe 展开/收起动画 | ≤ 300ms（CSS grid-rows 动画） | 单用户 |
| 图片加载（R2 → 浏览器） | 取决于图片大小和 CDN，不设硬性上限 | - |

**注意**：本期是纯前端重构，不涉及后端性能优化。上述目标针对前端渲染和交互响应。

### 8.2 可靠性、错误处理与降级策略

#### 基础错误处理

所有错误统一通过 `ErrorDisplay` 组件展示，格式：`{ code, message, retryable }`。错误信息不含内部服务地址、stack trace、API key。

#### 降级链（按用户体验影响从小到大排列）

| 级别 | 触发条件 | 系统行为 | 用户可继续操作 |
|------|---------|---------|--------------|
| **L1 排队提示** | 轮询超过 60 秒无结果 | 对应 Step 区域展示 amber 排队提示卡片，替代原有进度指示 | 继续等待或更换参考图 |
| **L3 LLM 失败** | 视觉分析成功但 recipe 为空 | Step 1 展示 amber 降级提示卡；Step 2 的 Prompt 预填原始分析文本 | 手动编辑 Prompt 后正常生成 |
| **L2 生成不可用** | fal.ai 返回 SERVICE_UNAVAILABLE | Step 3 顶部展示 amber 降级提示卡；生成按钮 disabled | 等待恢复或先调整 Prompt |
| **L4 分析不可用** | Gemini 返回 SERVICE_UNAVAILABLE | Step 1 顶部展示 amber 降级提示卡；Recipe 区域置灰 | 稍后重试或更换参考图 |

**降级态通用规则**：
- 所有降级提示使用 amber 色系警告卡样式（`border-amber-500/30 bg-amber-500/10`），与红色 ErrorDisplay 区分
- 降级时其他可用功能（如 Prompt 编辑）保持正常工作
- 重试操作自动清除对应级别的降级标志

#### 状态恢复原则

1. 上传失败不丢失上下文：上传失败时画布回到空状态，用户可直接重新上传
2. 分析失败保留参考图：出错后参考图仍在画布中展示
3. 生成失败保留所有输入：Prompt 编辑内容和参数选择全部保留
4. 页面刷新可恢复：sessionStorage 持久化关键状态，刷新后可恢复到 analysis_ready

### 8.3 安全与反滥用策略

| 项目 | 首版策略 |
|------|---------|
| 图片隐私 | 参考图仍通过 R2 pre-signed URL 直传，不经过应用服务器 |
| 错误信息安全 | ErrorDisplay 不暴露内部地址、stack trace、API Key |
| API Key 安全 | Gemini / fal.ai API Key 仅服务端持有，不出现在客户端代码或响应中 |
| 内容安全 | 依赖 Gemini 和 fal.ai 自带的内容过滤策略，首版不做额外审核层 |
| Rate Limit | 后端已有 RATE_LIMITED 错误码机制，前端按 ErrorDisplay 规范展示 |
| Accessibility | 保持 `sr-only` 标题、键盘导航支持、色彩对比度符合 WCAG AA 标准 |

### 8.4 成本控制预期

本期纯前端重构，不引入新的外部服务依赖。现有成本结构不变：

| 模块 | 预估单次成本 | 首版控制策略 |
|------|------------|-------------|
| R2 存储 | 存储费用（按 GB 计） | 无变化；图片存储量取决于用户使用频率 |
| Gemini Vision + LLM | 分析阶段调用成本 | 无变化；每次分析约 1 次 Vision + 1 次 LLM 调用 |
| fal.ai FLUX | 生成阶段调用成本 | 无变化；每次生成 1 次 FLUX 调用 |

### 8.5 可观测性

首版采用最小可观测性方案：

| 维度 | 方案 | 说明 |
|------|------|------|
| 前端日志 | `console.warn` / `console.error` | 关键路径（状态切换、API 错误、持久化失败）输出日志 |
| 错误追踪 | ErrorDisplay 统一收集 | 所有错误通过 code 分类，便于后续接入 Sentry 等工具 |
| 性能指标 | 不主动采集 | 首版不做前端性能监控，通过核心验收指标（4.4 节）间接评估 |
| 用户行为 | 不做埋点 | 首版不做行为分析，通过 P0 验收指标间接评估 |

### 8.6 主要风险

| 风险 | 影响 | 缓解方式 |
|------|------|---------|
| 布局重构导致现有组件适配工作量超预期 | 开发周期延长 | ADR-4 已明确组件复用/改造/新建分类，最大化复用已验证逻辑 |
| 状态管理复杂度增加引入新 bug | 特定路径下界面异常 | canvasView 采用派生计算而非独立状态，减少状态同步风险 |
| 边缘状态遗漏（如 generation_ready → analysis_ready 回退） | UI 异常 | 状态机已在 4.3 节完整定义，测试覆盖全状态转换 |
| 降级策略在新布局中未正确接入 | 降级场景体验退化 | ADR-7 明确了每种降级的嵌入位置，E2E 测试覆盖 L1-L4 |
| 用户不理解两段式布局 | 首轮完成率下降 | PRD 已定义空态引导文案和步骤预览；上线后观察指标，必要时回滚 |

## 9. 实施建议与技术选型

### 9.1 推荐核心技术栈

| 分层 | 选型建议 | 选型说明 |
|------|---------|---------|
| 框架 | Next.js 15 (App Router) + React 19（已有，不变） | 页面路由和组件渲染 |
| 样式 | Tailwind CSS 4 + CSS 变量 Design Token（已有，不变） | 延续 03 期 Luminescent Darkroom 美学体系 |
| 状态管理 | React useState + useCallback（已有，增量扩展） | useWorkspaceState hook 增量扩展 |
| 类型系统 | TypeScript（已有，不变） | 新增 CanvasView、RecipeSummary、StyleTag 等类型 |
| 测试 | Vitest（单元）+ Playwright（E2E）（已有，不变） | 覆盖新组件和状态流转 |

### 9.2 阶段划分建议

#### Phase A：骨架搭建与画布实现
- 创建 `WorkspaceCanvas` 组件骨架，实现 canvasView 派生逻辑和视图切换
- 创建 `StatusBar` 组件，接入 STATUS_BAR_CONFIG 配置
- 实现两段式 Grid 布局结构（替换现有三栏 grid）
- **验证**：空态下画布+面板正确渲染，状态栏显示"未开始"

#### Phase B：决策面板与步骤组织
- 创建 `DecisionPanel` 容器组件
- 拆分 `RecipeCard` → `RecipeStep`（含 RecipeSummary + RecipeDetail 展开/收起）
- 将 `PromptEditor` 集成为 Step 2
- 将 `GeneratePanel` 改造为 `OutputSettings`（Step 3），调整按钮文案逻辑
- 实现 Step 解锁规则（只读/可交互状态切换）
- **验证**：analysis_ready 状态下三步面板正确展示，按钮文案正确

#### Phase C：画布内容完善与工具栏
- 在 WorkspaceCanvas 中集成 UploadZone（空态视图）
- 实现参考图主视图（含 StyleTagBar）
- 实现结果图主视图（含 CanvasToolbar：结果图/对比/下载）
- 实现对比视图（吸收 ComparisonView 能力为内部模式切换）
- **验证**：generation_ready 状态下画布切换为结果图，工具栏功能正常

#### Phase D：降级策略迁移与错误处理
- 将 L1-L4 降级提示从 page.tsx 内联代码迁移到对应 Step 区域
- 将 ErrorDisplay 集成到 Step 1 和 Step 3
- 验证所有降级场景在新布局中的展示
- **验证**：每种降级级别在正确位置展示，其他功能不受影响

#### Phase E：回归测试与收尾
- 迁移现有组件测试到新组件（RecipeCard → RecipeStep 等）
- 补充 E2E 测试覆盖完整状态流转链路
- 视觉回归测试（截图对比）
- 清理废弃的旧布局代码（三栏 grid、独立 ComparisonView/ResultDisplay）
- **验证**：所有 P0 用户故事通过 E2E 测试，无视觉回退

## 10. 架构结论

### 核心判断

本期重构的核心判断是：**Workspace 的信息架构问题无法通过补丁式修复解决，需要从布局层面重新组织**。三栏并列结构的根本缺陷是图片不是视觉焦点、步骤关系不清晰、生成完成后重心不切换——这些问题在 03 期品牌视觉升级后更加凸显。

两段式工作台（内容画布 + 决策面板）是图像创作工具领域经过验证的成熟范式（Figma、PhotoShop、Midjourney），不是实验性设计。本轮纯前端重构隔离性好、回滚成本低（30 分钟内 git revert），风险可控。

### 设计原则

1. **内容优先**：参考图和结果图始终占据最大展示空间，所有 UI 服务于内容理解与创作决策
2. **渐进披露**：先给摘要再给完整配方，先给步骤预览再给交互能力
3. **结果导向**：生成完成后自动将视觉重心从"分析输入"切换到"展示结果与迭代"
4. **状态自解释**：用户在任何状态下都能回答"现在在哪、能做什么、下一步是什么"
5. **克制复用**：最大化复用已验证的组件逻辑，新建组件聚焦布局编排和信息架构重组

### 演进方向

- **P1**：Lightbox 放大查看、一键下载、Tag 交互优化、拖拽调整宽度
- **P2**：移动端响应式布局、多版本管理、批量生成、画布标注
- **中期**：若状态复杂度增长显著，考虑从 useState 迁移到轻量状态管理方案；若需要灰度能力，补充 feature flag 机制
