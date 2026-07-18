# 开发计划质检报告

## 检查文档
- 架构文档：`docs/04-1-架构文档-workspace页面重构.md`
- 开发计划：`docs/04-2-实现计划-workspace页面重构/`（格式：文件夹）

## 一、继承良好的部分

| 检查项 | 状态 | 说明 |
|---|---|---|
| 核心闭环描述 | 完整继承 | README §2.1 完整引用了 Upload → Analyze → Render → Iterate 闭环，纯前端重构定位明确 |
| P0 范围覆盖 | 完整继承 | 9 项 P0 需求均有对应任务承接：T01(布局+状态栏+AuthHeader保留)、T02(决策面板三步)、T03(画布+工具栏+StyleTag)、T04(降级+错误)、T05(测试) |
| 明确不做 | 完整继承 | 移动端、后端API变更、新依赖、feature flag、AuthHeader修改均在 README §2.4 和各任务"不在范围"中呼应 |
| ADR-1 两段式布局 | 完整继承 | T01 明确 `grid-cols-[1fr_380px]`、画布 min-w-[55%]、面板 360-420px |
| ADR-2 统一画布 | 完整继承 | T03 创建 WorkspaceCanvas，ComparisonView 降级为内部视图模式 |
| ADR-3 渐进披露 | 完整继承 | T02 RecipeStep 5 字段摘要 + 展开完整配方，T03 StyleTagBar |
| ADR-4 组件策略 | 完整继承 | README §2.3 列出了完整的组件复用/改造/新建分类，与架构 ADR-4 一一对应 |
| ADR-5 状态管理增量扩展 | 完整继承 | T01 新增 isRecipeExpanded + toggleRecipeExpanded，canvasView 派生计算不存储 |
| ADR-6 薄编排层 | 完整继承 | T01 重构 page.tsx、T02/T03 下沉条件渲染、T04 移除残留内联 |
| ADR-7 降级嵌入 Step | 完整继承 | T04 逐级列出 L1-L4 嵌入位置，与架构 §4.2 和 §8.2 完全对齐 |
| 状态机完整定义 | 完整继承 | T01/T03 的 canvasView 派生函数与架构 §7.2 `deriveCanvasView` 完全一致；T02 DecisionPanel 条件渲染覆盖全状态 |
| 模块职责对应 | 完整继承 | 模块地图 10 个模块与架构 §5.2 一一对应 |
| 过度设计避免清单 | 完整继承 | 7 项均在 README §2.4 或各任务约束中体现：不引入特性开关、不引入新状态库、不做拖拽、不做移动端、不新建 canvasView Hook、不抽象 StepPanel、不改后端 |
| API 边界不变 | 完整继承 | 纯前端重构，T05-integration E2E 测试中引用的 API 路径与架构 §7.3 一致 |
| 命名规范 | 完整继承 | 组件命名(PascalCase)、Hook命名(camelCase)、状态枚举(snake_case)均与架构 §7.6 一致 |
| 术语映射 | 完整继承 | T02 使用"风格拆解/生成指令/输出设置"作为 Step 标题，与架构 §7.6 术语映射表完全对齐 |
| 运行链路 6.1/6.2/6.3 | 完整继承 | T01 保留 handleFileSelected/handleGenerate/handleRetry 回调；T04 保留重试/更换参考图回调和 L1 计时器 effect |
| 降级态通用规则 | 完整继承 | T04 统一使用 amber 色系 `border-amber-500/30 bg-amber-500/10 text-amber-400` |
| 状态恢复原则 | 完整继承 | T04 边界场景检查覆盖：生成失败保留 Prompt/参数、重试清除降级标志 |
| 错误信息安全 | 完整继承 | 复用 ErrorDisplay 组件（已有 code/message/retryable 格式），不暴露内部信息 |
| 技术栈 | 完整继承 | README §2 列出 Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Vitest + Playwright，与架构 §9.1 完全对齐 |
| 阶段划分 | 完整继承 | Phase 1-4 与架构 §9.2 Phase A-E 的逻辑对应关系清晰（Phase A→T01、B→T02+T03、C集成到T03、D→T04、E→T05） |
| 数据存储层 | 完整继承 | sessionStorage/localStorage 持久化策略在 T01(isRecipeExpanded不持久化)、T02(localStorage宽高比/画质)中明确 |
| 风险缓解 | 完整继承 | 架构 §8.6 的 5 项风险在开发计划中均有对应措施 |

## 二、缺失或弱化的信息

### 1. 成功标准逐项对比

架构文档 §2.4 定义了 6 项成功标准，逐项检查：

