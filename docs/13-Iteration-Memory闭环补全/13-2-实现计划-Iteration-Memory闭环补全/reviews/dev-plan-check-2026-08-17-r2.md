# 开发计划检查报告（第 2 轮）

- 检查日期：2026-08-17
- 检查 skill：`dev-plan-check`（对照 `.agents/contracts/workflow-schema.json` `plan` 节点）
- 检查轮次：r2（共 3 轮）；基线：`reviews/dev-plan-check-2026-08-17-r1.md`
- 检查方式：先逐条验证第 1 轮 7 项修复，再以全新视角对 15 个检查维度完整复查，并对全部 `modify`/`create` 文件路径与关键代码事实逐一核验

## 一、检查对象

- 架构文档：`docs/13-Iteration-Memory闭环补全/13-1-架构文档-Iteration-Memory闭环补全.md`（workflow_type: arch-gen, status: review_ready）
- 需求文档（AC 最终来源）：`docs/13-Iteration-Memory闭环补全/13-0-需求设计-Iteration-Memory闭环补全.md`
- 实现计划：`docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/`（README.md + plan-01 ~ plan-06）
- 功能数：6（plan-01 后端 / plan-02 ~ plan-06 前端）

## 二、总评

- **结论：有建议项（需小幅修复，无阻塞级问题）**
- 阻塞问题数：0
- 建议项数：3（3 中、0 低进清单；另有 2 条次要残留仅在修复验证节提示）
- 总体评价：第 1 轮 7 项修复中 6 项完全落地、1 项（R1-P1）方向正确但引入 1 处代码事实锚点错误。结构契约、AC 双向追踪（本轮已完全闭合）、ADR/链路/NFR 继承、red-first 任务排序、e2e:targeted 接入全部达标。本轮新发现 3 个中等问题，全部属于"计划指向的代码位置与真实代码不符"类别：① plan-04 把 `sourceTemplateId` 发送方锚定到 `use-generation.ts`，但该 hook 实际是 GET 轮询 hook，POST 请求体组装真实位置在 `src/app/workspace/page.tsx` `handleGenerate`；② plan-06 称"增加'查看全部'动作"，但该按钮已存在且当前接线指向不存在的 `/history` 路由，真实改动点 `page.tsx` 不在其文件清单；③ plan-01 未继承架构 §7.3 对 `GET /api/generation/[id]` 的"既有轮询消费方向后兼容"要求（`resultAssetId` / `analysisTemplateVariables` 等既有字段无保留声明）。三处修复均为计划文档层面的改行/补条目，不动代码。

## 三、第 1 轮修复验证

