# 开发计划检查报告（第 1 轮）

- 检查日期：2026-08-17
- 检查 skill：`dev-plan-check`（对照 `.agents/contracts/workflow-schema.json` `plan` 节点）
- 检查轮次：r1（共 3 轮）

## 一、检查对象

- 架构文档：`docs/13-Iteration-Memory闭环补全/13-1-架构文档-Iteration-Memory闭环补全.md`（workflow_type: arch-gen, status: review_ready）
- 需求文档（AC 最终来源）：`docs/13-Iteration-Memory闭环补全/13-0-需求设计-Iteration-Memory闭环补全.md`
- 实现计划：`docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/`（README.md + plan-01 ~ plan-06）
- 功能数：6（plan-01 后端 / plan-02 ~ plan-06 前端）

## 二、总评

- **结论：有阻塞问题（需小幅修复）**
- 阻塞问题数：1（R1-P1，`sourceTemplateId` 前端传递链缺失）
- 建议项数：6（2 中、4 低）
- 总体评价：计划的结构契约、AC 追踪骨架、ADR/链路/契约/NFR 继承质量高，6 个文件全部满足 contract 必含章节，全部 `modify` 目标文件经代码核验真实存在、`create` 目标无重复声明，代码事实引用（`useHistoryList` 默认 completed 调用、`listCompleted` 游标格式、`use-workspace-state` 300ms 防抖、templates 路由 409/限流/名称 ≤50、workspace page L413 附近恢复消费段、left-sidebar 现有两项导航、history-strip 既有"比较最近"）全部准确。主要缺陷集中在三处：写链路 `sourceTemplateId` 只有后端接收方没有前端发送方（导致 AC-02 的模板名搜索能力与该列落库整体失效）；plan-02 ~ plan-06 Task 列表把 red E2E 排在实现任务之后与 README 护栏矛盾；架构 Phase B"新增 targeted spec 纳入 `pnpm e2e:targeted`"无任何文件清单承接。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| README frontmatter `workflow_type: create-dev-plan` | 通过 | 与 contract 一致 |
| README frontmatter `org_mode: feature` | 通过 | — |
| README `status: review_ready` ∈ `readme_frontmatter_status` | 通过 | — |
| README `execution_order` 只引用真实 plan | 通过 | 5 个批次全部指向 plan-01 ~ plan-06，无环 |
| README `total_tasks: 6` 与 plan-*.md 数量一致 | 通过 | 6 个文件；`total_task_files: 6`、`total_phases: 5` 亦与拓扑表一致 |
| README 必含章节（8 项） | 通过 | 计划入口/执行拓扑/验收标准追踪矩阵/功能索引/开发状态机/全局护栏/执行前置与全局验证/未决策项与变更记录全部在位 |
| 追踪矩阵表头固定格式 | 通过 | `AC-ID / 需求原文 / 架构承接 / 计划承接 / 验证方式 / 当前状态` 与 contract 完全一致；当前状态 `planned` ∈ `acceptance_status` |
| FEAT 文件名 `plan-XX` 与 `feat_id` 一致 | 通过 | 6/6 |
| FEAT `status: draft` ∈ `task_file_status` | 通过 | 6/6 |
| FEAT 必含章节（8 项） | 通过 | 6/6 文件均含功能概要/文件清单/实现规格/Task 列表/验收标准/验证命令/交接上下文/风险与边界 |
| Task 与边界场景状态仅 `todo/done/waived` | 通过 | 全部 `todo`；无 `waived`，故无缺因问题 |
| `depends_on` 引用真实存在 | 通过 | plan-02→01、plan-03→02、plan-04→03、plan-05→[01,03]、plan-06→[04,05]；DAG 无环，critical_path 与依赖一致，max_parallelism: 2 与阶段 4 并行度一致 |
| 验证命令与 package.json scripts 对照 | 通过 | `db:generate/db:push/type-check/verify:fast/e2e/vitest` 全部真实存在；`pnpm e2e -- <spec> --project=workspace` 与 AGENTS.md 用法一致；既有回归 spec（workspace-history-strip、workspace-ai-first-iteration-memory）真实存在 |
| 检查报告路径 contract | 通过 | 写入 `{plan-dir}/reviews/dev-plan-check-2026-08-17-r1.md`（多轮 r1 后缀） |

