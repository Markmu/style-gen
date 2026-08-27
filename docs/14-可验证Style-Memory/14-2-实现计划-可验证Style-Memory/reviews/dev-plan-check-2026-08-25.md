# 开发计划检查报告

- 检查日期：2026-08-25
- 检查技能：`dev-plan-check`（对照 `.agents/skills/dev-plan-check/SKILL.md`）
- 契约基准：`.agents/contracts/workflow-schema.json`（version 2026-08-05）

## 一、检查对象

- 架构文档：`docs/14-可验证Style-Memory/14-1-架构文档-可验证Style-Memory.md`（SSOT，经 3 轮 arch-check 收敛）
- 上游 PRD：`docs/14-可验证Style-Memory/14-0-需求设计-可验证Style-Memory.md`（AC-01～AC-11 为验收 SSOT）
- 实现计划：`docs/14-可验证Style-Memory/14-2-实现计划-可验证Style-Memory/`
- 功能数：7（plan-01～plan-07）+ README
- 文件清单真实性核查方式：对全部 `modify` 路径逐一执行仓库存在性检查（34 个路径全部存在），并对计划引用的关键符号（`RATE_LIMIT_CONFIGS`、`NAME_TAG_RULES`、`primeWorkspaceSnapshotFromTemplate`、`AnyPgColumn`、`currentTemplateId`、`validateVariables`、`validateSourceGenerationTaskId`、`StoredVisualRecipe`、`template_detail_queried` 等）与既有行为（空态双按钮均指向工作区、FK 约束名 `generation_tasks_source_template_id_templates_id_fk` 为 `NO ACTION`、现有筛选 `all/source-backed/prompt-only`、drizzle 迁移序号 0000–0004）做了源码级核对。

## 二、总评

- 结论：**有阻塞问题**
- 阻塞问题数：2（❌）
- 警告数：5（⚠️）
- 建议项数：4（📝）
- 判断：**暂不可直接进入 auto-dev 执行**。两个 blocker 均为"架构已明确点名 / 直接拥有被改组件回归职责的存量 e2e spec 未进入文件清单"，若按现计划执行，`pnpm verify:acceptance`（e2e:targeted 门）必然红。修复成本很低（补文件清单条目 + 补影响面说明），修复后可复审通过。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| README `workflow_type: create-dev-plan` | 通过 | frontmatter 第 2 行 |
| README `org_mode: feature` | 通过 | frontmatter 第 6 行 |
| README `status` 合法 | 通过 | `review_ready` ∈ `plan.readme_frontmatter_status` |
| README 8 个必备章节 | 通过 | 计划入口 / 执行拓扑 / 验收标准追踪矩阵 / 功能索引 / 开发状态机 / 全局护栏 / 执行前置与全局验证 / 未决策项与变更记录 齐全 |
| AC 矩阵表头固定 | 通过 | `\| AC-ID \| 需求原文 \| 架构承接 \| 计划承接 \| 验证方式 \| 当前状态 \|` 与 contract 一致 |
| `execution_order` 引用真实 plan | 通过 | 4 阶段全部指向 plan-01～07 真实文件 |
| `total_tasks` 与文件数一致 | 通过 | 7 = 7 |
| `total_phases` / `max_parallelism` | 通过 | 4 阶段；Phase 3 并行度 3 |
| `critical_path` 有效 | 通过 | plan-01→02→05→07 为真实最长链（长度 4） |
| plan 文件名与 `feat_id` 一致 | 通过 | 7/7 |
| plan `status` 合法 | 通过 | 全部 `draft` ∈ `plan.task_file_status` |
| plan 8 个核心章节 | 通过 | 功能概要 / 文件清单 / 实现规格 / Task 列表 / 验收标准 / 验证命令 / 交接上下文 / 风险与边界，7/7 齐全 |
| Task 与边界场景状态合法 | 通过 | 全部 `todo`；无 `waived`（无需原因行） |
| `depends_on` 引用真实功能 | 通过 | 无悬空引用 |
| 依赖 DAG 无环 | 通过 | 01/03→02→{04,05,06}→07，拓扑排序成立 |
| 报告路径契约 | 通过 | 本文件位于 `{plan-dir}/reviews/dev-plan-check-{date}.md` |

## 四、验收标准追踪

