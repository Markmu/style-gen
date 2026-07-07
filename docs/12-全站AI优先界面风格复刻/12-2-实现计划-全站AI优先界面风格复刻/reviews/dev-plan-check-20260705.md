# 开发计划检查报告

## 一、检查对象

- 架构文档：`docs/12-全站AI优先界面风格复刻/12-1-架构文档-全站AI优先界面风格复刻.md`
- 实现计划：`docs/12-全站AI优先界面风格复刻/12-2-实现计划-全站AI优先界面风格复刻/`
- 功能数：8
- 复查轮次：第二轮复查

## 二、总评

- 结论：通过
- 阻塞问题数：0
- 建议项数：0

本轮已重新完整读取 `README.md` 与 8 个 `plan-*.md`，并对照第 12 期架构文档、`dev-plan-check` skill 和 `.claude/contracts/workflow-schema.json` 完成复查。实现计划现在完整继承架构的 Reference -> Evidence -> Render 核心闭环、P0 范围、非目标、AC-01..AC-09、ADR-1..ADR-7、前端派生契约、状态恢复策略、非功能要求和 E2E-TDD 证据要求。

第一轮报告中的 1 个 blocker 与 2 个 suggestion 均已确认修复：

- `plan-05` 已将 `src/hooks/__tests__/use-history-restore.test.tsx` 标为 `create`，Task 说明和验证命令一致。
- README 全局护栏和 `plan-03` 已明确 prompt provenance / UI copy 不拼入 AI system prompt，用户 prompt、AI 输出说明和 negative prompt/constraints 边界必须可见。
- `plan-08` 已明确 `docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md` 由 `plan-01` 创建，`plan-08` 只负责回填。

当前无需主线程继续修复计划文档，可进入后续 red-e2e / auto-dev 流程。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 报告目录 contract | 通过 | 报告位于 `reviews/`，符合 `artifacts.review_dir_name`。 |
| 报告命名 contract | 通过 | 文件名为 `dev-plan-check-20260705.md`，符合 `plan.plan_review_filename_pattern`。 |
| README frontmatter | 通过 | `workflow_type: create-dev-plan`、`org_mode: feature`、`status: review_ready` 合法。 |
| README 必备章节 | 通过 | 包含计划入口、执行拓扑、验收标准追踪矩阵、功能索引、开发状态机、全局护栏、执行前置与全局验证、未决策项与变更记录。 |
| README AC 矩阵表头 | 通过 | 表头与 contract 固定表头一致。 |
| `total_tasks` / plan 数量 | 通过 | `total_tasks: 8`，实际存在 8 个 `plan-*.md`。 |
| `execution_order` 引用 | 通过 | 只引用真实存在的 `plan-01` 到 `plan-08`，顺序满足依赖 DAG。 |
| FEAT frontmatter | 通过 | 8 个文件的 `feat_id`、`status: ready-to-dev`、`depends_on` 均合法。 |
| 文件名与 `feat_id` | 通过 | `plan-01` 到 `plan-08` 均与 frontmatter `feat_id` 一致。 |
| FEAT 必备章节 | 通过 | 8 个 plan 均包含功能概要、文件清单、实现规格、Task 列表、验收标准、验证命令、交接上下文、风险与边界。 |
| Task / 边界场景状态 | 通过 | 当前仅使用 `todo`，未发现非法状态或缺少原因的 `waived`。 |
| 依赖图 | 通过 | 未发现循环依赖；依赖均指向真实 plan。 |
| brownfield 文件清单 | 通过 | `modify` 路径均存在，或在依赖链中由前序 plan 明确创建后再修改；`create` 路径当前未与既有文件冲突。 |
| README 开发状态机 | 通过 | 当前步骤均为 `red-e2e`，red/implement/green/review 均为 `todo`，与 `ready-to-dev` 状态一致。 |

## 四、验收标准追踪

| AC-ID | 架构要求 | README 承接 | FEAT 承接 | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 实现任一页面视觉迁移前可定位页面底色、面板层级、状态表达、证据关系、生成区、Style Memory 卡片和控件反馈规则。 | plan-01，plan-08 全站 token 回归 | plan-01 设计规范/token/status；plan-08 targeted E2E | 继承良好 |
| AC-02 | 工作台宽屏包含导航、AI 状态、参考画布、风格理解、提示与生成、近期迭代，保持目标层级。 | plan-02、plan-03、plan-05 | plan-02 shell；plan-03 Workspace evidence；plan-05 Iteration Memory | 继承良好 |
| AC-03 | 分析后展示主要风格信号、证据、可信度，并说明如何影响 prompt。 | plan-03 | `EvidenceFacet`、`PromptProvenanceSpan`、facet-only 降级、prompt 边界、E2E | 继承良好 |
| AC-04 | 生成前可判断变量、风格信号、服务状态；不可生成时显示原因和下一步。 | plan-04 | `RenderReadiness`、disabled reason、service unavailable、busy state | 继承良好 |
| AC-05 | 生成后可比较、恢复、继续生成变体、保存为风格记忆。 | plan-05 | HistoryStrip、HistoryDetailDialog、restore、TemplateSaveDialog、source image/context | 继承良好 |
| AC-06 | Style Memory 展示来源图、风格标签/复用意图、变量和 Use/Duplicate/Delete；空态/受限有下一步。 | plan-06 | `StyleMemoryCardViewModel`、StatePresenter、现有 templates API | 继承良好 |
| AC-07 | Landing、Workspace、Style Memory、登录入口和状态页使用同一 AI-first 视觉语言。 | plan-01、plan-02、plan-07、plan-08 | AppShell、nav active、AuthHeader/LoginButton、visual QA、旧体系扫描 | 继承良好 |
| AC-08 | 分析失败、生成失败、未登录、服务不可用、空态保留上下文并给出行动。 | plan-01、plan-04、plan-06、plan-07、plan-08 | StatePresenter、Render Dock、Style Memory 状态、全站状态收口、异常路径 E2E | 继承良好 |
| AC-09 | Landing 或空态能解释 AI 如何理解参考图、拆解风格、辅助编辑并生成，并提供入口。 | plan-03、plan-06、plan-07、plan-08 | Workspace empty、Style Memory empty、Landing first viewport、targeted E2E | 继承良好 |

