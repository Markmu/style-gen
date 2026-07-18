# 开发计划检查报告

## 一、检查对象

- 架构文档：`docs/08-1-架构文档-全站交互与UI样式改造.md`
- 实现计划：`docs/08-2-实现计划-全站交互与UI样式改造/`
- 功能数：5

## 二、总评

- 结论：通过（阻塞项已自动修复）
- 阻塞问题数：0
- 建议项数：0

08 需求的实现计划整体承接良好：5 个 FEAT 能覆盖架构中的 DesignTokenLayer、SharedInteractionPrimitives、StatePresenter、AppShell、LandingExperience、WorkspaceExperience、TemplateLibraryExperience，也完整映射 AC-01 至 AC-08。原检查发现的自动开发流转问题已在同轮修复：FEAT frontmatter 已推进到 `ready-to-dev`，FEAT-01 的 E2E 豁免已同步到 README 开发状态机。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| workflow contract | 通过 | contract 实际位于 `.agents/contracts/workflow-schema.json`；技能文档中的 `.Codex/contracts/workflow-schema.json` 路径在本仓库不存在。 |
| README frontmatter | 通过 | `workflow_type: create-dev-plan`、`org_mode: feature`、`status: review_ready` 均合法。 |
| README 必备章节 | 通过 | 包含 `概览`、`输入摘要`、`验收标准追踪矩阵`、`模块地图`、`依赖图`、`阶段摘要`、`任务总览`、`未决策项`、`执行前置`、`变更记录`。 |
| FEAT 文件数量 | 通过 | `total_tasks: 5`、`total_task_files: 5` 与 5 个 `FEAT-*.md` 一致。 |
| FEAT frontmatter 合法性 | 通过 | 5 个 FEAT 均已调整为 `status: ready-to-dev`，满足后续 `auto-dev` / `test-e2e` / `implementer` 入口要求。 |
| execution_order | 通过 | `FEAT-01` -> `FEAT-02` -> `FEAT-03/04/05` 均引用真实 FEAT。 |
| depends_on | 通过 | 所有依赖引用真实 FEAT，未发现循环依赖。 |
| Task / 边界状态 | 通过 | Task 与边界场景状态使用 `todo`，未发现非法状态或无原因 `waived`。 |
| 验收矩阵表头 | 通过 | README 验收标准追踪矩阵表头符合 contract。 |
| 报告路径 | 通过 | 本报告写入 `reviews/dev-plan-check-20260427.md`。 |

## 四、验收标准追踪

| AC-ID | 架构要求 | README 承接 | FEAT 承接 | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 首页首屏展示产品价值、主行动、预览和上传入口，符合 Precision Glass | FEAT-03 + `e2e/precision-glass-home.spec.ts` | FEAT-03 验收标准和 E2E-TDD 覆盖首页首屏、上传入口、宽屏布局 | 通过 |
| AC-02 | 首页、工作台、模板库视觉语言一致 | FEAT-01/02/03/04/05 | FEAT-01 token，FEAT-02 shell，FEAT-03/04/05 页面体验 | 通过 |
| AC-03 | 控件默认、悬停、按下、选中、禁用、处理中状态一致 | FEAT-01/03/04/05 | FEAT-01 共享状态入口，页面 FEAT 覆盖 hover/focus/processing/error | 通过 |
| AC-04 | 工作台上传、分析、编辑、生成、完成状态布局稳定且输入不丢失 | FEAT-04 + `e2e/precision-glass-workspace.spec.ts` | FEAT-04 明确保留 prompt、negativePrompt、参考图、Recipe、输出设置 | 通过 |
| AC-05 | 模板库资产浏览、空结果、Use Template 回到工作台并加载内容 | FEAT-05 + `e2e/precision-glass-templates.spec.ts` | FEAT-05 覆盖搜索、空态、Use Template、模板加载失败 | 通过 |
| AC-06 | 上传、分析、生成、模板加载失败时保留上下文并提供行动入口 | FEAT-01/04/05 | FEAT-01 `failedRecoverable`，FEAT-04 创作失败恢复，FEAT-05 模板失败恢复 | 通过 |
| AC-07 | 常规宽屏下首页、工作台、模板库主次区域比例稳定 | FEAT-02/03/04/05 | 每个页面 FEAT 均要求 1280px / 1440px 断言 | 通过 |
| AC-08 | 空态、加载、排队、处理中、成功、失败、未登录、无结果文案一致 | FEAT-01/03/04/05 | FEAT-01 状态文案契约，页面 FEAT 消费统一文案 | 通过 |