| AC-ID | 架构要求（§2.4） | README 承接 | FEAT 承接（各 plan 关联验收标准） | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 列表表达真实风格语义与验证状态 | plan-01, plan-02, plan-04 | plan-01 ✓ / plan-02 ✓ / plan-04 ✓ | 一致 |
| AC-02 | 搜索、筛选与可见信息一致 | plan-02, plan-04 | plan-02 ✓ / plan-04 ✓ | 一致（提示文案口径见 📝-1） |
| AC-03 | 详情解释可信与复用 | plan-02, plan-05 | plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-04 | 诚实保存已验证/待验证 | plan-02, plan-06 | plan-02 ✓ / plan-06 ✓ | 一致 |
| AC-05 | 治理动作不制造虚假状态 | plan-02, plan-05 | plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-06 | 复用前后身份与准备状态一致 | plan-07 | plan-07 ✓（usage 聚合由 plan-01/02 内部支撑，README 已注明） | 一致 |
| AC-07 | 删除双分支安全终点 | plan-01, plan-02, plan-05 | plan-01 ✓ / plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-08 | 弹层与菜单连续键盘操作 | plan-03, plan-05, plan-06, plan-07 | plan-03/05/06/07 ✓，但 **plan-04 亦声明 AC-08（清除搜索按钮 44px）而 README 行未列 plan-04** | ⚠️ 见 W3 |
| AC-09 | 旧资产与缺失诚实可用 | plan-01, plan-02, plan-05 | plan-01 ✓ / plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-10 | 空态/未登录/服务异常可恢复 | plan-04, plan-05 | plan-04 ✓ / plan-05 ✓ | 一致 |
| AC-11 | 冲突/失败后无损重试 | plan-02, plan-06 | plan-02 ✓ / plan-06 ✓ | 一致 |

反向核查（FEAT 声明的 AC 是否都能回溯 README 矩阵）：除 plan-04 的 AC-08 外全部可回溯；无孤立验收项。E2E-TDD：plan-04/05/06/07 均有 red 先行 Task 与真实 spec/命令；plan-01/02/03 的 E2E 不适用声明均有理由（纯数据层 / 纯 API / 纯原语，用户可观察行为由 plan-04～07 覆盖）。

