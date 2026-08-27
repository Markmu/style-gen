# 开发计划检查报告（第 2 轮复查）

- 检查日期：2026-08-25（r2，收敛轮）
- 检查技能：`dev-plan-check`（对照 `.agents/skills/dev-plan-check/SKILL.md`）
- 契约基准：`.agents/contracts/workflow-schema.json`（version 2026-08-05）
- 上一轮报告：`reviews/dev-plan-check-2026-08-25.md`（2 阻塞 + 5 警告 + 4 建议）
- 本轮判据：以"可否开始 auto-dev 执行"为总判据；仅剩不阻塞执行的表达级备注时如实标注为不阻塞。

## 一、检查对象

- 架构文档：`docs/14-可验证Style-Memory/14-1-架构文档-可验证Style-Memory.md`（SSOT）
- 上游 PRD：`docs/14-可验证Style-Memory/14-0-需求设计-可验证Style-Memory.md`（AC-01～AC-11 为验收 SSOT，PRD §验收标准 11 条原文已逐条对照）
- 实现计划：`docs/14-可验证Style-Memory/14-2-实现计划-可验证Style-Memory/`（README + plan-01～07）
- 文件清单真实性核查方式：对第一轮修复**新增的全部 modify 路径**（7 个）逐一执行仓库存在性检查（全部存在）；并对修复涉及的既有行为做了源码级复核——
  - `e2e/ai-first-shell.spec.ts` 第 106/133 行断言 `/style memory library/i`、第 138 行断言 `/^Library$/i`（导航改名后必红，且该 spec 在 `e2e:targeted` 门内）；
  - `e2e/precision-glass-shell.spec.ts` 第 28 行断言 link `'Style Memory Library'`（改名后必红，不在 targeted 门内，全量门）；
  - `e2e/template-default-values.spec.ts` mock 了 Style Memory 卡片、"Use memory" source-backed 快照路径与 POST 保存体（卡片重设计 + DTO 更换后必受影响；注意：该 spec **不在** `e2e:targeted` 脚本列表内，见新备注 R2-2）；
  - `e2e/workspace-iteration-save-style-memory.spec.ts` 在 `e2e:targeted` 门内（package.json 脚本确认）；
  - `src/app/workspace/iterations/page.tsx` 现有 query 参数仅 `q`/`status`（另有内部 `selectedId` 状态，见 R2-3），无 `focus` 参数——plan-05 新增该文件修改的必要性成立；
  - `src/app/workspace/templates/page.tsx` 第 116–128 行存在 `focusParam` / `pendingFocusId` 模式——plan-05 所写"参照 templates 页既有 focus 实现模式"与真实代码一致；
  - `src/components/app-shell.tsx` 真实存在于该路径（plan-04 与架构 ADR-8 引用正确）；
  - `playwright.config.ts` 存在 `name: 'workspace'` project；package.json 的 `verify:fast/acceptance`、`db:generate/push/reset`、`e2e --project=workspace` 脚本全部与计划验证命令一致。

## 二、总评

- 结论：**通过（可开始 auto-dev 执行）**
- 阻塞问题数：0（❌）
- 警告数：1（⚠️，不阻塞：README 变更记录与 5 阶段拓扑的记述性矛盾）
- 建议项数：3（📝，均为表达/实现提示级）
- 第一轮 11 项（B1/B2/W1–W5/N1–N4）：**全部修复**（其中 B1 的修复说明含一处不准确表述，见 R2-2，不影响修复有效性）
- 修复过程引入的新矛盾/冲突：未发现实质性冲突。重点专项复核结论——
  1. **拓扑 5 阶段自洽**：frontmatter `total_phases: 5`、`execution_order` 5 组、mermaid 图、阶段表、`max_parallelism: 2`（Phase 1/3 各 2，其余 1）、`critical_path`（plan-01→02→05→06→07，长度 5 = 阶段数，经依赖闭包核算为真实最长链，plan-03→05→06→07 与 01→02→04→07 均为长度 4）、7 个 plan 的 frontmatter `phase` 数字（1/1/2/3/3/4/5）、功能索引依赖列，**全部一致**；
  2. **plan-04 与 plan-06 对 `e2e/template-default-values.spec.ts` 的双 modify 不冲突**：Phase 3 → Phase 4 的阶段顺序保证 plan-04 先行；两 plan 覆盖不同用例面（plan-04 = 卡片/DTO 相关；plan-06 = 保存弹窗/提交体相关），且 plan-06 文件清单已显式注明"与 plan-04 协同……若 plan-04 已完成则仅核对无回归"；
  3. **iterations focus 支持有完整配套**：plan-05 文件清单（modify `src/app/workspace/iterations/page.tsx`）+ 实现规格（`pendingFocusId` 参照模式）+ Task 8 + 验收标准（"来源 Iteration 打开链接带 focus={id} 且 iterations 页定位高亮"）四者齐备。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| README `workflow_type: create-dev-plan` | 通过 | frontmatter 第 2 行 |