## 四、验收标准追踪

| AC-ID | 架构要求（§2.4） | README 承接 | FEAT 承接 | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 完整 Iteration Memory 可达且覆盖全部生成状态 | plan-01, plan-02, plan-06 | plan-01（全状态列表 + 兼容断言）、plan-02（三态渲染、默认 all）、plan-06（入口可达） | 一致 |
| AC-02 | 找到并连续浏览目标 Iteration | plan-02 | plan-02（搜索/筛选/游标/保位/无匹配）；plan-01 亦关联 AC-02（后端 q 命中）但 README 未列（R1-P4）；"按 Style Memory 名称找到"的前置字段无前端传递方（R1-P1） | 部分一致 |
| AC-03 | 已完成详情提供可理解完整创作上下文 | plan-01, plan-03 | plan-01（快照优先/回退/缺失标记）、plan-03（并排展示 + 分区块 + 缺失提示） | 一致 |
| AC-04 | 进行中与失败记录提供确定感和恢复路径 | plan-03, plan-04 | plan-03（三态详情、轮询切换、无重复提交入口）、plan-04（"修正并继续"行为） | 一致 |
| AC-05 | 继续历史方向完整恢复且不误覆盖 | plan-04 | plan-04（三豁免、确认/取消、恢复、新 Iteration 断言） | 一致 |
| AC-06 | 成功 Iteration 可沉淀为 Style Memory | plan-01, plan-05 | plan-01（sourceGenerationTaskId 校验）、plan-05（保存/已保存态/打开定位） | 一致 |
| AC-07 | 空态、登录和服务异常不破坏上下文 | plan-02, plan-06 | plan-02（空态/未登录/列表 5xx）、plan-06（集成回归）；"单条详情加载失败"实际由 plan-03 承接但矩阵未列（R1-P5） | 部分一致 |

E2E-TDD：plan-02 ~ plan-06 均有专属 spec 文件与 red/green 两阶段证据要求；plan-01 有严格的不适用说明（纯后端、相邻 Vitest 为质量门、用户可观察行为由 plan-02/03 经同一接口间接承接），符合 contract。US-01 ~ US-10 覆盖矩阵在 plan-06 §5 完整建立且与 PRD §2.2 一一对应。