| # | 第 1 轮问题 | 验证结果 | 核验细节 |
| --- | --- | --- | --- |
| R1-P1（高）sourceTemplateId 前端发送方断层 | ✅ 已修复（引入 1 处新锚点错误 → R2-P1） | plan-04 §实现规格 4"来源模板标记"段在位（currentTemplateId 维护 / `?templateId=` 进入记录 / 恢复还原 / 生成携带）；文件清单含发送方改造行；Task 8 在位；验收标准含"AC-02 从 Style Memory 进入工作台生成时请求体携带 sourceTemplateId（E2E mock 断言）"；plan-01 §2 IterationDetail 增 `sourceTemplateId: string \| null`（消费方见 plan-04）；README 矩阵 AC-02 = plan-01, plan-02, plan-04 且验证方式含 plan-04 §5 断言；架构 §8.6"在交接文档中明示"义务已由 plan-04 规格段履行。**但发送方锚定的 `src/hooks/use-generation.ts` 不是 POST 请求体组装点（详见 R2-P1），能力规格本身正确、锚点文件错误** |
| R1-P2（中）red E2E 任务前移 | ✅ 完全修复 | plan-02/03/04 的 Task 1 = E2E red（9 任务制：1 red、2-8 实现、9 green）；plan-05（6 任务：1 red、2-5 实现、6 green）；plan-06（5 任务：1 red、2-4 实现、5 green）。五个文件"执行顺序"行均改为"Task 1（red E2E）必须最先完成并留存失败证据"，与 README §6 护栏"ready-to-dev 前先产出 red E2E"及 auto-dev 状态机（red-e2e → implement → green-e2e）三处口径一致。任务重排后各 plan 内 Task 编号引用（风险与边界行、规格行）全部自洽，无残留旧编号 |
| R1-P3（中）e2e:targeted 接入 | ✅ 完全修复 | plan-06 文件清单含 `modify package.json`；§实现规格 4"验收门接入"在位且声明准确（经核验 `package.json`：`e2e:targeted` = `playwright test <8 个既有 spec> --project=workspace`，追加 5 个 spec 路径与既有结构兼容；`verify:acceptance` = `verify:fast && build && e2e:targeted`，"CI 手动验收门"表述属实）；Task 4、验收项"5 个新 spec 已纳入 pnpm e2e:targeted"、验证命令 `pnpm e2e:targeted` 均在位。次要残留：README §6 全局护栏未同步声明该归属（r1 建议的可选部分）；因 plan-06 自身文件清单已含 package.json，"越界"风险已消解，不构成问题 |
| R1-P4（低）README AC-02 补 plan-01 | ✅ 完全修复 | 矩阵 AC-02 计划承接 = plan-01, plan-02, plan-04；验证方式首项即"plan-01 §5（q 命中提示词或来源模板名）" |
| R1-P5（低）"单条详情加载失败"归位 | ✅ 完全修复 | 矩阵 AC-07 计划承接 = plan-02, plan-03, plan-06，验证方式含"plan-03 §5（单条详情失败保留列表可重试）"；plan-03 frontmatter 关联验收标准 = [AC-03, AC-04, AC-07]，与矩阵双向一致 |
| R1-P6（低）README §2 并行声明修正 | ✅ 完全修复 | README §2 现表述"两者共同修改的唯一文件是 `src/components/iterations/iteration-detail-panel.tsx`（分别填充 primaryActions 与 secondaryActions 插槽，改动区不重叠），该文件的改动需串行合入（先 plan-04 后 plan-05）"。经比对两 plan 文件清单逐行核实："唯一共同文件"表述准确（plan-04 不触碰 plan-05 的 mock-api.ts / templates 页，反之亦然），串行顺序与插槽填充方一致 |
| R1-P7（低）plan-03 安全继承 | ✅ 已修复 | plan-03 §实现规格 2 末条"安全（架构 §8.3 继承）：详情中的提示、排除项、失败说明与证据文本一律按纯文本渲染，不拼接 HTML、不执行任何快照内容"在位。次要残留：Task 8 组件测试说明未加对应断言点（r1 建议的次级部分）；React 默认转义使实际风险低，不构成问题 |

修复回归检查：任务重排未引入编号引用断裂；README 矩阵 7 行与 6 个 FEAT frontmatter 的关联验收标准经双向逐一比对完全闭合（每个 FEAT 的每个 AC 都能在矩阵找到行，每行的计划承接都与 FEAT frontmatter 一致，无孤立验收项）；r1 修复未与既有内容产生新矛盾，除 R2-P1 一处锚点错误。