| 成功标准 | 开发计划覆盖情况 | 判定 |
|---------|----------------|------|
| 功能完整性：US-01~US-09 交互路径可走通 | T05-integration 覆盖 US-01~US-06，但架构提到 US-01~US-09 共 9 个用户故事 | **弱化** |
| 布局正确性：≥1280px 两段式布局正确渲染，画布占 60-65% | T01 边界场景检查覆盖窄屏，T05-integration US-01 验证两栏布局 | 完整继承 |
| 状态流转正确：idle→generation_ready 全链路无误 | T05-integration US-01~US-06 覆盖完整状态链路 | 完整继承 |
| 降级策略完整：L1-L4 四种降级场景正确展示 | T05-integration workspace-degradation.spec.ts 逐一覆盖 | 完整继承 |
| 错误处理完整：三种错误态均有 ErrorDisplay | T04 + T05-integration 覆盖分析/生成错误 | 完整继承 |
| 首轮生成完成率 ≥50% | README 未提及此指标；T05-integration 间接验证全链路可走通 | **弱化** |

### 2. E2E 用户故事覆盖不完整 — 中

**架构文档要求**：§2.4 成功标准明确"所有 P0 用户故事（US-01 ~ US-09）交互路径可走通"，暗示有 9 个用户故事。

**开发计划现状**：T05-integration 仅覆盖 US-01~US-06 共 6 个场景，未明确 US-07~US-09 对应的内容。需确认 US-07~US-09 是否在 T05-integration 的降级/错误场景中隐含覆盖。

**建议**：在 `T05-回归测试与清理-integration.md` 中明确 US-07~US-09 的对应关系。如果降级/错误场景已覆盖，添加注释说明映射关系；如果未覆盖，补充对应 E2E 用例。查阅 PRD 文档 `docs/04-0-需求设计-workspace页面重构.md` 确认 US-07~US-09 的具体内容。

### 3. 首轮生成完成率指标未在计划中出现 — 低

**架构文档要求**：§2.4 定义"首轮生成完成率 ≥50%"作为成功标准，度量方式为"首版通过 E2E 测试验证全链路可走通作为间接验证"。

**开发计划现状**：README 输入摘要和任务验证命令中均未提及此指标。

**建议**：在 README §2.1 输入摘要中补充此指标。虽然首版度量方式是间接的（E2E 全链路可走通），但指标本身应在输入摘要中列出以证明已感知。无需修改任务文件。

### 4. 按钮与文案随阶段变化的完整映射 — 低

**架构文档要求**：P0 范围第 5 项明确"按钮与文案随阶段变化：'生成首版'/'正在生成'/'重新生成'；生成完成后 Step 2→'继续调整指令'、Step 3→'再次生成'"。

**开发计划现状**：T02 OutputSettings 覆盖了按钮文案三态变化，T02 也覆盖了 Step 标题变化。但 Step 1 在 `generation_ready` 状态下的标题变化（"本次生成参数"）仅在 T02 RecipeStep 中提及，架构文档 §4.1 主流程中的表述是"折叠为'本次生成参数'摘要"——这里"折叠"暗示 generation_ready 时 Recipe 展开状态应自动收起。

**建议**：在 `T02-决策面板与步骤组件-frontend.md` RecipeStep 规格中明确：`generation_ready` 状态下 `isRecipeExpanded` 是否应自动重置为 `false`（即"折叠"行为）。如果需要自动折叠，应在 useWorkspaceState 的 `completeGeneration` action 中重置 `isRecipeExpanded`。

### 5. 画布视图切换动画时间约束 — 低

**架构文档要求**：§8.1 明确"画布视图切换动画 ≤200ms（CSS transition）"和"Recipe 展开/收起动画 ≤300ms（CSS grid-rows 动画）"。

**开发计划现状**：T03 未在实现规格中约束画布视图切换的 CSS transition 时长；T02 RecipeStep 提到了 `grid-rows-[0fr]/[1fr]` 动画但未约束时长。

**建议**：
- 在 `T03-画布内容与工具栏-frontend.md` WorkspaceCanvas 规格中补充：画布视图切换使用 CSS transition，duration ≤ 200ms
- 在 `T02-决策面板与步骤组件-frontend.md` RecipeStep 规格中补充：展开/收起动画 duration ≤ 300ms

### 6. 页面首屏渲染 FCP ≤1.5s 目标未在验证条件中体现 — 低

**架构文档要求**：§8.1 定义 FCP ≤ 1.5s（桌面端 ≥1280px）。

**开发计划现状**：无任务的验证命令或退出条件引用此指标。架构文档 §8.5 也说"首版不做前端性能监控"，但 FCP 作为验收指标仍应有感知。