## 五、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 1. 核心闭环与系统目标 | 通过 | 0 | README 计划入口继承 Attempt→Understand→Continue 与"读模型扩展 + 提交时快照 + 客户端恢复"定位 |
| 2. 范围与非目标 | 通过 | 0 | §2.1 四类范围（数据/读/写/前端）全部有 plan 承接；"明确不做"在 README 护栏与各 plan 不在范围双重呼应，无 FEAT 引入禁止项 |
| 3. 成功标准 | 通过 | 0 | §2.3 六项指标逐项可指：性能→plan-01 性能验收，US 覆盖→plan-06 矩阵 |
| 4. 验收标准防漂移 | 部分 | 3 | R1-P1（高）sourceTemplateId 传递链缺失；R1-P4（低）矩阵 AC-02 未列 plan-01；R1-P5（低）AC-07 单条详情失败承接未入矩阵 |
| 5. ADR 约束 | 通过 | 0 | ADR-1/2/3/5→plan-01、ADR-4→plan-04、ADR-6→plan-02、ADR-7→plan-03，演进余地（pg_trgm、SSE、拆独立资源）均未提前实施 |
| 6. 用户流程与状态机 | 通过 | 0 | §3.2 七条关键分支与 §3.3 列表/详情状态机逐项落地（plan-02 §2 状态机命名与架构完全一致；plan-03 详情态与轮询迁移） |
| 7. 模块职责与系统上下文 | 通过 | 0 | §4.2 六模块全映射；§4.3 过度设计避免清单全部被遵守（无 /api/iterations、无推送、无检索引擎、无多对多表） |
| 8. 运行链路 | 通过 | 0 | §6.1~6.5 五条链路逐步骤落地于 plan-01（3/4/5/6/7/8 节）、plan-02/03（前端侧）、plan-04（§6.3 含 flush 原则完整继承）、plan-05（§6.4 防御性口径） |
| 9. 数据模型与契约 | 通过 | 0 | §7.2 DTO 逐字段对齐（含 recipeSource/variablesSource/savedTemplate/sourceAssetId）；DB 四值/DTO 三值 pending 归并对齐；数据来源标注（user_input/frontend_computed/system_generated）继承；§7.6 术语映射入 README 护栏 |
| 10. 非功能需求 | 部分 | 2 | R1-P3（中）e2e:targeted 纳入无承接；R1-P7（低）快照纯文本渲染要求未显式继承。性能（P95 目标、并发 ≤2）、错误处理、五级降级链（L1~L4 均有场景映射）、安全输入面、可观测性两事件均完整继承 |
| 11. 实施建议与技术选型 | 通过 | 0 | Phase A/B/C 与 plan-01/02-03/04-05-06 对应，未超首版范围 |
| 12. 风险与未决策项 | 通过 | 1 | §8.6 四类风险均有缓解归属（ILIKE→plan-01 风险备注、守卫误判→plan-04、读放大→plan-03）；open_questions 空、README 无未决策项一致；"模板名搜索依赖需在交接文档明示"未落实，并入 R1-P1 |
| 13. 功能拆分质量 | 部分 | 1 | R1-P6（低）"互不修改对方文件"表述与两 plan 共同 modify iteration-detail-panel.tsx 矛盾。FEAT 粒度、文件清单规模、Task 步数（4~10 ≤ 12）均合格 |
| 14. 可执行性 | 部分 | 1 | R1-P2（中）red E2E 排序矛盾。文件路径全部具体且经核验真实（modify 15 个既有文件全部存在、create 11 个目标全部不存在）；验证命令全部可运行；前置条件可验证 |
| 15. 状态与报告契约 | 通过 | 0 | 状态枚举合法；README 状态机表与 FEAT frontmatter（全 draft/—）一致；本报告未修改任何计划文件 |

统计：通过 10 / 部分 5 / 缺失 0（共 15 维度）。

## 六、问题清单