## 五、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 1. 核心闭环与系统目标 | 通过 | 0 | README 计划入口完整转述系统摘要与"保存→验证→复用"闭环，权威边界（README 只管索引/拓扑/状态机）明确 |
| 2. 范围与非目标 | 通过 | 0 | 架构 §2.1 七项交付全部有 FEAT 承接；十条"明确不做"+ 架构层补充均未被引入；Q1–Q5 已决策项全部继承（Q1 前 2 条摘要→plan-01/04，Q2 仅最近使用排序→plan-04，Q3 预填分支→plan-06，Q4 不回填→plan-01/04/05，Q5 默认不勾选→plan-06） |
| 3. 成功标准 | 通过（有建议） | 1 | p95 ≤ 500ms / ≤ 300ms 分别落 plan-04/05 性能验收；键盘成功标准由 AC-08 e2e 断言承载；性能造数方式未明确（📝-3） |
| 4. 验收标准防漂移 | 有警告 | 1 | AC-01～11 全映射；唯一不一致为 README AC-08 行遗漏 plan-04（W3） |
| 5. ADR 约束 | 通过 | 0 | 8/8 ADR 继承：ADR-1（README 护栏 1 + plan-02 400 拒绝 + plan-06 不提交）、ADR-2（护栏 2 + plan-01 FK + AC-07 链）、ADR-3（plan-01 四组 text[]）、ADR-4（plan-01 LATERAL 聚合、无冗余字段）、ADR-5（plan-07 握手 + 退化）、ADR-6（护栏 3 + plan-03 暂停条件防 Radix）、ADR-7（护栏 4 + plan-07 §3）、ADR-8（护栏 5 + plan-01 不更名 + plan-04 导航改名点）；ADR 演进余地（jsonb 溯源、缓存列、别名层）均未提前实施 |
| 6. 用户流程与状态机 | 通过 | 0 | 主流程三旅程节点全覆盖；§3.2 十一条关键分支逐一落位（plan-05/06/07 边界场景表）；两态状态机与写点矩阵在 plan-01 派生矩阵测试中逐项对齐 |
| 7. 模块职责与系统上下文 | 通过 | 0 | 6 个架构模块 ↔ 7 个 plan 映射清楚；§4.2 六条 UI 交互链路分别进入对应 plan 实现规格；§4.3 过度设计规避全部遵守 |
| 8. 运行链路 | 通过 | 0 | §6.1 搜索谓词（六路 ILIKE + 变量聚合子查询，排除 defaultValue 与 JSON 键名）逐字进入 plan-01；§6.4 回退判定（trim→排序→集合比较）、相关集定义（source_template_id OR source_generation_task_id + completed + result_asset_id 非空）双份进入 plan-01/02；§6.3 V1/V2/fallback 预填映射完整进入 plan-06；§6.5 影响判定（三分支保守口径）与必填变量定义（trim(defaultValue)===''）完整进入 plan-07；同步边界一致（无新增异步任务） |
| 9. 数据模型与契约 | 通过 | 0 | §7.2 五个类型原样落 plan-01 §3；§7.3 八端点全部落 plan-02（含字段数据来源标注 user_input/frontend_computed）；枚举 `user_verified / pending_verification` 双侧对齐；`SaveStyleMemoryRequest` 不含 verificationStatus；下游消费方在交接上下文逐条声明 |
| 10. 非功能需求 | 通过（有建议） | 1 | §8.1 落 plan-04/05（📝-3 造数）；§8.2 L1–L5 完整分布（L1→plan-04/05，L2→plan-05，L3→plan-06，L4/L5→plan-04/05/07）；§8.3 校验上限/限流统一/鉴权落 plan-02、CHECK 落 plan-01；§8.4 无新增成本如实继承；§8.5 四个日志事件落 plan-02、`style_memory_reused` 落 plan-07 前端 console（📝-2 口径标注） |
| 11. 实施建议与技术选型 | 有警告 | 1 | 技术栈一致、阶段划分符合依赖；plan-06 对 plan-05 的软依赖未入 DAG（W2） |
| 12. 风险与未决策项 | 通过 | 0 | 架构 §8.6 七条风险均有对应缓解（焦点回归→plan-03 组件测试、FK 迁移→plan-01 双演练、回退口径→plan-01 单测矩阵、sessionStorage→plan-07 退化、ILIKE→plan-01 风险声明、存量待验证→plan-04/05 文案、存量 e2e→见维度 14 问题）；`open_questions: []` 与 README 未决策项"无"一致 |
| 13. 功能拆分质量 | 通过 | 0 | 7 个 FEAT 均为连贯能力；文件清单规模合理（最大 plan-02 为 11 项）；Task 列表 4–9 步均 ≤ 12；DAG 无环；前后端契约经 plan-01 类型 + plan-02 契约对接验收对齐 |
| 14. 可执行性 | **有阻塞** | 4 | 全部 34 个 modify 路径真实存在；验证命令与 package.json 脚本一致（db:generate/push/reset、vitest、e2e --project=workspace、verify:fast/acceptance 均存在）；但存量 e2e 影响面遗漏两个架构点名的 spec（B1/B2）与一批改名/视觉必然变红的 spec（W1），plan-05 引用不存在的 iterations focus 参数（W5） |
| 15. 状态与报告契约 | 通过 | 0 | 状态全部合法；README 状态机与各 plan 一致（全部 red-e2e 待启动，plan-01/02/03 已注明契约测试替代）；本报告路径符合 `plan_review_filename_pattern` |

## 六、问题清单

