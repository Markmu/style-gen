# 开发计划检查报告

## 一、检查对象

- 架构文档：`docs/11-Workspace三栏工作台重构/11-1-架构文档-Workspace三栏工作台重构.md`
- 实现计划：`docs/11-Workspace三栏工作台重构/开发计划/`
- 功能数：4（PLAN-01 ~ PLAN-04）

## 二、总评

- 结论：**已修复，可通过**
- 阻塞问题数：0（原 3 个，已修复）
- 建议项数：0（原 5 个，已修复）

PLAN-04 的 `depends_on` 声明与前置条件矛盾，导致依赖图和关键路径均不正确。其余维度继承良好，P0 范围完整覆盖，ADR 约束逐条落地，验收标准追踪矩阵完整。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| README frontmatter `workflow_type` | ✅ | `create-dev-plan` |
| README frontmatter `org_mode` | ✅ | `feature` |
| README frontmatter `status` | ✅ | `review_ready`，在合法枚举内 |
| README `execution_order` 引用真实 PLAN | ✅ | PLAN-01/02/03/04 均存在 |
| README `total_tasks` 与 PLAN 文件数一致 | ✅ | 4 = 4 |
| README 必备章节完整 | ✅ | 概览、输入摘要、验收标准追踪矩阵、模块地图、依赖图、阶段摘要、任务总览、未决策项、执行前置、变更记录 共 10 项齐全 |
| README 验收标准追踪矩阵表头正确 | ✅ | AC-ID / 需求原文 / 架构承接 / 计划承接 / 验证方式 / 当前状态 |
| FEAT frontmatter `feat_id` 与文件名一致 | ✅ | PLAN-01~04 各文件名与 feat_id 匹配 |
| FEAT frontmatter `status` 合法 | ✅ | 均为 `draft` |
| FEAT `depends_on` 引用真实功能 | ⚠️ | PLAN-04 依赖声明不完整（详见问题 #1） |
| FEAT 必备章节完整 | ✅ | 所有 4 个 PLAN 均包含 8 个必备章节 |
| Task 状态合法 | ✅ | 均为 `todo` |
| 边界场景状态合法 | ✅ | 均为 `todo` |

## 四、验收标准追踪

| AC-ID | 架构要求 | README 承接 | FEAT 承接 | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 三栏布局正确渲染 | PLAN-01 | PLAN-01 验收标准 AC-01 | ✅ 完整 |
| AC-02 | 参考图上传与分析联动 | PLAN-01, PLAN-02 | PLAN-02 验收标准 AC-02 | ✅ 完整 |
| AC-03 | Visual Recipe 展示与分类浏览 | PLAN-02 | PLAN-02 验收标准 AC-03 | ✅ 完整 |
| AC-04 | Prompt 编辑与参数设置 | PLAN-03 | PLAN-03 验收标准 AC-04 | ✅ 完整 |
| AC-05 | 生成与结果查看 | PLAN-03 | PLAN-03 验收标准 AC-05 | ✅ 完整 |
| AC-06 | 历史回溯 | PLAN-04 | PLAN-04 验收标准 AC-06 | ✅ 完整 |
| AC-07 | 模式切换 | PLAN-01 | PLAN-01 验收标准 AC-07 | ✅ 完整 |
| AC-08 | 异常处理与恢复 | PLAN-01~04 | 各 PLAN 边界场景 + PLAN-01 降级回归 | ✅ 完整 |

所有 8 个 AC 均可从 README 追踪到具体 FEAT 的验收标准条目。每个 FEAT 均含 E2E-TDD 验收项，指定了目标 Playwright spec 文件路径。

## 五、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| D1 核心闭环与系统目标 | ✅ 继承良好 | 0 | README §2.1 完整转述架构核心闭环和首版目标 |
| D2 范围与非目标 | ✅ 继承良好 | 0 | P0 全覆盖，P1 预留项在 PLAN-01/02 中体现，非目标在 §2.4 约束中列出 |
| D3 成功标准 | ✅ 继承良好 | 0 | 6 条定量指标分散到对应 PLAN 验收标准和性能验收 |
| D4 验收标准防漂移 | ✅ 继承良好 | 0 | 8 AC 全映射，E2E-TDD 项完整 |
| D5 ADR 约束 | ⚠️ 建议项 | 1 | ADR-6 标注有偏差（建议项 #1） |
| D6 用户流程与状态机 | ✅ 继承良好 | 0 | 主流程 7 节点 + 7 条关键分支均有 PLAN 覆盖 |
| D7 模块职责与系统上下文 | ✅ 继承良好 | 0 | 11 个模块全部在 README 模块地图中有 PLAN 承接 |
| D8 运行链路 | ✅ 继承良好 | 0 | 7 条链路步骤分散到对应 PLAN 实现规格 |
| D9 数据模型与契约 | ✅ 继承良好 | 0 | 核心对象、状态枚举、API 边界一致 |
| D10 非功能需求 | ⚠️ 建议项 | 1 | L1 排队提示未明确新组件行为（建议项 #2） |
| D11 实施建议与技术选型 | ✅ 继承良好 | 0 | 技术栈一致，阶段划分合理 |
| D12 风险与未决策项 | ✅ 继承良好 | 0 | 3 条风险均有 PLAN 缓解，open_questions 继承 |
| D13 功能拆分质量 | ✅ 继承良好 | 0 | 每个 PLAN 是连贯能力，Task 数 ≤9，依赖 DAG 无循环 |
| D14 可执行性 | ⚠️ 建议项 | 1 | 缺少 docs/e2e/ 11 期用例（建议项 #3） |
| D15 状态与报告契约 | 🔴 阻塞 | 3 | depends_on 不完整、critical_path 错误、依赖图缺边 |