| 编号 | 严重度 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- | --- |
| R1-P1 | 高 | plan-01 §实现规格 5（POST sourceTemplateId）、plan-04 §实现规格 2/文件清单、README §3 矩阵 AC-02 | **`sourceTemplateId` 只有服务端接收方，无任何前端功能承担发送责任，字段成为死代码。** 架构 §7.3 标注该字段为 frontend_computed（"工作台当前应用的 Style Memory id"），§8.6 明示"仅从 Style Memory 进入工作台后生成的记录携带该字段"并要求"在交接文档中明示"。经代码核验：现有 `POST /api/generation` 请求体（`src/app/api/generation/route.ts` GenerationRequestBody）无该字段；工作台经 `/workspace?templateId=` 加载模板（page.tsx L144-176）但生成请求不携带模板 id；plan-02/03/05/06 文件清单均不涉及生成请求体；plan-04 恢复载荷也不含该字段（IterationDetail 无 sourceTemplateId）。结果：`source_template_id` 列永远为空，AC-02 / PRD 业务规则 4"当记录来自已命名的 Style Memory 时，也可通过该名称找到"对任何真实记录都无法成立，且 plan-02 的 mock E2E 无法暴露该断层 | 在 plan-04（首选，已 modify `src/app/workspace/page.tsx` 与 `use-workspace-state.ts`）增加：① 工作台维护"当前应用 Style Memory id"状态（经 `/workspace?templateId=` 进入时记录）；② 生成请求体携带 `sourceTemplateId`；③ 验收项 + E2E 断言"从 Style Memory 进入工作台后生成，POST /api/generation 请求体含 sourceTemplateId"。同时在 plan-01 §交接上下文"下游消费方"与 README 矩阵 AC-02 验证方式中补该断言。若产品决定本期放弃该能力，则需同步删减 plan-01 §5 的 sourceTemplateId 规格与 §1 的 `source_template_id` 列（并回改架构），二选一，不得保持现状 |
| R1-P2 | 中 | plan-02/03/04/05/06 `## Task 列表` + `## 风险与边界`（执行顺序行）、README §6 全局护栏第 2 条 | **red E2E 在 Task 列表中位于实现任务之后，无法留存"预期失败"证据。** README 护栏要求"plan-02 ~ plan-06 在 ready-to-dev 前先产出 red E2E（预期失败证据）"，但 plan-02 的 Task 8（red）排在 Task 1-7（store/视图模型/hook/页面/组件/状态面/组件测试全部实现）之后；plan-03（Task 8 在 1-7 后）、plan-04（Task 7 在 1-6 后）、plan-05（Task 5 在 1-4 后）、plan-06（Task 3 在 1-2 后）同构。且各 plan"执行顺序"行只约束"red 先于最后一个实现 Task"（如 plan-02"Task 8 必须在 Task 9 实现前完成"），届时功能已实现、spec 会直接绿，red 阶段与 auto-dev 状态机（red-e2e → implement → green-e2e）冲突 | 每个 plan 将"E2E red"Task 移至实现 Task 之前（如 plan-02 调整为 Task 1 = E2E red，原 Task 1-7 顺延，原 Task 8 删除、Task 9 改为"实现至 E2E green"），或将"执行顺序"行改为"先完成 E2E red Task（含 spec 编写与失败证据留存），再执行其余实现 Task，最后 green"；两处（README 护栏与 plan Task 顺序）取一致口径 |
| R1-P3 | 中 | plan-06 文件清单 / README §6 全局护栏；对照架构 §9 Phase B 验证目标 | **架构明确"新增 targeted spec 纳入 `pnpm e2e:targeted`"，但 6 个 plan 的文件清单均未包含 `package.json` 修改，CI 发布验收门（verify:acceptance → e2e:targeted）将完全不覆盖本期 5 个新 spec。** 经核验 `package.json` 的 `e2e:targeted` 当前只含 8 个既有 spec | 在 plan-06 文件清单增加 `modify package.json`（`e2e:targeted` 追加 `workspace-iteration-memory-list/detail/restore/save-style-memory/iteration-memory-integration` 五个 spec），并在 plan-06 验收标准与验证命令中加入 `pnpm e2e:targeted`；同时在 README §6 全局护栏声明该归属，避免执行者视为越界 |
| R1-P4 | 低 | README §3 矩阵 AC-02 行 | plan-01 frontmatter 关联验收标准含 AC-02 且其 §5 有"AC-02 q 命中 promptSnapshot 或来源模板名"验收项，但 README 矩阵 AC-02 的"计划承接"仅列 plan-02、"验证方式"未提 plan-01 §5 后端验收，双向追踪不闭合 | README 矩阵 AC-02 计划承接改为"plan-01, plan-02"，验证方式补"plan-01 §5（q 双字段命中与组合筛选）" |
| R1-P5 | 低 | README §3 矩阵 AC-07 行、plan-03 frontmatter 关联验收标准 | PRD AC-07 前置含"单条详情加载失败"四类状态之一，该场景实际由 plan-03 承接（plan-03 §5"详情加载失败：列表与视图状态不动，可重试或关闭"及 E2E"详情 5xx 保留列表可重试"），但 README 矩阵 AC-07 计划承接仅列 plan-02、plan-06，plan-03 关联验收标准亦缺 AC-07，存在孤立验收项（无法从矩阵回溯） | README 矩阵 AC-07 计划承接改为"plan-02, plan-03, plan-06"并验证方式补"plan-03 §5（详情 5xx 面板）"；plan-03 frontmatter 关联验收标准改为 [AC-03, AC-04, AC-07] |
| R1-P6 | 低 | README §2 执行拓扑（第 49 行） | "plan-04 与 plan-05 都只消费 plan-03 的详情面板插槽，互不修改对方文件，可并行"与文件清单矛盾：两者均 modify 同一文件 `src/components/iterations/iteration-detail-panel.tsx`（plan-03 创建）。并行执行存在同文件合并冲突风险；README 虽有串行兜底（先 plan-04 后 plan-05），但拓扑声明与文件清单不自洽 | 将该句改为"plan-04 与 plan-05 分别填充详情面板的 primaryActions 与 secondaryActions 插槽，但共同 modify `iteration-detail-panel.tsx`；如并行执行需协调该文件，建议默认串行（先 plan-04 后 plan-05）"，或把 max_parallelism 调整为 1 并同步执行拓扑表阶段 4 |
| R1-P7 | 低 | plan-03 §实现规格 2（详情面板）；对照架构 §8.3 Prompt 注入行 | 架构安全策略"快照仅存储与回显，前端按纯文本渲染"未在 plan-03 详情面板规格中显式继承（提示内容、证据、排除项的渲染方式未声明）。React 默认转义使实际风险低，但架构明确要求且详情是快照内容的主要回显面 | plan-03 §实现规格 2 补一句"所有快照字段（提示、排除项、证据）按纯文本渲染，不做 HTML 注入"，并在组件测试说明中加对应断言点 |