| 编号 | 严重级别 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- | --- |
| B1 | ❌ | plan-04 §文件清单（对照架构 §9 Phase B 第 7 条） | 架构明确点名需更新的三个存量 spec 之一 `e2e/template-default-values.spec.ts` 未进入 plan-04 文件清单（只列了 template.spec.ts 与 ai-first-style-memory.spec.ts）。该 spec 断言卡片 "Use memory" source-backed 快照路径与工作区保存弹窗，处于 `e2e:targeted` 验收门内，卡片重设计 + DTO 更换后必然变红 | plan-04 文件清单增加 `modify e2e/template-default-values.spec.ts`；plan-06 同步注明其保存弹窗相关用例与本功能协同更新 |
| B2 | ❌ | plan-06 §文件清单 | `e2e/workspace-iteration-save-style-memory.spec.ts` 是现有单步保存对话框（预填 content/variables、名称空禁提交、POST 体断言）的直接回归 owner，plan-06 将其重构为三步向导必然使其失败；该 spec 在 `e2e:targeted` 门内但未列入任何 plan 的文件清单（plan-06 只列了 workspace-ai-first-iteration-memory.spec.ts） | plan-06 文件清单增加 `modify e2e/workspace-iteration-save-style-memory.spec.ts`，并在实现规格 §4 注明按三步向导口径改写（入口条件/已保存态用例保留，对话框预填与提交体用例改写） |
| W1 | ⚠️ | plan-04 §文件清单 / §实现规格 4（left-sidebar 改名） | 导航改名（"Library"→"Style Memory"、ariaLabel "Style Memory Library"→"Style Memory"）将破坏未声明的存量 spec：`ai-first-shell.spec.ts`（断言 `/^Library$/` 与 `/style memory library/i`，在 targeted 门内）、`workspace-iteration-memory-integration.spec.ts`（断言 `/style memory library/i`，在 targeted 门内）、`precision-glass-shell.spec.ts`（断言 link name 'Style Memory Library'）；`ai-first-visual-regression.spec.ts`（targeted 门内）的模板页截图基线也会因卡片重设计失效。均不在任何 plan 的文件清单或"允许修改的额外文件"中，违背架构 §8.6"Phase B/C 内同步更新受影响 spec" | plan-04 文件清单补入上述 spec（或在 README 全局护栏 8 附"存量 spec 影响清单"），视觉基线更新明确为 plan-04 职责；至少将 ai-first-shell / workspace-iteration-memory-integration 两个 targeted 门内 spec 纳入 |
| W2 | ⚠️ | plan-06 frontmatter depends_on / README §2 执行拓扑 Phase 3 | plan-06 的 AC-04 验收（"成功直接进入新 Memory 详情"）依赖 plan-05 交付的 `/workspace/templates/[id]` 路由，但 depends_on 未含 plan-05，README 将两者置于 Phase 3 并行；现仅以"临时回退跳列表"缓解，会造成 green 证据作废需二次重跑 | plan-06 depends_on 增加 plan-05（Phase 3 内 05 先于 06），或在 plan-06 验收标准中显式拆分"临时口径（跳列表）"与"切换正式跳转后重跑 green"两阶段证据要求 |
| W3 | ⚠️ | README §3 验收矩阵 AC-08 行 | plan-04 关联验收标准含 AC-08（清除搜索按钮可理解名称 + ≥44×44px，验收 checklist 有对应项），但 README AC-08 的"计划承接"仅列 plan-03/05/06/07、"验证方式"未含 plan-04，矩阵与 FEAT 声明不一致 | README AC-08 计划承接补 `plan-04`，验证方式补"plan-04 §5 清除搜索按钮命中面积断言" |
| W4 | ⚠️ | plan-07 §风险与边界（允许修改的额外文件 vs 风险备注） | 风险备注承诺"若存量 spec 因本期改动红，修复属本功能职责"，但"允许修改的额外文件"仅列 analysis-pane.tsx，未授权修改 e2e/ 存量 spec；与 B1/B2/W1 叠加后最终回归门的修复动作缺少文件清单支撑 | plan-07 允许修改的额外文件补"e2e/ 下因本期改动变红的存量 spec（仅限用例口径对齐，不新增场景）"，或把该职责上移到对应上游 plan |
| W5 | ⚠️ | plan-05 §实现规格 2（验证依据分区） | "来源 Iteration [打开]"指定跳 `/workspace/iterations?focus={id}`，但 iterations 页面现有 query 参数仅 `q`/`status`，不支持 `focus`（focus 参数是 templates 列表页的既有模式）；plan-05 文件清单未包含 `src/app/workspace/iterations/page.tsx`，该跳转规格按现状不可实现 | 二选一：plan-05 文件清单补 modify `src/app/workspace/iterations/page.tsx`（增 focus 定位，复用 templates 页模式）；或将跳转规格降级为普通导航（不带 focus），删除对不存在参数的引用 |
| N1 | 📝 | plan-04 §实现规格 3（搜索提示） | placeholder"搜索名称、说明、风格规则、排除约束或变量"弱化了架构 §6.1 的显式口径决策（承诺清单为"名称、说明、风格规则（含指纹与增强方向）、排除约束、变量名与标签"），丢失"含指纹与增强方向""变量名与标签"表述 | 对齐架构 §6.1 原文措辞，或在 plan-04 注明采用其概括形式的理由 |
| N2 | 📝 | plan-07 §实现规格 1（确认动作） | 架构 §8.5 的 `style_memory_reused` 事件基线是"沿用既有结构化 JSON 日志"（服务端），plan-07 落为"前端 console 结构化日志"——因预检确认不触发服务端调用，该折中合理，但属对架构口径的适配扩展且仓库无前端结构化日志先例，未标注来源决策 | 在 plan-07 交接上下文标注"§8.5 事件无服务端写点，故前端 console 承载"的适配说明，便于 task-review 时不被判为漂移 |
| N3 | 📝 | plan-04 / plan-05 性能验收 | p95 ≤ 500ms / ≤ 300ms 以"本地 DevTools Network 人工确认"承载且提到"≤ 500 条 mock 数据"，但未给出造数手段（seed 脚本 / SQL / fixture），该验收项难以稳定留证与复跑 | 在 plan-04（或 README 执行前置）补一条造数方式（如临时 seed 脚本或 psql 批插），并约定记录 p95 的样本数 |
| N4 | 📝 | README §3 / §5 与 plan-07 §6 | 计划文件章节标题无编号，但多处使用"plan-04 §5""plan 文件 §8""README §3"等编号引用，需按章节顺序推断（验收标准=第 5 节、风险与边界=第 8 节），存在歧义 | 给各 plan 文件章节标题加编号（`## 5. 验收标准` 等），或统一改为章节名引用 |

