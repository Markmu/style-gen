# Better Harness Task-Loop Report

## At a Glance

- Codex Evidence Score (Loop Effectiveness): 48/100 (changes only after comparable later task outcomes)
- Asset Health / Repair Progress: 0/100 (0 verified, 0 partial, 9 pending)
- Demonstrated autonomy radius: not observed (not observed; not observed confidence)
- Strongest loop: Not enough evidence difference to name one.
- Largest observed leak: Use the priority moves; no single loop is uniquely weakest.
- Top expected gain: No priority benefit is available in this evidence boundary.

## What You Can Rely On Today

- No reliable user outcome has been demonstrated in this evidence boundary yet.

## What You Gain Next

- No priority Harness move is available in this evidence boundary.



### Why these moves matter

### 最终修改与相关验证没有稳定绑定
- Priority: Medium · Evidence: not observed in this boundary
- Reason: Codex 的有界会话证据中，发出的 5 个候选里有 4 个出现检查，但 5 个都没有经过复核的相关检查；其中有检查早于最终修改或相关性未知的情形，也有 green-E2E 阶段修改后没有检查事实的情形。项目的 plan-task evidence contract 同时没有显式要求当前 revision 或最后编辑时间，因此 handoff 不能稳定证明最终状态满足目标行为。这是会话证据与静态契约的共同缺口，不代表所有真实测试都未运行。
- Expected Output:
  1. 每次 material edit 后，当前修订、目标检查、覆盖的验收标准与最终结果形成一条可机械拒绝旧证据的记录。

### 测试失败后仍发生 handoff，修复复验链未闭合
- Priority: Medium · Evidence: not observed in this boundary
- Reason: 一个实现阶段 Episode 记录到 Vitest 失败，之后出现检查和最终修改，但没有证据确认失败被复现、定位、以最小 owner 修复并用同一检查或等价检查复验；事实仍记录了 assistant handoff。该证据支持闭环缺失，不支持断言代码缺陷仍存在或修复一定错误。
- Expected Output:
  1. 任何相关测试失败都必须在 handoff 前留下可复现、可归因并经过同范围复验的闭环证据。

### 执行中追加的验收约束未进入最终证据映射
- Priority: Medium · Evidence: not observed in this boundary
- Reason: 一个 UI Episode 在执行中新增了“两种模式都显示变量”以及布局位置等约束；随后虽有修改、检查和 handoff，却没有证据把这些新增约束逐条映射到最终行为检查或用户验收。证据说明验收边界不可恢复，不说明 Agent 一定误解了需求。
- Expected Output:
  1. 执行中发生的需求变化被并入唯一验收边界，并在最终 handoff 中逐条对应到实现与检查证据。

### 工作流文档可因缺失类型标记绕过校验
- Priority: Medium · Evidence: not observed in this boundary
- Reason: `scripts/check-workflow-consistency.mjs` 只在 `workflow_type` 精确匹配时验证 standalone spec 或计划 README；缺失或拼错时直接返回 false。对符合 `docs/FEAT-*.md` 或计划 README 路径形状的候选文档，这会让必需字段、章节、状态和验收证据完全跳过 fast gate；现有 focused tests 没有覆盖该负路径。
- Expected Output:
  1. 任何符合项目工作流路径形状的文档都不能仅靠缺失或拼错 discriminator 绕过契约校验。

### doctor 在 Docker 不可用时仍以成功状态退出
- Priority: Low · Evidence: not observed in this boundary
- Reason: `scripts/doctor.mjs` 在 Docker 不可用时只打印 warning，仍输出 `doctor: pass` 并返回成功；但项目的 fresh-start 路径紧接着需要 `pnpm db:up`。这会让 live/fresh 环境的前置失败被推迟到后续步骤。Mock profile 本来不需要 Docker，因此缺口是 profile 与退出语义未被区分，而不是 Docker 必须成为所有检查的硬依赖。
- Expected Output:
  1. Agent 能从 doctor 的 profile、消息和退出码准确判断当前环境是否足以进入 mocked 或 live 工作流。