## 七、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| plan-01 §实现规格 1 | Drizzle 循环外键的两种落地备选（FK 保留 + 迁移 SQL 手工补约束）与暂停条件 | 架构只定义列与索引，未约束 Drizzle 工具行为；这是实现细节的风险预案，不违背架构数据契约 |
| plan-04 §实现规格 1 | 守卫第三豁免比较字段具体化为 promptText / negativePromptText / params.aspectRatio / params.quality | 架构 §6.3"提示、排除项、参数逐字段相等"的可执行化，字段集与架构口径一致、未扩大未缩小 |
| plan-05 §实现规格 1 | 保存入口用 `resultFileUrl` 非空近似架构的 `resultAssetId` 非空 | IterationDetail DTO（架构 §7.2）本就无 resultAssetId 字段；服务端（plan-01 §8）仍按 resultAssetId 严格校验，前端近似判断与服务端校验双层一致 |
| plan-02 §实现规格 1 | 视图 store 增加 `scrollResetToken`、URL 同步用 `router.replace` | ADR-6"滚动位置保活 + URL 同步"的实现细节；replace 避免污染历史栈是明确且必要的工程约束 |
| plan-03 §交接上下文 | actions 插槽约定 `{ primaryActions?, secondaryActions? }` | 架构 §4.2 关键交互链路（继续此方向/保存入口并存）的组件化落地方式，为 plan-04/05 提供稳定接口 |
| plan-01 §验收标准 | 性能验收以"本地 seed ≥ 200 条 + 计时脚本/DevTools 人工确认"执行 | 架构 P95 目标的本地可执行化，量级声明（单用户千条）未改变 |

## 八、建议补丁计划

按优先级排列（只改计划文档，不动代码）：

1. **R1-P1（高，阻塞）**：plan-04 增加 sourceTemplateId 传递规格 + 验收 + E2E 断言（或反向删减 plan-01 的该字段规格，二选一）；同步 README 矩阵 AC-02 验证方式与 plan-01 交接上下文。
2. **R1-P2（中）**：plan-02 ~ plan-06 调整 Task 顺序，使 E2E red 先于实现任务执行，与 README §6 护栏第 2 条统一口径。
3. **R1-P3（中）**：plan-06 文件清单补 `modify package.json`（e2e:targeted 纳入 5 个新 spec）+ 验证命令补 `pnpm e2e:targeted`；README 全局护栏声明归属。
4. **R1-P4 / R1-P5（低）**：README 矩阵 AC-02 补 plan-01、AC-07 补 plan-03；plan-03 关联验收标准补 AC-07。
5. **R1-P6（低）**：README §2 并行表述修正（共同 modify iteration-detail-panel.tsx）。
6. **R1-P7（低）**：plan-03 补快照纯文本渲染要求与测试断言点。

修补完成后建议保持 README `status: review_ready` 并进入第 2 轮（r2）复查上述 7 项。
