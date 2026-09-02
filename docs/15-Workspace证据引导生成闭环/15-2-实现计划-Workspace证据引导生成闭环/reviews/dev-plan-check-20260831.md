# 开发计划检查报告

## 一、检查对象

- 架构文档：`docs/15-Workspace证据引导生成闭环/15-1-架构文档-Workspace证据引导生成闭环.md`
- 实现计划：`docs/15-Workspace证据引导生成闭环/15-2-实现计划-Workspace证据引导生成闭环/`
- 功能数：7（`plan-01`～`plan-07`）
- 检查日期：2026-08-31
- 检查方式：全新、独立、完整检查 README 与 7 份 PLAN；架构文档作为唯一基准，不沿用上一轮结论。
- 检查范围：workflow contract、AC-01～AC-07、ADR-1～ADR-7、§6.1～§6.7、§7 数据/API/状态、§8 NFR、DAG、brownfield 路径、E2E-TDD、验证命令、状态与边界。

## 二、总评

- **结论：Fail**
- **是否可进入开发：否；修复 1 个 Medium 后再进入开发。Low 可同次补齐。**
- Blocker：0
- High：0
- Medium：1
- Low：1
- 建议项数：2

计划的主体质量已经达到较高水平：全部 AC、ADR、核心运行链路、数据/API 契约、状态机、异常路径、E2E-TDD 和 brownfield 文件边界均已被可执行任务承接；上一轮三项问题也已全部关闭。当前唯一影响进入开发的缺口是：架构 §6.7 明确要求 Style Memory 写入成功后刷新 Memory 详情、候选与方向结果，而 `plan-06` 只定义写入与失败保留，没有定义成功后的缓存失效/回读链路与验收。若直接按当前计划实现，Workspace 可能在写入成功后继续显示陈旧的 Memory 或方向状态。另有一个不阻塞编码的运行侧成本阈值承接缺口。

## 三、Contract 预检

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| README frontmatter | ✅ | `workflow_type: create-dev-plan`、`org_mode: feature`、`status: review_ready` 合法 |
| PLAN frontmatter | ✅ | 7 份 PLAN 的 `feat_id/title/dimension/phase/status/depends_on` 完整，文件名与 `feat_id` 一致 |
| 数量一致性 | ✅ | `total_tasks=7`、`total_task_files=7`，实际存在 7 份 PLAN |
| README 必备章节 | ✅ | contract 要求的 8/8 章节完整；验收矩阵表头固定且正确 |
| PLAN 必备章节 | ✅ | 每份 PLAN 的 8/8 必备章节完整 |
| 状态值 | ✅ | README `review_ready`；PLAN 均为 `ready-to-dev`；Task/边界场景仅使用 `todo`，无非法值或无原因 `waived` |
| execution_order | ✅ | 仅引用真实 `plan-01`～`plan-07`，与 phase/DAG 一致 |
| 依赖与 DAG | ✅ | 所有依赖存在、无环；Phase 2 的 plan-02/03 可并行；共享文件的后续修改均有先后依赖 |
| brownfield 路径 | ✅ | `modify` 目标要么当前真实存在，要么由明确前置 PLAN 创建；`0006_*` 由 `db:generate` 定位 |
| 报告路径/命名 | ✅ | `reviews/dev-plan-check-20260831.md` 符合 `plan.plan_review_filename_pattern` |
| workflow 机械检查 | ✅ | `pnpm workflow:check` 与 `pnpm test:workflow` 实际通过 |
| repository fast gate | ✅ | `pnpm verify:fast` 实际通过：109 个测试文件、1004 项测试；保留现有 21 条 lint warning |
| 破坏性数据库检查 | ⏭️ | 计划已给出可丢弃 DB 前置和 `db:reset → db:push`，本轮只检查文档，未对数据库执行 destructive reset |

### 上一轮问题关闭复核