**建议**：在 README §2.1 输入摘要中补充"FCP ≤1.5s 为参考目标，首版不做自动化度量"。无需修改任务文件。

### 7. CanvasView 类型定义归属 — 低

**架构文档要求**：§7.2 定义了 `CanvasView` 类型、`RecipeSummary` 接口、`StyleTag` 接口、`StatusBarConfig` 类型。

**开发计划现状**：T03 在 WorkspaceCanvas 内部定义 `CanvasView` 类型和 `deriveCanvasView` 函数，T01 在 StatusBar 内部实现 `STATUS_BAR_CONFIG`。但 `RecipeSummary` 和 `StyleTag` 接口的文件归属未明确——它们分别在 T02 RecipeStep 和 T03 StyleTagBar 中使用，但未说明是内联定义还是放在共享类型文件中。

**建议**：在 `T02-决策面板与步骤组件-frontend.md` 和 `T03-画布内容与工具栏-frontend.md` 中明确 `RecipeSummary` 和 `StyleTag` 接口的定义位置（建议内联在对应组件文件中，因为它们各自只有一个消费者）。

## 三、合理扩展

| 扩展项 | 评价 |
|---|---|
| README §2.3 现有代码快照 | 合理。列出了所有涉及的现有文件及其用途，架构文档未要求但对执行者有重要参考价值 |
| T01 过渡阶段功能保持策略 | 合理。将现有组件暂时保留在新布局 placeholder 中，确保重构过程中功能不中断 |
| T05-frontend 旧组件"暂不删除"策略 | 合理。避免影响回滚能力，在全链路回归通过后再清理 |
| T02 DecisionPanel idle 空态预览 | 合理。架构 §4.1 主流程提到"右侧三步预览面板"，空态预览是合理的 UI 细化 |
| T03 analyzing 状态下 skeleton/overlay | 合理。架构未详细规定分析中的画布视觉反馈，skeleton/overlay 是合理的 UX 补充 |
| T04 错误/降级同时出现时 error 优先 | 合理。架构未明确优先级，error 优先于 degradation 是合理的 UX 判断 |

## 四、维度拆分与共享代码质量评估

| 任务 | 维度文件 | 拆分合理性 | 自包含性 | 共享代码引用 | 备注 |
|---|---|---|---|---|---|
| T01 | frontend | 合理（纯 UI 模块） | 是 | — | 提供 StatusBarProps + isRecipeExpanded 契约给下游 |
| T02 | frontend | 合理（纯 UI 模块） | 是 | 引用 T01 的 isRecipeExpanded/toggleRecipeExpanded | 交接上下文完整，提供 DecisionPanelProps/RecipeStepProps 给 T04 |
| T03 | frontend | 合理（纯 UI 模块） | 是 | 引用 T01 的布局骨架 | 交接上下文完整，提供 WorkspaceCanvasProps/CanvasToolbarProps 给 T04 |
| T04 | frontend | 合理（纯 UI 模块） | 是 | 引用 T02 RecipeStepProps、T02 OutputSettingsProps | 交接上下文引用了 T02 的 props 扩展需求 |
| T05 | frontend | 合理（测试层） | 是 | 引用 T01-T04 所有组件 Props 接口 | — |
| T05 | integration | 合理（E2E 层） | 是 | 引用 API 路由和 DOM 结构 | — |

**整体评价**：本期纯前端重构，所有任务均为 frontend 维度（T05 增加 integration 维度用于 E2E），与架构模块类型（全部 ui/hook）完全对应。维度拆分正确，无空文件或错误归属。各维度文件自包含，交接上下文清晰。

## 五、增量更新质量评估

README 变更记录仅有"初始生成"一条，未经历增量更新，跳过此评估。

## 六、任务粒度评估

| 任务 | Task 数 | 职责数 | 粒度判断 | 建议 |
|---|---|---|---|---|
| T01 | 4 | 2（StatusBar + 布局重构） | 合理 | — |
| T02 | 5 | 3（RecipeStep + OutputSettings + DecisionPanel） | 合理 | — |
| T03 | 5 | 3（WorkspaceCanvas + CanvasToolbar + StyleTagBar） | 合理 | — |
| T04 | 6 | 2（降级迁移 + 错误迁移） | 合理 | — |
| T05-frontend | 8 | 2（单元测试 + 清理） | 合理（虽然 Task 数接近上限，但都是同质的测试编写任务） | — |
| T05-integration | 3 | 1（E2E 测试） | 合理 | — |

**整体评价**：所有任务粒度合理，无过大或过小任务。T05-frontend Task 数最多（8 项），但都是同质的单元测试编写，不建议拆分。