## 四、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| README frontmatter `workflow_type: create-dev-plan` | 通过 | — |
| README frontmatter `org_mode: feature` | 通过 | — |
| README `status: review_ready` ∈ `readme_frontmatter_status` | 通过 | — |
| README `execution_order` 只引用真实 plan | 通过 | 5 批次全部指向 plan-01 ~ plan-06，无环；critical_path [01,02,03,04,06] 与 DAG 一致 |
| README `total_tasks: 6` 与 plan-*.md 数量一致 | 通过 | 6 个文件；`total_task_files: 6`、`total_phases: 5`、`max_parallelism: 2` 与拓扑表一致 |
| README 必含章节（8 项） | 通过 | 计划入口/执行拓扑/验收标准追踪矩阵/功能索引/开发状态机/全局护栏/执行前置与全局验证/未决策项与变更记录全部在位 |
| 追踪矩阵表头固定格式 | 通过 | `AC-ID / 需求原文 / 架构承接 / 计划承接 / 验证方式 / 当前状态` 与 contract 一致；当前状态 `planned` ∈ `acceptance_status` |
| FEAT 文件名 `plan-XX` 与 `feat_id` 一致 | 通过 | 6/6 |
| FEAT `status: draft` ∈ `task_file_status` | 通过 | 6/6 |
| FEAT 必含章节（8 项） | 通过 | 6/6 文件均含功能概要/文件清单/实现规格/Task 列表/验收标准/验证命令/交接上下文/风险与边界 |
| Task 与边界场景状态仅 `todo/done/waived` | 通过 | 全部 `todo`；无 `waived` |
| `depends_on` 引用真实存在 | 通过 | 02→01、03→02、04→03、05→[01,03]、06→[04,05]；DAG 无环 |
| 验证命令与 package.json scripts 对照 | 通过 | `db:generate/db:push/type-check/verify:fast/e2e/e2e:targeted` 全部真实存在且语义相符；`pnpm vitest --run` 与 AGENTS.md 用法一致 |
| 代码路径存在性（全量核验） | 通过 | 6 个 plan 引用的 28 个既有文件（modify 目标 + 交接上下文参照）全部存在；24 个 create 目标全部不存在、无重复声明 |
| 检查报告路径 contract | 通过 | 写入 `{plan-dir}/reviews/dev-plan-check-2026-08-17-r2.md`（多轮 r2 后缀，与 r1 先例一致） |
| 项目 workflow 门 | 通过 | `pnpm workflow:check` 实跑通过（3 plans, 5 standalone specs, 134 Skill documents） |

## 五、验收标准追踪

| AC-ID | 架构要求（§2.4） | README 承接 | FEAT 承接 | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 完整 Iteration Memory 可达且覆盖全部生成状态 | plan-01, plan-02, plan-06 | plan-01（全状态列表 + 兼容断言）、plan-02（三态渲染、默认 all）、plan-06（入口可达 + 集成回归） | 一致 |
| AC-02 | 找到并连续浏览目标 Iteration | plan-01, plan-02, plan-04 | plan-01（q 双字段命中）、plan-02（搜索/筛选/游标/保位/无匹配）、plan-04（sourceTemplateId 发送方断言） | 一致（发送方锚点错误见 R2-P1，属可执行性问题非追踪问题） |
| AC-03 | 已完成详情提供可理解完整创作上下文 | plan-01, plan-03 | plan-01（快照优先/回退/缺失标记）、plan-03（并排展示 + 分区块 + 缺失提示 + 纯文本渲染） | 一致 |
| AC-04 | 进行中与失败记录提供确定感和恢复路径 | plan-03, plan-04 | plan-03（三态详情、轮询切换、无重复提交入口）、plan-04（"修正并继续"同链路） | 一致 |
| AC-05 | 继续历史方向完整恢复且不误覆盖 | plan-04 | plan-04（三豁免、确认/取消、恢复、flush、新 Iteration 断言） | 一致 |
| AC-06 | 成功 Iteration 可沉淀为 Style Memory | plan-01, plan-05 | plan-01（sourceGenerationTaskId 校验）、plan-05（保存/已保存态/打开定位/409） | 一致 |
| AC-07 | 空态、登录和服务异常不破坏上下文 | plan-02, plan-03, plan-06 | plan-02（空态/未登录/列表 5xx）、plan-03（单条详情失败保留列表）、plan-06（集成回归） | 一致（R1-P5 修复验证通过） |

E2E-TDD：plan-02 ~ plan-06 均有专属 spec 文件（create）、Task 1 = red（含失败证据留存要求）、E2E 验收含"实现前先留存 red 证据"、验证命令直接运行该 spec；plan-01 有严格的不适用说明（纯后端、相邻 Vitest 为直接质量门、用户可观察行为由 plan-02/03 经同一接口间接承接）。US-01 ~ US-10 覆盖矩阵在 plan-06 完整建立且与 PRD §2.2（7 核心 + 3 延伸）一一对应。