| 历史问题 | 结果 | 独立复核证据 |
| --- | --- | --- |
| plan-03 `[id]` Vitest 路径在 zsh 下不可运行 | ✅ 已关闭 | 路径已写为 `'src/app/api/generation/[id]/__tests__/route.test.ts'`；在项目默认 zsh 执行完整 plan-03 聚焦命令，5 个测试文件、123 项测试通过 |
| 缺少可丢弃本地 DB fresh apply 前置、命令和证据 | ✅ 已关闭 | README 护栏、plan-03 规格、Task 7、验收标准与验证命令均明确“确认 DATABASE_URL 为可丢弃开发库”以及 `pnpm db:reset` 后 `pnpm db:push`，并要求记录目标环境、SQL/meta 审查与结果 |
| 120000ms/300000ms 超时未形成防漂移验收 | ✅ 已关闭 | plan-03 §实现规格、Task 1、API 验收均固定同步 `120_000ms` 与 Replicate `300_000ms`，并要求 fake-timer/mock 断言终态保护和 `startTimeoutTimer(..., 300_000)` |

## 四、验收标准追踪

| AC-ID | 架构要求 | README 承接 | FEAT 承接 | 结论 |
| --- | --- | --- | --- | --- |
| AC-01 | 双速入口、确认快照同源、只自动生成一次 | ✅ | plan-01/02/03/07 | ✅ 披露、锁定、`consumed` 先于 POST、刷新/重放、task 快照一致均有 red/green 验收 |
| AC-02 | 两意图、三表达、手动全文保护 | ✅ | plan-01/04/07 | ✅ 三档 invariant 集合恒等、dirty confirm/cancel、三编辑模式完整 |
| AC-03 | reference/user/restore/fallback 画幅优先级 | ✅ | plan-01/04/07 | ✅ 算法、Provider 映射、来源标签与 E2E 完整 |
| AC-04 | 工作区全状态与最近五个成功结果 | ✅ | plan-03/05/06/07 | ✅ completed/active/latestFailure 独立限额，旧结果可进入 Iteration |
| AC-05 | 真实维度到真实 invariant 的局部调整 | ✅ | plan-01/04/05/07 | ✅ 零/单/多规则、四动作、全文降级、应用不生成完整 |
| AC-06 | selected/preferred 与 Memory 验证边界 | ✅ | plan-05/06/07 | ⚠️ 选择、验证和既有写点边界正确；Memory 写入成功后的三类刷新链路未进入 plan-06 |
| AC-07 | 异常、恢复和方向切换不丢上下文 | ✅ | plan-02/03/05/06/07 | ✅ L1～L5、Provider failed、新参考守卫和焦点恢复完整 |

## 五、维度检查结果

| 维度 | 结论 | 问题数 | 摘要 |
| --- | --- | --- | --- |
| 1. 核心闭环与系统目标 | 通过 | 0 | README 与 7 个 PLAN 共同覆盖“分析 → 比较 → 修正”闭环 |
| 2. 范围与非目标 | 通过 | 0 | 未引入新表/队列/服务、批量、自动评分、自动重试、新 Provider 或移动端重设计 |
| 3. 成功标准 | 通过 | 0 | 快速单次提交、Prompt、画幅、feed、比较、轮询、性能与键盘目标均有验收 |
| 4. 验收标准防漂移 | 部分通过 | 1 | AC 全部映射且有验证，但 AC-06 的成功写后刷新链路弱继承 |
| 5. ADR 约束 | 通过 | 0 | ADR-1～7 均有 owner、禁止事项和演进边界 |
| 6. 用户流程与状态机 | 通过 | 0 | quick authorization、GenerationTask、比较和方向切换状态完整 |
| 7. 模块职责与系统上下文 | 通过 | 0 | 五个模块均映射至 PLAN；上下游关系在 DAG/交接中明确 |
| 8. 运行链路 | 部分通过 | 1 | §6.1～6.6 完整；§6.7 第 4 步的成功刷新未成为 Task/验收 |
| 9. 数据模型与契约 | 通过 | 0 | Workspace v5、Prompt snapshot、Direction feed、API 来源与唯一 JSONB 增量一致 |
| 10. 非功能需求 | 部分通过 | 1 | 性能、错误、降级、安全、超时、日志、视觉已承接；70/90/100% 预算运行阈值无部署/运营 owner |
| 11. 实施建议与技术选型 | 通过 | 0 | Phase A/B/C 被拆为可执行的 6 阶段、7 功能计划，未超出技术边界 |
| 12. 风险与未决策项 | 通过 | 0 | 风险均有缓解；架构与 README `open_questions: []` 一致 |
| 13. 功能拆分质量 | 通过 | 0 | 每个 PLAN 7～8 个 Task，功能内聚，DAG 无环，混合接口对齐 |
| 14. 可执行性 | 通过 | 0 | 路径具体；前置可验证；zsh 命令可运行；E2E red→implement→green 可留证 |
| 15. 状态与报告契约 | 通过 | 0 | README/PLAN/Task 状态与报告位置均合法 |