## 七、跨任务交接完整性

| 共享概念 | 涉及任务 | 交接状态 | 说明 |
|---|---|---|---|
| page.tsx 文件 | T01(modify), T02(modify), T03(modify), T04(modify) | 完整 | 每个任务都标注了 modify，且说明了各自的修改范围（T01:布局骨架, T02:右栏DecisionPanel, T03:左栏WorkspaceCanvas, T04:清理残留） |
| useWorkspaceState hook | T01(modify) | 完整 | 仅 T01 修改，T02/T03/T04 消费但不修改 |
| RecipeStep props 扩展 | T02(create), T04(modify) | 完整 | T02 定义初始 props，T04 明确列出新增 props（degradation/error/onRetry/onReplace），交接上下文引用了 T02 的契约 |
| OutputSettings props 扩展 | T02(create), T04(modify) | 完整 | T02 定义初始 props，T04 明确列出新增 props（generationQueueing/error/onRetry），交接上下文清晰 |
| DecisionPanel props 扩展 | T02(create), T04(modify) | 完整 | T04 列出新增 onRetry/onReplace/onGenerateRetry props |
| 状态机流转 | T01(isRecipeExpanded), T02(条件渲染), T03(canvasView 派生), T04(降级状态) | 完整 | 各任务对状态机的不同方面有清晰的责任边界 |
| 废弃组件处理 | T03(吸收 ComparisonView/ResultDisplay), T05(清理) | 完整 | T03 吸收功能，T05 确认无 import 后清理 |

**整体评价**：跨任务交接完整，无断链风险。page.tsx 被 4 个任务连续修改，但每个任务的修改范围明确，不存在冲突。

## 八、部署/运营层 Gap（不计入缺失统计）

| 架构要求 | 说明 | 落实阶段 |
|---|---|---|
| 首轮生成完成率 ≥50% 度量 | 需接入 Posthog / GA 等分析工具 | 部署阶段（架构已标注"依赖后续接入分析工具"） |
| 前端性能监控（FCP） | 首版不主动采集 | 部署阶段（架构 §8.5 明确"不做前端性能监控"） |
| 用户行为埋点 | 首版不做 | 部署阶段 |
| Sentry 等错误追踪集成 | ErrorDisplay 统一收集，但未接入外部服务 | 部署阶段 |

## 九、总结

**继承完整度**：约 92%

本开发计划对架构文档的继承总体良好。核心闭环、P0 范围、7 条 ADR、模块职责、状态机、运行链路、降级策略、命名规范、术语映射等关键维度均完整继承。组件策略（复用/改造/新建）与架构 ADR-4 一一对应。跨任务交接链完整，无断链。

**缺失或弱化项**：共 6 项（0 高 / 1 中 / 5 低），均为细节层面的补充，不影响主链路实施。

**优先补充建议**（按影响排序）：

1. **[中]** 确认 US-07~US-09 用户故事内容，在 T05-integration 中补充 E2E 覆盖或说明映射关系
2. **[低]** 在 README 输入摘要中补充"首轮生成完成率 ≥50%"和"FCP ≤1.5s"两项成功标准（证明已感知）
3. **[低]** 在 T02 RecipeStep 规格中明确 `generation_ready` 时是否自动折叠 Recipe
4. **[低]** 在 T02/T03 中补充动画时长约束（展开/收起 ≤300ms，画布切换 ≤200ms）
5. **[低]** 在 T02/T03 中明确 RecipeSummary/StyleTag 接口的定义位置

## 十、Contract 预检

| 检查项 | 状态 | 说明 |
|---|---|---|
| README 状态枚举 | 通过 | `review_ready` 属于 `plan.readme_frontmatter_status` 允许值 |
| 任务状态枚举 | 通过 | 所有任务文件 status 均为 `ready-to-dev`，属于 `plan.task_file_status` 允许值 |
| 步骤状态枚举 | 通过 | 所有 Task 列表和边界场景检查步骤状态均为 `todo`，属于 `plan.task_step_status` 允许值 |
| waived 原因完整性 | 通过 | 无 `waived` 步骤 |
| 状态一致性 | 通过 | README 为 `review_ready`，所有任务为 `ready-to-dev`，无 `review` 状态但步骤仍有 `todo` 的矛盾情况 |
| README 必需章节 | 通过 | 覆盖全部 9 个必需章节：概览、输入摘要、模块地图、依赖图、阶段摘要、任务总览、未决策项、执行前置、变更记录 |
| 任务文件必需章节 | 通过 | 所有 7 个任务文件均覆盖全部 11 个必需章节 |