## 六、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 1. 核心闭环与系统目标 | 通过 | 0 | Attempt→Understand→Continue 与"读模型扩展 + 提交时快照 + 客户端恢复"定位完整继承于 README 计划入口 |
| 2. 范围与非目标 | 通过 | 0 | §2.1 四类范围全部有 plan 承接；"明确不做"在 README 护栏与各 plan 不在范围双重呼应，无 FEAT 引入禁止项 |
| 3. 成功标准 | 通过 | 0 | §2.3 六项指标逐项可指（性能→plan-01 性能验收；US 覆盖→plan-06 矩阵；其余→对应 AC 的 FEAT 验收） |
| 4. 验收标准防漂移 | 通过 | 0 | 7 条 AC 双向追踪完全闭合（矩阵↔FEAT frontmatter↔checklist）；无孤立验收项；E2E-TDD red/green 证据要求完整（R1-P2/P4/P5 修复验证通过） |
| 5. ADR 约束 | 通过 | 0 | ADR-1/2/3/5→plan-01、ADR-4→plan-04（不在范围显式引用）、ADR-6→plan-02、ADR-7→plan-03；演进余地（pg_trgm、SSE、拆独立资源）均未提前实施 |
| 6. 用户流程与状态机 | 通过 | 0 | §3.2 七条关键分支与 §3.3 列表/详情状态机逐项落地；状态枚举与迁移触发点与架构一致 |
| 7. 模块职责与系统上下文 | 通过 | 0 | §4.2 六模块全映射；§4.3 过度设计避免清单全部被遵守 |
| 8. 运行链路 | 通过 | 0 | §6.1~6.5 五条链路逐步骤落地；§6.3 flush 原则、§6.4 防御性口径、§6.5 轮询退避完整继承 |
| 9. 数据模型与契约 | 部分 | 1 | R2-P3：架构 §7.3 对 `GET /api/generation/[id]` 的"既有轮询消费方向后兼容"未在 plan-01 继承（`resultAssetId`/`analysisTemplateVariables` 等既有响应字段无保留声明与验收断言）。其余：§7.2 DTO 逐字段对齐、pending 归并、数据来源标注、游标格式（经代码核验 `"createdAt::id"` 属实）全部继承 |
| 10. 非功能需求 | 通过 | 0 | 性能（P95/并发 ≤2）、五级降级链、安全输入面（q≤100/status 白名单/pageSize clamp）、纯文本渲染（R1-P7 已修）、Rate Limit 复用、可观测性两事件、e2e:targeted 验收门（R1-P3 已修）全部落地 |
| 11. 实施建议与技术选型 | 通过 | 0 | Phase A/B/C 与 plan-01/02-03/04-05-06 对应；Phase B"targeted spec 纳入 e2e:targeted"已由 plan-06 §4 承接 |
| 12. 风险与未决策项 | 通过 | 0 | §8.6 五类风险（含"模板名搜索依赖 sourceTemplateId 传递"）均有缓解归属与明示；open_questions 空、README 无未决策项一致 |
| 13. 功能拆分质量 | 通过 | 0 | FEAT 粒度连贯、文件清单规模合理、Task 步数 5~10（≤12）、DAG 无环、共同修改文件已显式声明串行策略（R1-P6 修复验证通过） |
| 14. 可执行性 | 部分 | 2 | R2-P1：plan-04 发送方锚定 `use-generation.ts` 与代码事实不符（POST 请求体实际在 `page.tsx` handleGenerate）；R2-P2：plan-06"增加查看全部"与代码不符（按钮已存在、接线指向不存在的 `/history`），真实改动点 `page.tsx` 不在文件清单。其余：28 个 modify 路径全部存在、24 个 create 目标无冲突、验证命令全部可运行、red/green 顺序可留证、前置条件可验证 |
| 15. 状态与报告契约 | 通过 | 0 | 状态枚举合法；README 状态机表与 FEAT frontmatter（全 draft/—）一致；本报告未修改任何计划文件 |