## 五、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 核心闭环与系统目标 | 通过 | 0 | README 和 plan-03/04/05/06/07/08 均围绕 Reference -> Evidence -> Render 与 Evidence Workbench 展开。 |
| 范围与非目标 | 通过 | 0 | 全局护栏和各 plan 暂停条件明确不新增后端表/API/Provider/队列/WebSocket/完整移动端工作流。 |
| 成功标准 | 通过 | 0 | 架构成功标准映射到 AC 矩阵、各 plan 验收标准和 plan-08 最终 targeted E2E/视觉 QA 门。 |
| 验收标准防漂移 | 通过 | 0 | AC-01..AC-09 均在 README 和 FEAT 中可追溯；用户可观察能力均要求 red/green E2E 或视觉 QA 证据。 |
| ADR 约束 | 通过 | 0 | ADR-1..ADR-7 的前端迁移、token 层、AppShell、前端派生、Render Dock、模板复用、上下文保留均有承接。 |
| 用户流程与状态机 | 通过 | 0 | 主流程、失败恢复、history restore、templateId 注入、authRequired、queued 和 service unavailable 均有 plan 覆盖。 |
| 模块职责与系统上下文 | 通过 | 0 | DesignTokenLayer、AppShell、WorkspaceExperience、StyleMemoryExperience、LandingExperience、StatePresenter 均拆到对应 plan。 |
| 运行链路 | 通过 | 0 | Landing、上传分析、Evidence/Prompt、生成、Iteration Memory、Style Memory、全站降级链路均有实现规格。 |
| 数据模型与契约 | 通过 | 0 | 前端 view model、现有 API、template 命名保留、source image linkage 和不新增后端 contract 的边界明确。 |
| 非功能需求 | 通过 | 0 | 性能、错误处理、降级、安全、成本、可观测性均落到对应 plan；prompt 注入/UI copy 边界已补齐。 |
| 实施建议与技术选型 | 通过 | 0 | 阶段划分与架构 Phase A-D 一致，未引入大型 UI 框架、token runtime、视觉 SaaS 或新后端能力。 |
| 风险与未决策项 | 通过 | 0 | README 继承 `open_questions: []`，各 plan 暂停条件清楚。 |
| 功能拆分质量 | 通过 | 0 | 每个 FEAT 聚焦一个用户可见能力或明确技术能力；Task 数均未超过 12；mixed 前后端边界清楚。 |
| 可执行性 | 通过 | 0 | 文件清单路径具体，前序创建/后续回填关系已说明，验证命令可追溯到 targeted specs、组件/单元测试和构建。 |
| 状态与报告契约 | 通过 | 0 | README 状态机与 `ready-to-dev` / red-e2e todo 状态一致；本报告路径符合 contract。 |

## 六、问题清单

| 严重级别 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- |
| - | - | 未发现 blocker 或 suggestion。 | 无需补丁。 |

## 七、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| plan-01 | 创建第 12 期 E2E 用例总入口 | 架构要求 E2E-TDD 与 AC 可追溯；提前创建总入口有助于后续 plan 增量补齐。 |
| plan-03 | 新增 `EvidenceFacet` 与 `PromptProvenanceSpan` 纯函数 | ADR-4 明确 Evidence/Prompt/Render 关系由前端派生；纯函数有利于测试和避免后端扩张。 |
| plan-06 | 新增 `StyleMemoryCardViewModel` 前端派生 helper | ADR-6 明确 Style Memory 是模板前端视图表达；helper 能封装派生逻辑且不新增后端字段。 |
| plan-08 | 增加旧体系残留扫描和 legacy spec 迁移/隔离 | AC-07 要求不出现明显旧体系残留；该扩展属于验收防漂移，不改变产品范围。 |

## 八、建议补丁计划

无需补丁。当前 README 与 8 个 plan 文件可作为后续 red-e2e / auto-dev 的执行依据。

若后续进入实现阶段，请保持以下执行口径：

1. 每个用户可观察功能先生成 red E2E 或组件测试证据，再实现到 green。
2. `plan-08` 只在 `plan-01` 已创建 `docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md` 后回填最终 AC 覆盖、证据路径和视觉 QA checklist。
3. Style Memory 继续只作为现有 Template Library 的前端产品表达，不新增后端表/API/Provider。