| README `org_mode: feature` | 通过 | frontmatter 第 6 行 |
| README `status` 合法 | 通过 | `review_ready` ∈ `plan.readme_frontmatter_status` |
| README 8 个必备章节 | 通过 | 计划入口 / 执行拓扑 / 验收标准追踪矩阵 / 功能索引 / 开发状态机 / 全局护栏 / 执行前置与全局验证 / 未决策项与变更记录 齐全 |
| AC 矩阵表头固定 | 通过 | `\| AC-ID \| 需求原文 \| 架构承接 \| 计划承接 \| 验证方式 \| 当前状态 \|` 与 contract 一致 |
| `execution_order` 引用真实 plan | 通过 | 5 组全部指向 plan-01～07 真实文件，且与各 plan frontmatter `phase` 完全对应 |
| `total_tasks` / `total_task_files` 与文件数一致 | 通过 | 7 = 7 = 7 |
| `total_phases` / `max_parallelism` / `critical_path` | 通过 | 5 阶段；最大并行度 2（与 DAG 匹配）；关键路径长度 5 为真实最长链 |
| plan 文件名与 `feat_id` 一致 | 通过 | 7/7 |
| plan `status` 合法 | 通过 | 全部 `draft` ∈ `plan.task_file_status` |
| plan 8 个核心章节 | 通过 | 7/7 齐全 |
| Task 与边界场景状态合法 | 通过 | 全部 `todo`；无 `waived` |
| `depends_on` 引用真实功能 | 通过 | 无悬空引用；与 mermaid / 功能索引 / 阶段表交叉一致 |
| 依赖 DAG 无环 | 通过 | {01,03}→02→{04,05}→06→07（05→06、06→07），拓扑排序成立 |
| 报告路径契约 | 通过 | 本文件 `{plan-dir}/reviews/dev-plan-check-2026-08-25-r2.md`；`r2` 后缀为主会话指定的同日第二轮命名，避免覆盖第一轮报告 |

## 四、第一轮修复核验（11 项）