### `db:reset` 删除卷前没有仓库级保护边界
- Priority: Medium · Evidence: not observed in this boundary
- Reason: `pnpm db:reset` 直接执行 `docker compose down -v` 后重建数据库，项目入口没有声明被删除数据必须是可丢弃的本地开发状态，也没有 preview、确认或恢复后置条件。该命令的副作用是确定的；本轮没有证据说明真实数据曾被误删，也没有检查 Compose 的实际卷范围。
- Expected Output:
  1. 数据库 reset 只能在目标明确、用户已确认且恢复后置条件可验证时删除项目范围内的本地卷。

### Red E2E 的状态时点在工作流 Skills 中互相冲突
- Priority: Medium · Evidence: not observed in this boundary
- Reason: `create-dev-plan` 一处要求在 `ready-to-dev` 前生成 red E2E，状态流转却把 red evidence 设为 `ready-to-dev → in-progress` 的前置；`auto-dev` 和 `test-e2e` 进一步只在功能已为 `ready-to-dev` 时执行 red 阶段。不同 Agent 可据此在计划生成期或开发启动期运行同一门禁，导致状态与证据顺序不一致。
- Expected Output:
  1. 所有 plan-task Agent 都按 ready-to-dev → red evidence → in-progress 的唯一顺序执行。

### 计划任务的 E2E 证据可被两套不同口径验收
- Priority: Medium · Evidence: not observed in this boundary
- Reason: `auto-dev` 与 `test-e2e` 要求 plan-task 生成固定路径的 red/green evidence 文件；`task-review` 又允许在没有独立文件时用最近一次 E2E 输出和报告路径确认通过，同时仍声明缺少 red 或 green 任一证据应失败。相同任务从自动编排或手工 review 入口进入时，可能得到不同验收裁决。
- Expected Output:
  1. 同一 plan-task 无论经自动编排还是手工 review，都由同一 red/green 证据规则得出相同裁决。

### 重复工作识别缺少可比较的会话根与扩展链
- Priority: Low · Evidence: not observed in this boundary
- Reason: 本轮重复流程扫描为 incomplete：供应的 session-core-facts 没有 `requestRoots`，也没有可链接的 `candidateRef`。因此两条看似相近的 UI 变量需求只能保留为 goal lead，两个计划阶段也不能被算作独立可比 workflow runs；当前证据既不能证明存在值得沉淀的新流程，也不能得出干净的 no-candidate 结论。
- Expected Output:
  1. 重复流程分析能在不泄露会话正文的前提下区分独立可比流程、一次性摩擦和证据不足。

## Five Lifecycle Dimensions

| Dimension | What the evidence proves | Evidence boundary | Summary | Boundary / blocker |
| --- | --- | --- | --- | --- |
| 任务理解 | Not observed yet | not observed in this boundary | 静态 owner 与验收入口较清晰，但执行中新增约束没有可核验地进入最终证据，且部分工作流规则互相冲突。 | not observed |
| 可控执行 | Not observed yet | not observed in this boundary | 启动、验证和数据库命令可发现，但 doctor 的 profile 语义与破坏性 reset 的边界仍不够明确。 | not observed |
| 改动验证 | Not observed yet | not observed in this boundary | 检查行为频繁出现，却没有 reviewed relevant check 证明其覆盖最后一次修改；一次失败链和一次 green-E2E 变更均未闭环。 | not observed |
| 可靠交付 | Not observed yet | not observed in this boundary | 本窗口没有修订绑定的交付验收证据，且 plan-task 的 E2E 证据存在两套裁决口径。 | not observed |
| 经验沉淀 | Not observed yet | not observed in this boundary | 重复工作扫描缺少 requestRoots 与 candidateRef，无法可靠区分可沉淀流程、一次性摩擦或已被现有 Skills 覆盖的需求。 | not observed |

## The 15 Small Checks

| Dimension | Small check | What the evidence proves | Evidence boundary |
| --- | --- | --- | --- |


## Evidence and Boundaries

- Episode coverage: 0 episodes, 0 edited, 0 closed, 0 repaired-and-passed
- Model: agent-work-loop-v4
- Session selection: all-eligible; 20 sessions analyzed of 20 eligible sessions; High confidence
- Delivery grades observed: not observed
- Source gaps: not observed
- Learning comparison: Needs a comparison; 0 declared intervention(s)