## 六、问题清单

| 严重级别 | 位置 | 问题 | 修补建议 |
| --- | --- | --- | --- |
| Medium | 架构 §6.7 第 4 步；`plan-06` §实现规格 2、Task 3/4、§验收标准 | 架构要求 Memory 写入成功后刷新 **Memory 详情、代表结果候选与当前方向结果**。计划只说明调用写点、确认后更新和失败保留，没有指定成功后的 query invalidation/refetch、执行 owner 或验收断言。实现者可能复用写点后关闭确认，却留下 Workspace/Memory 陈旧缓存。 | 在 plan-06 规格中明确成功后依次失效/回读 Memory detail/list、representative candidates 与 direction feed；将其加入 Task 3/4 或新增 Task，并在组件/E2E 验收中断言服务端成功响应后新代表结果/验证状态和方向动作立即可见，失败时不做乐观伪造。 |
| Low | 架构 §8.4 第 474 行；README §6/§7、plan-03/07 | 架构定义 Provider 账户预算 70%/90%/100% 告警/停止线，100% 时 Generation 降级但 Prompt/证据仍可用。计划没有把该运行侧要求分配给开发、发布或明确标注“部署阶段落实”，存在交付阶段无人收口的风险。 | 在 README §7 增加部署/运营承接项：发布前核验当前 Provider 预算阈值和 100% 降级行为，证据由 release-readiness 保存；若本期明确不做代码改造，直接标注“部署阶段落实”，不要在代码硬编码价格。 |

## 七、合理扩展

| 位置 | 扩展内容 | 为什么合理 |
| --- | --- | --- |
| `plan-07` US-01～US-11 矩阵 | 在 AC 追踪之外增加用户故事全旅程追踪 | 增强最终验收可追溯性，没有改变架构范围 |
| `plan-03` 方向 feed 性能证据 | 500 rows 下要求 scoped benchmark/EXPLAIN | 将 p95 目标转成可审核证据，并坚持“超标才加索引”避免过度设计 |
| `plan-02/04/05/06` 递增主 E2E spec | 多个用户功能在同一主流程 spec 中先 red 后 green | 与 Workspace 连续创作体验一致，减少孤立、重复的测试编排 |
| `plan-07` 存量弹层兼容策略 | 不直接删除 GenerationDialog，只移除 Workspace 成功 opener | 防止 brownfield 无关入口回退，同时满足成功结果内联要求 |

## 八、建议补丁计划

1. **先补 plan-06 成功刷新链路**：在 §实现规格 2 明确 Memory detail/list、representative candidates、direction feed 的成功后 invalidation/refetch；在 Task 与验收中加可观察断言。
2. **补运行侧成本 owner**：在 README §7 标明 70%/90%/100% 阈值由部署/release-readiness 核验，100% 时只禁用 Generation，分析证据和 Prompt 编辑仍可用。
3. 修订后执行 `pnpm workflow:check`、`pnpm test:workflow`、`git diff --check`；再次检查计划即可，无需执行破坏性数据库 reset。