| 编号 | 修复状态 | 核验说明 |
| --- | --- | --- |
| B1（❌ template-default-values.spec.ts 未入清单） | **已修复** | plan-04 文件清单新增 `modify e2e/template-default-values.spec.ts`，Task 7 说明与验证命令（第 2 组命令）均覆盖；plan-06 文件清单同步注明协同口径（"若 plan-04 已完成则仅核对无回归"）。源码核实该 spec mock 卡片/"Use memory" 快照/POST 保存体，确受卡片重设计与 DTO 更换影响。备注：修复说明中"targeted 门内"表述不准确（见 R2-2），不影响修复本身有效性 |
| B2（❌ workspace-iteration-save-style-memory.spec.ts 未入清单） | **已修复** | plan-06 文件清单新增该 spec，说明明确按三步向导口径改写（入口条件与"已保存为 Style Memory"状态用例保留、单步表单断言改为向导步骤断言）；Task 6 与验证命令覆盖。package.json 确认该 spec 在 `e2e:targeted` 门内，说明文字"targeted 门内"准确 |
| W1（⚠️ 改名/卡片改版波及的 4 个存量 spec 未声明） | **已修复** | plan-04 文件清单补入 `ai-first-shell.spec.ts`、`workspace-iteration-memory-integration.spec.ts`、`precision-glass-shell.spec.ts`、`ai-first-visual-regression.spec.ts`（视觉基线重拍），Task 7 与验证命令第 2/3 组覆盖。源码断言逐一核实（shell 第 106/133/138 行、precision-glass 第 28 行）确受影响；超出第一轮"至少纳入两个 targeted 门内 spec"的最低要求 |
| W2（⚠️ plan-06 对 plan-05 软依赖未入 DAG） | **已修复** | plan-06 frontmatter `depends_on: ["plan-02", "plan-03", "plan-05"]`、`phase: 4`；README mermaid 增加 `P05 --> P06`、`execution_order` 拆出独立 Phase 4、阶段表与执行顺序说明同步；plan-06 前置条件/风险与边界/交接上下文三处均注明"`depends_on` 正式依赖，非临时回退"。green 证据二次作废风险消除 |
| W3（⚠️ README AC-08 行遗漏 plan-04） | **已修复** | README §3 AC-08 行"计划承接"现为 `plan-03, plan-04, plan-05, plan-06, plan-07`，"验证方式"补"plan-04 验收标准（清除搜索按钮命中面积断言）"；与 plan-04 关联验收标准 `[AC-01, AC-02, AC-08, AC-10]` 及其功能验收 AC-08 项（≥44×44px 断言）双向一致 |
| W4（⚠️ plan-07 回归修复缺少文件授权） | **已修复** | plan-07"允许修改的额外文件"补入"`e2e/` 下因本期改动变红的存量 spec（仅限断言与口径对齐更新，不新增场景——最终回归职责授权）"，与 B1/B2/W1 的清单化修复形成兜底闭环 |
| W5（⚠️ plan-05 引用不存在的 iterations focus 参数） | **已修复** | plan-05 文件清单新增 `modify src/app/workspace/iterations/page.tsx`（文件真实存在，现仅 `q`/`status` 参数，新增必要）；实现规格注明参照 templates 页既有 `pendingFocusId` 模式（该模式在 `src/app/workspace/templates/page.tsx` 116–128 行真实存在）；Task 8 + 验收标准配套（"带 focus={id} 且定位高亮，仅当该 Iteration 在默认列表窗口内"为合理保守口径） |
| N1（📝 搜索提示口径弱化） | **已修复** | plan-04 §3 搜索提示改为承诺全量口径"名称、说明、风格规则（含指纹与增强方向）、排除约束、变量名与标签"（与架构 §6.1 逐字一致），并明确 placeholder 可精简但 aria-label/help 文案必须承载全量口径 |
| N2（📝 style_memory_reused 前端 console 无来源标注） | **已修复** | plan-07 交接上下文补"落为前端 console 结构化日志属适配决策——预检确认无服务端写点（架构 §8.5 的服务端日志基线不适用此事件，由前端承载并保持结构化格式）" |
| N3（📝 性能验收缺造数手段） | **已修复** | plan-04 性能验收补 seed SQL 方式（`INSERT ... SELECT generate_series` 构造 ≥ 500 条 Memory 及关联 generation_tasks、测量后清理、DevTools Network 记录 20 次请求 p95、seed SQL 留存工作记录）；plan-05 复用同一 seed 数据，避免重复造数 |
| N4（📝 章节编号引用歧义） | **已修复**（以改引用方式实现） | plan 文件章节标题仍无编号，但全部跨文件引用已改为有效形式：README 自身章节有编号（"README §3" = 验收标准追踪矩阵，准确）；plan 内部小节有编号（"§实现规格 1" 等均有效）；跨文件引用改为章节名（README 状态机"见 plan 文件「风险与边界」"）。抽查 7 个文件无残留指向未编号章节的歧义 `§N` 引用 |

## 五、验收标准追踪（双向复核）