统计：通过 13 / 部分 2 / 缺失 0（共 15 维度）。

## 七、问题清单

| 编号 | 严重度 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- | --- |
| R2-P1 | 中 | plan-04 文件清单（`modify src/hooks/use-generation.ts` 行）、§实现规格 4"来源模板标记"段、Task 8、§交接上下文"相关代码" | **`sourceTemplateId` 发送方锚定了错误的文件（R1-P1 修复引入的代码事实错误）。** 经代码核验：`src/hooks/use-generation.ts` 是 GET 轮询 hook（`useGeneration(taskId)` 内 `fetch(\`/api/generation/${taskId}\`)` + 3s refetchInterval），**不组装任何 POST 请求体**；`POST /api/generation` 的请求体实际在 `src/app/workspace/page.tsx` 的 `handleGenerate`（约 L585-626，fetch POST 在 L591-603，现含 analysisTaskId/promptText/negativePromptText/params）内联组装。plan-04 四处（文件清单行、规格"生成提交经 use-generation 在 currentTemplateId 非空时于请求体携带"、Task 8"「use-generation 改造」"、交接上下文"use-generation.ts（生成提交请求体组装）"）均指向该 hook，按字面执行将无处落地；page.tsx 虽在文件清单内（能力可救），但计划文本会直接误导执行者 | 文件清单行改为 `modify src/app/workspace/page.tsx` 说明合并入既有行（追加"生成请求体携带 sourceTemplateId"），删除 `use-generation.ts` 行；§实现规格 4 改为"生成提交在 workspace page 的 `handleGenerate` 请求体中，`currentTemplateId` 非空时携带 `sourceTemplateId`"；Task 8 说明改为"`handleGenerate` 请求体扩展 + E2E mock 断言"；交接上下文"相关代码"中 `use-generation.ts` 条目删除或更正为"`src/app/workspace/page.tsx` handleGenerate（生成提交请求体组装，约 L585-626）" |
| R2-P2 | 中 | plan-06 文件清单、§实现规格 1、Task 2；对照 `src/components/workspace/history-strip.tsx`（L159-165 既有 View all 按钮 + `onViewAll` prop）与 `src/app/workspace/page.tsx` L796 | **"查看全部"动作已存在，规格按"新增"描述且缺少真实改动文件。** 经代码核验：history-strip.tsx 已渲染 "View all" 按钮（`onViewAll` 回调），当前接线在 `src/app/workspace/page.tsx` L796 `onViewAll={() => router.push("/history")}`，而 `/history` 路由不存在（`src/app/history/` 无目录、next.config.ts 无 rewrites/redirects）——现状是死链，与 PRD §1.1 问题 1"'查看全部'没有形成可到达的完整页面"吻合。plan-06 规格写"在近期条操作区**增加**'查看全部'链接"、Task 2"增加查看全部入口"，且文件清单不含 `src/app/workspace/page.tsx`（"允许修改的额外文件: 无"）——真实最小改动是把 page.tsx L796 的导航目标改为 `/workspace/iterations?status=all`，按现清单执行将构成越界或在 history-strip 内重复造第二个"查看全部" | plan-06 文件清单增加 `modify src/app/workspace/page.tsx`（说明：`onViewAll` 接线由死链 `/history` 改为 `/workspace/iterations?status=all`）；§实现规格 1 与 Task 2 表述改为"改既有 View all 接线"（保留 history-strip.tsx 行用于按钮样式/aria 微调或直接删除该行）；E2E 断言从近期条点击 View all 落到 `/workspace/iterations?status=all`。若选择在 history-strip 内改为 Link 方案，则须同时把 `src/components/workspace/__tests__/history-strip.test.tsx`（现断言 onViewAll 回调）纳入文件清单 |
| R2-P3 | 中 | plan-01 §实现规格 7（GET [id] 全状态详情）、§验收标准；对照架构 §7.3 `/api/generation/[id]` 行 | **架构对 `[id]` 端点"既有轮询消费方向后兼容"的约束未继承。** 架构 §7.3 明确该端点"响应扩展为 7.2 的 IterationDetail……**既有轮询消费方向后兼容**"。经代码核验现状：completed 分支返回 `resultAssetId`、`analysisTemplateVariables`（`src/hooks/use-history-restore.ts` L131-132 以 `analysisTemplateVariables` 作为 variables 回退来源，其响应类型 L30/L36 将 `resultAssetId`/`analysisTemplateVariables` 列为字段），非 completed 分支亦返回 `resultAssetId`；而架构 §7.2 的 IterationDetail 与 plan-01 §2 类型规格均不含这两个字段。plan-01 §7 仅声明"404 与错误结构保持"，未声明既有字段后兼容，也无对应验收断言——实施者统一 DTO 并同步改写相邻测试时可能静默删除字段，破坏既有 `useHistoryRestore` 恢复路径（既有 E2E 全部 mock API，无法兜底该真实 shape 变化） | plan-01 §实现规格 7 补一句"统一 DTO 为既有响应字段的超集：保留 `resultAssetId`、`analysisTemplateVariables` 等 completed 分支既有字段（`useHistoryRestore` 既有消费后兼容，架构 §7.3）"；§验收标准 后端验收补一条"[ ] `GET /api/generation/[id]` 响应保留 `resultAssetId` / `analysisTemplateVariables` 既有字段，`useHistoryRestore` 既有消费不破坏（相邻测试断言）" |