## 六、问题清单

| 严重级别 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- |
| 🔴 blocker | PLAN-04 frontmatter `depends_on` | `depends_on: ["PLAN-01"]` 但前置条件明确要求"生成流程可正常工作（FloatingGenerateButton 已实现）"，即 PLAN-03 的输出。验收标准 AC-06 "生成完成后历史条左侧自动新增缩略图" 也无法在 PLAN-03 未完成时验证 | 改为 `depends_on: ["PLAN-01", "PLAN-03"]` |
| 🔴 blocker | README frontmatter `critical_path` | 当前为 `["PLAN-01", "PLAN-02", "PLAN-04"]`。PLAN-04 不依赖 PLAN-02，且实际依赖 PLAN-03。修正 depends_on 后 critical path 应为 `["PLAN-01", "PLAN-03", "PLAN-04"]` | 改为 `["PLAN-01", "PLAN-03", "PLAN-04"]` |
| 🔴 blocker | README §5 依赖图 | 缺少 PLAN-03 → PLAN-04 的依赖边。当前图为 PLAN-01 → {PLAN-02, PLAN-03, PLAN-04}，修正后应为 PLAN-01 → {PLAN-02, PLAN-03}，PLAN-03 → PLAN-04 | 添加 `FEAT03 --> FEAT04` 边 |
| 🟡 suggestion | README §2.2 ADR 表 | 将"不引入全局状态管理库"标为 ADR-6，但架构文档中这是 §4.3 "需要刻意避免的过度设计"原则，不是独立编号 ADR（ADR-1~5 有正式编号）。作为实施护栏列出是合理的，但标为 ADR-6 可能让实施者误以为架构文档有 ADR-6 条目 | 将表头"ADR"改为"ADR / 架构约束"，或在 ADR-6 行增加说明"来自架构 §4.3 过度设计避免原则" |
| 🟡 suggestion | PLAN-03 验收标准 | 架构 §8.2 L1 降级（排队提示 >60s）未在 PLAN-03 验收标准中体现。FloatingGenerateButton 作为新组件，其排队态行为（是否显示排队提示、是否仍可点击）未明确 | 在 PLAN-03 验收标准或边界场景中增加 L1 排队态行为描述（可参考现有 degradation 机制对生成按钮的影响） |
| 🟡 suggestion | PLAN-01~04 E2E 用例 | 4 个 PLAN 均指定了目标 Playwright spec 文件路径，但 `docs/e2e/` 下无 11 期 E2E 用例文档（仅存在 08/09/10 期用例）。维度 14 要求"用户可观察功能包含 E2E-TDD 验收项，并能追溯到 `docs/e2e/` 用例" | 在执行前补充 `docs/e2e/11-e2e-用例-Workspace三栏工作台重构.md`，或在执行前置 §9.1 中明确说明 E2E 用例将在 PLAN-01 red 阶段创建 |
| 🟡 suggestion | README §5 依赖图 + §6 阶段摘要 | 修正 PLAN-04 依赖后，Phase 2 和 Phase 3 的关系变为 PLAN-03（Phase 2）→ PLAN-04（Phase 3），不再是完全并行后顺序。执行顺序说明应相应调整 | §6 阶段摘要中 Phase 3 标注"依赖 PLAN-03 完成" |
| 🟡 suggestion | PLAN-04 §功能概要 | PLAN-04 的"前置条件"列出"生成流程可正常工作（FloatingGenerateButton 已实现）"，但 depends_on 未包含 PLAN-03。修正 depends_on 后，前置条件描述与依赖声明将一致 | 无需额外修改，修正 depends_on 后自然对齐 |

## 七、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| README §2.2 | 将"不引入全局状态管理库"从 §4.3 过度设计原则提升为护栏条目 | 实施护栏表用于约束开发行为，将关键约束集中展示有助于实施者快速掌握边界，无需逐一翻阅架构文档 |
| PLAN-04 验收标准 | 增加 US 覆盖矩阵（US-01~US-08 全流程回归） | PLAN-04 是最终功能，在此放置集成回归验收是合理的收尾策略，避免每个 PLAN 重复回归 |
| PLAN-03 | 浮动按钮增加 `data-testid="floating-generate-button"` | 架构未指定 testid，但 E2E-TDD 需要稳定选择器，属于合理的测试基础设施扩展 |

## 八、建议补丁计划

按优先级排列：

1. **[blocker]** 修正 PLAN-04 frontmatter：`depends_on: ["PLAN-01", "PLAN-03"]`
2. **[blocker]** 修正 README frontmatter：`critical_path: ["PLAN-01", "PLAN-03", "PLAN-04"]`
3. **[blocker]** 修正 README §5 依赖图：添加 `FEAT03["PLAN-03"] --> FEAT04["PLAN-04"]` 边
4. **[suggestion]** README §2.2 ADR 表：将 ADR-6 行来源标注为"架构 §4.3"
5. **[suggestion]** PLAN-03 验收标准：补充 L1 排队态下 FloatingGenerateButton 的行为描述
6. **[suggestion]** 补充 `docs/e2e/11-e2e-用例-Workspace三栏工作台重构.md` 或在执行前置中说明