| AC-ID | 架构要求（§2.4） | README 承接 | FEAT 承接（各 plan 关联验收标准） | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 列表表达真实风格语义与验证状态 | plan-01, plan-02, plan-04 | plan-01 ✓ / plan-02 ✓ / plan-04 ✓ | 一致 |
| AC-02 | 搜索、筛选与可见信息一致 | plan-02, plan-04 | plan-02 ✓ / plan-04 ✓ | 一致（提示口径已对齐架构 §6.1 全量承诺） |
| AC-03 | 详情解释可信与复用 | plan-02, plan-05 | plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-04 | 诚实保存已验证/待验证 | plan-02, plan-06 | plan-02 ✓ / plan-06 ✓ | 一致（跳转目标依赖已入 DAG，W2 修复） |
| AC-05 | 治理动作不制造虚假状态 | plan-02, plan-05 | plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-06 | 复用前后身份与准备状态一致 | plan-07 | plan-07 ✓（usage 聚合由 plan-01/02 内部支撑，README 已注明） | 一致 |
| AC-07 | 删除双分支安全终点 | plan-01, plan-02, plan-05 | plan-01 ✓ / plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-08 | 弹层与菜单连续键盘操作 | plan-03, plan-04, plan-05, plan-06, plan-07 | plan-03/04/05/06/07 ✓（W3 修复后 README 行与 FEAT 声明双向一致） | 一致 |
| AC-09 | 旧资产与缺失诚实可用 | plan-01, plan-02, plan-05 | plan-01 ✓ / plan-02 ✓ / plan-05 ✓ | 一致 |
| AC-10 | 空态/未登录/服务异常可恢复 | plan-04, plan-05 | plan-04 ✓ / plan-05 ✓ | 一致 |
| AC-11 | 冲突/失败后无损重试 | plan-02, plan-06 | plan-02 ✓ / plan-06 ✓ | 一致 |

反向核查（FEAT 声明的 AC 全部可回溯 README 矩阵行）：通过，无孤立验收项。PRD §验收标准 AC-01～AC-11 原文（PRD 369–419 行）与 README"需求原文"列摘要逐条对应，无改写弱化。E2E-TDD：plan-04/05/06/07 均有 red 先行 Task 与真实 spec/命令；plan-01/02/03 的 E2E 不适用声明均有架构理由（纯数据层 / 纯 API / 纯原语，用户可观察行为由 plan-04～07 覆盖）。