## 八、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| plan-01 §实现规格 1 | Drizzle 循环外键两种落地备选与暂停条件 | 架构只定义列与索引，未约束工具行为；实现风险预案不违背数据契约 |
| plan-01 §实现规格 2 | IterationDetail 额外含 `sourceTemplateId`（架构 §7.2 之外） | 服务恢复链路还原 currentTemplateId（R1-P1 修复的一部分），additive 扩展不改既有字段，消费方已标注 |
| plan-04 §实现规格 1 | 守卫第三豁免具体化为 promptText / negativePromptText / params.aspectRatio / params.quality | 架构"提示、排除项、参数逐字段相等"的可执行化，字段集未扩大未缩小 |
| plan-05 §实现规格 1 | 保存入口用 `resultFileUrl` 非空近似 `resultAssetId` 非空 | IterationDetail 无 resultAssetId 字段；服务端仍按 resultAssetId 严格校验，双层一致 |
| plan-02 §实现规格 1 | 视图 store 增加 `scrollResetToken`、URL 同步用 `router.replace` | ADR-6 的实现细节；replace 避免污染历史栈 |
| plan-03 §交接上下文 | actions 插槽约定 `{ primaryActions?, secondaryActions? }` | 架构 §4.2 关键交互链路的组件化落地接口，支撑 plan-04/05 并行 |
| plan-01 §验收标准 | 性能验收以本地 seed ≥ 200 条 + 计时脚本/DevTools 人工确认执行 | P95 目标的本地可执行化，量级口径未变 |

## 九、建议补丁计划

按优先级排列（只改计划文档，不动代码）：

1. **R2-P1（中）**：plan-04 四处更正 sourceTemplateId 发送方锚点（文件清单行、§规格 4、Task 8、交接上下文），由 `use-generation.ts` 改为 `src/app/workspace/page.tsx` `handleGenerate`；删除或改写 `use-generation.ts` 相关行。
2. **R2-P2（中）**：plan-06 文件清单补 `modify src/app/workspace/page.tsx`，规格 1 / Task 2 改为"改既有 View all 接线（/history 死链 → /workspace/iterations?status=all）"。
3. **R2-P3（中）**：plan-01 §7 与验收标准补 `[id]` 端点既有字段后兼容声明与断言（`resultAssetId` / `analysisTemplateVariables`）。

修补完成后保持 README `status: review_ready`，进入第 3 轮（r3）复查上述 3 项；三处均为单文件局部改动，预计不影响其余章节。