## 五、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 核心闭环与系统目标 | 通过 | 0 | README 保留 `Reference -> Recipe -> Render` 与 `Surface -> State -> Action` 双闭环。 |
| 范围与非目标 | 通过 | 0 | 明确不新增后端 API、DB、Provider、队列、WebSocket、移动端专项。 |
| 成功标准 | 通过 | 0 | 架构成功标准均落入 AC 与 FEAT 验收。 |
| 验收标准防漂移 | 建议 | 1 | 页面 FEAT 有目标 Playwright spec，但尚未显式写入 `docs/e2e/evidence` 证据产物路径。 |
| ADR 约束 | 通过 | 0 | 7 条 ADR 均在 README 护栏或 FEAT 不在范围中体现。 |
| 用户流程与状态机 | 通过 | 0 | FEAT-01 E2E 不适用已在 README 状态机中标记为 `waived`，由组件测试和下游页面 E2E 承接。 |
| 模块职责与上下文 | 通过 | 0 | 模块地图和 FEAT 拆分与架构 §4.2 对齐。 |
| 运行链路 | 通过 | 0 | 首页、工作台、模板库、跨页面、控件状态、状态文案链路均有 FEAT 承接。 |
| 数据模型与契约 | 通过 | 0 | `ProductStatus`、`StatusCopy`、`InteractiveState`、`PageLayoutContract` 均被继承；无 DB schema 变更。 |
| 非功能需求 | 通过 | 0 | 性能、错误处理、降级、安全、成本、可观测性基本落到 FEAT。 |
| 实施建议与技术选型 | 通过 | 0 | 技术栈与架构保持一致，未引入新 UI 库或动画库。 |
| 风险与未决策项 | 通过 | 0 | `open_questions: []` 被继承，风险边界写入各 FEAT。 |
| 功能拆分质量 | 通过 | 0 | FEAT 粒度清晰，依赖 DAG 合理；单文件 Task 数均未过度膨胀。 |
| 可执行性 | 通过 | 0 | 所有 FEAT 已为 `ready-to-dev`，后续自动开发可按依赖顺序推进。 |
| 状态与报告契约 | 通过 | 0 | 状态枚举合法，报告路径符合 contract。 |

## 六、问题清单

| 严重级别 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- |
| resolved | `FEAT-01` 至 `FEAT-05` frontmatter | 5 个 FEAT 原为 `status: draft`，会阻断 `auto-dev`、`test-e2e`、`implementer` 入口。 | 已将 5 个 FEAT 调整为 `status: ready-to-dev`。 |
| resolved | `README.md` §7.2；`FEAT-01` 风险与边界 | FEAT-01 明确 E2E 不适用，但 README 状态机原标记 `red_e2e: todo`。 | 已将 FEAT-01 `red_e2e` 改为 `waived`，当前步骤改为 `implement`，并补充豁免原因。 |
| resolved | `FEAT-02` 至 `FEAT-05` 验收标准 / 验证命令 | 页面 FEAT 原未明确 red/green 证据文档写入 `docs/e2e/evidence/`。 | 已补充各 FEAT 的 red / green 证据路径要求。 |
| resolved | `FEAT-04` / `FEAT-05` 交接上下文 | 模板浮层和变量向导责任边界略隐含。 | 已明确 FEAT-05 承接模板浮层、保存模板弹窗和变量向导视觉统一，FEAT-04 只保证工作台模板加载失败和状态入口。 |

## 七、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| FEAT-02 | 新增 `e2e/precision-glass-shell.spec.ts` | 架构要求跨页面一致性和导航高亮，单独 shell spec 能减少页面 E2E 重复。 |
| FEAT-01 | 新增 `src/components/ui/state-presenter.tsx` | 架构只建议 StatePresenter 契约；实现为小型展示组件能减少页面重复文案和状态布局。 |
| FEAT-03/04/05 | 每个页面单独建立 Precision Glass E2E spec | 用户可观察体验变化大，拆分 spec 有利于红绿证据和失败定位。 |

## 八、建议补丁计划

1. 已修补 README §7.2 开发状态机：FEAT-01 `red_e2e` 标为 `waived`，当前步骤调整为 `implement`，最近证据说明 E2E 豁免理由。
2. 已将 `FEAT-01` 至 `FEAT-05` frontmatter 从 `draft` 调整为 `ready-to-dev`，使 auto-dev/test-e2e/implementer 能识别后续入口。
3. 已在 FEAT-02/03/04/05 的验收标准中补充 red/green 证据写入 `docs/e2e/evidence/` 的要求。
4. 已在 FEAT-04 和 FEAT-05 的交接上下文中显式写清模板浮层、变量向导的责任边界。

## 九、自动修复记录

| 文件 | 修复内容 |
| --- | --- |
| `README.md` | FEAT-01 状态机改为 E2E waived；执行顺序说明排除 FEAT-01 的 E2E-TDD。 |
| `FEAT-01-体验基础层与状态契约.md` | frontmatter 状态改为 `ready-to-dev`。 |
| `FEAT-02-全站壳层与导航统一.md` | frontmatter 状态改为 `ready-to-dev`；补充 E2E red/green 证据路径。 |
| `FEAT-03-首页PrecisionGlass体验.md` | frontmatter 状态改为 `ready-to-dev`；补充 E2E red/green 证据路径。 |
| `FEAT-04-工作台创作体验统一.md` | frontmatter 状态改为 `ready-to-dev`；补充 E2E red/green 证据路径；明确模板浮层和变量向导由 FEAT-05 承接。 |
| `FEAT-05-模板库资产浏览体验.md` | frontmatter 状态改为 `ready-to-dev`；补充 E2E red/green 证据路径；明确承接模板浮层、保存模板弹窗和变量向导视觉统一。 |