## 六、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 1. 核心闭环与系统目标 | 通过 | 0 | README 计划入口完整转述系统摘要与"保存→验证→复用"闭环，权威边界明确 |
| 2. 范围与非目标 | 通过 | 0 | 架构 §2.1 七项交付全部有 FEAT 承接；十条"明确不做"+ 架构层补充均未被引入；Q1–Q5 已决策项全部继承 |
| 3. 成功标准 | 通过 | 0 | p95 ≤ 500ms / ≤ 300ms 分别落 plan-04/05 且已有 seed SQL 造数方式与样本口径（20 次）；键盘成功标准由 AC-08 e2e 键盘断言承载；状态诚实性/删除边界由 plan-01/02 验收矩阵承载 |
| 4. 验收标准防漂移 | 通过 | 0 | AC-01～11 双向全映射（含 AC-08 的 plan-04 补齐）；无孤立验收项；E2E-TDD 覆盖完整 |
| 5. ADR 约束 | 通过 | 0 | 8/8 ADR 继承（ADR-1/2/3/4/5/6/7/8 在 README 护栏与对应 plan 实现规格中均可追溯）；演进余地（jsonb 溯源、缓存列、别名层、pg_trgm）均未提前实施 |
| 6. 用户流程与状态机 | 通过 | 0 | 三旅程节点全覆盖；§3.2 十一条关键分支逐一落位；两态状态机与写点矩阵在 plan-01 派生矩阵测试对齐；`user_verified / pending_verification` 枚举在 schema CHECK、API 白名单、前端筛选三侧一致 |
| 7. 模块职责与系统上下文 | 通过 | 0 | 6 个架构模块 ↔ 7 个 plan 映射清楚；§4.2 六条 UI 交互链路分别进入对应 plan；§4.3 过度设计规避全部遵守 |
| 8. 运行链路 | 通过 | 0 | §6.1 搜索谓词（六路 ILIKE + 变量聚合子查询，排除 defaultValue 与 JSON 键名）、§6.4 回退判定（trim→排序→集合比较，plan-01 增加"过滤空串"为合理细化）与相关集定义、§6.3 V1/V2/fallback 预填映射、§6.5 影响判定（三分支保守口径）与必填变量定义（trim(defaultValue)===''）均完整进入对应 plan；同步边界一致 |
| 9. 数据模型与契约 | 通过 | 0 | §7.2 五类型原样落 plan-01；§7.3 八端点全部落 plan-02（含数据来源标注）；`SaveStyleMemoryRequest` 不含 verificationStatus；下游消费方在交接上下文逐条声明 |
| 10. 非功能需求 | 通过 | 0 | §8.1 落 plan-04/05（含造数）；§8.2 L1–L5 完整分布；§8.3 校验上限/限流统一/鉴权落 plan-02、CHECK 落 plan-01；§8.4 如实继承；§8.5 四个服务端日志事件落 plan-02、style_memory_reused 落 plan-07 前端 console（N2 已标注适配决策来源） |
| 11. 实施建议与技术选型 | 通过 | 0 | 技术栈一致；拓扑改为 5 阶段后与依赖 DAG 完全匹配（W2 修复），阶段划分符合依赖序 |
| 12. 风险与未决策项 | 通过 | 0 | 架构 §8.6 七条风险均有缓解落位（含存量 e2e 风险——本轮已由 B1/B2/W1/W4 清单化闭环）；`open_questions: []` 与 README 未决策项"无"一致 |
| 13. 功能拆分质量 | 通过 | 0 | 7 个 FEAT 均为连贯能力；plan-04 文件清单扩至 14 项系回归职责必要纳入（见"合理扩展"）；Task 列表 4–9 步均 ≤ 12；DAG 无环；前后端契约经 plan-01 类型 + plan-02 契约对接验收对齐 |
| 14. 可执行性 | 通过 | 0 | 新增 7 个 modify 路径全部真实存在；验证命令与 package.json 脚本一致；存量 spec 影响面已清单化并有 plan-07 兜底授权；iterations focus 规格按真实代码模式可落地 |
| 15. 状态与报告契约 | 通过（有记述性备注） | 1 | 状态全部合法；README 状态机与各 plan 一致（全部 red-e2e 待启动，plan-01/02/03 已注明契约/组件测试替代）；本报告路径符合用户指定的 r2 命名。备注：README §8 变更记录未随拓扑 4→5 阶段更新（R2-1） |

## 七、新发现问题详情