## 七、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| plan-01 §实现规格 4 | `normalizeRuleArray` 在架构"trim→排序→串比较"基础上增加"过滤空串" | 空串是输入噪声，过滤后集合语义不变；且服务端判定与前端提示共用同一实现，双侧同口径的 ADR-1 风险反而更稳。建议补一行注释声明为对 §6.4 的显式细化 |
| plan-02 §实现规格 1 | 限流 identifier 采用 userId 优先、无 session 回退 IP | 架构写"30 次/小时/IP"；五个写端点全部要求登录（401 优先），userId 维度更精确且不改变量级口径 |
| plan-02 §实现规格 9 | candidates 端点 limit 默认 20 上限 50 | 架构只要求"cursor/limit 游标分页"，未定具体值；与既有列表端点风格一致 |
| plan-01 §实现规格 3 | 新增 `SaveStyleMemoryRequest` / `UpdateStyleMemoryRequest` 请求类型 | 架构 §7.3 有字段清单与数据来源标注，落为显式类型是契约可校验性的自然落地产物，且明确不含 `verificationStatus` |
| plan-04 §不在范围 | 卡片移除复制/删除按钮（治理集中详情） | PRD §1.3"详情为统一入口"决策的直接执行，架构 §2.1 第 3 条同口径 |

## 八、建议补丁计划

按优先级：

1. **[B1]** plan-04 文件清单补 `modify e2e/template-default-values.spec.ts`（架构 §9 Phase B 第 7 条点名的第三个 spec）；plan-06 实现规格 §4 加一句协同说明。
2. **[B2]** plan-06 文件清单补 `modify e2e/workspace-iteration-save-style-memory.spec.ts`，实现规格注明按三步向导口径改写该 spec（保留入口条件/已保存态用例）。
3. **[W1]** plan-04 文件清单（或 README 全局护栏 8 的影响清单）补 `ai-first-shell.spec.ts`、`workspace-iteration-memory-integration.spec.ts`、`precision-glass-shell.spec.ts`、`ai-first-visual-regression.spec.ts`（视觉基线更新）。
4. **[W4]** plan-07"允许修改的额外文件"补 e2e/ 存量 spec 的口径对齐授权（与 1–3 形成闭环兜底）。
5. **[W2]** plan-06 depends_on 补 plan-05，或拆分临时/正式跳转的两阶段 green 证据要求。
6. **[W3]** README AC-08 行补 plan-04。
7. **[W5]** plan-05 处理 iterations focus 参数（补文件或降级跳转规格）。
8. **[N1–N4]** 措辞对齐、决策标注、造数方式、章节编号——低优先级，可与上述一并修改。

修补完成后建议快速复审（重点复核文件清单与 README 矩阵两处），即可进入 auto-dev。