| 编号 | 严重级别 | 所在文件与章节 | 问题描述 | 修复建议 |
| --- | --- | --- | --- | --- |
| R2-1 | ⚠️（不阻塞 auto-dev） | `README.md` §8 未决策项与变更记录 | 变更记录仍写"初始生成：……4 阶段执行拓扑"，与 frontmatter `total_phases: 5`、执行拓扑表 5 阶段、execution_order 5 组自相矛盾；且未记录第一轮修复带来的变更（拓扑 4→5 阶段、plan-06 增加 plan-05 依赖、plan-04/05/06/07 文件清单扩充）。frontmatter/mermaid/阶段表/phase 数字四处权威数据一致正确，变更记录仅是历史记述，不误导执行顺序判断，故不阻塞 | 变更记录行改为"5 阶段执行拓扑"，并补一行"2026-08-25 r1 修复：plan-06 依赖 plan-05 并入 DAG（4→5 阶段）、plan-04/05/06/07 补存量 e2e 与 iterations focus 文件清单、AC-08 矩阵补 plan-04" |
| R2-2 | 📝 | `plan-04-StyleMemory列表页.md` 文件清单（template-default-values 行） | 说明"（targeted 门内，必改）"前半句不准确：`template-default-values.spec.ts` 不在 package.json 的 `e2e:targeted` 脚本列表中（同批的 ai-first-shell / workspace-iteration-memory-integration / ai-first-visual-regression 在门内，precision-glass-shell 亦不在）。其"必改"性来自架构 §9 Phase B 第 7 条点名，修复本身正确且必要 | 将该行说明改为"架构 §9 Phase B 点名存量 spec，卡片/DTO 变更后必改（全量 e2e 门）"，消除门归属误述 |
| R2-3 | 📝 | `plan-05-StyleMemory详情页.md` 实现规格 2（focus 定位）/ Task 8 | `src/app/workspace/iterations/page.tsx` 现有视图 hook 已输出 `selectedId` 内部选中状态；plan-05 的 focus 定位宜与该机制联动（复用选中高亮）而非并行新建一套高亮状态。计划已限定"仅定位能力，不改列表逻辑"，无阻塞，此为实现层提示，避免执行时重复造状态 | 在 plan-05 Task 8 说明中加一句"复用既有 selectedId 选中态做高亮，focus 仅触发定位与选中" |
| R2-4 | 📝 | `plan-04`（对照 `e2e/ai-first-landing-states.spec.ts` TC-7.6） | targeted 门内 `ai-first-landing-states.spec.ts` TC-7.6 断言列表页 500 错误态的 StatePresenter 细节（failedRecoverable + "context/preserved/retry" 文案 + retry/back-to-workspace 按钮）。plan-04 重构列表页错误态时若调整该文案或结构会使其变红。plan-04 已声明"StatePresenter 错误/空态优先复用"（大概率不红），且 plan-07 有"变红存量 spec 口径对齐"兜底授权，不构成必须修复项 | 可选：plan-04"允许修改的额外文件"或 Task 7 提及该 spec 作为潜在受影响项；或维持现状依赖 plan-07 兜底 |

## 八、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| plan-04 文件清单（14 项） | 本轮扩充 7 个存量 e2e modify 条目 | 第一轮 B1/W1 修复的直接要求；每个条目均有源码级断言核实（改名/卡片/基线必红），属回归职责的必要纳入而非清单膨胀 |
| plan-06 文件清单对 template-default-values 的协同说明 | "与 plan-04 协同……若 plan-04 已完成则仅核对无回归" | 阶段化执行（Phase 3 → Phase 4）保证 plan-04 先行，该说明消解双 modify 的边界歧义，是 W2 拓扑修复的配套 |
| plan-05 验收口径"仅当该 Iteration 在默认列表窗口内" | focus 定位断言的保守限定 | 不引入服务端搜索定位（超出范围），与"仅定位能力，不改列表逻辑"一致 |
| plan-01 `normalizeRuleArray` 过滤空串（第一轮已认定） | 维持 | 空串属输入噪声，集合语义不变；服务端判定与前端提示共用单一实现 |
| plan-07 允许修改的额外文件含 `e2e/` 存量 spec | 本轮 W4 修复新增 | 最终回归职责授权，与上游各 plan 的显式清单形成双层兜底，符合架构 §8.6"Phase B/C 内同步更新受影响 spec" |

## 九、总结论

**通过，可开始 auto-dev 执行。**

- 第一轮 2 阻塞 + 5 警告 + 4 建议共 11 项**全部修复到位**，且经源码级复核（断言位置、脚本门归属、focus 模式存在性、文件存在性）确认修复真实有效。
- 修复引入的拓扑改动（4→5 阶段）经专项核算完全自洽：mermaid / execution_order / 阶段表 / max_parallelism / critical_path / frontmatter phase / 功能索引依赖列七处一致；plan-06 硬依赖 plan-05 后 AC-04 的 green 证据不再有二次作废风险。
- 重点排查的三个潜在新矛盾（max_parallelism 与 DAG 匹配、plan-04/06 对同一 spec 的双 modify、iterations focus 配套完整性）均不成立为问题。
- 剩余 4 项新发现中仅 R2-1 为 ⚠️ 且明确**不阻塞**（README 变更记录的记述性陈旧，权威数据一致），R2-2/R2-3/R2-4 均为表达或实现提示级 📝。建议主会话在启动 auto-dev 前顺手修正 R2-1 与 R2-2（各一行改动），R2-3/R2-4 可留待实现阶段处理。
