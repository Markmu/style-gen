---
feat_id: "plan-07"
title: "Workspace 闭环集成与回归"
dimension: frontend
phase: 6
status: done
depends_on: ["plan-02", "plan-04", "plan-05", "plan-06"]
---

# plan-07: Workspace 闭环集成与回归

## 功能概要

- **目标**: 收口 Workspace 页面总编排，移除成功 GenerationDialog 与 previous-result 单卡的 live 职责，把双速入口、Prompt 控制、direction rail、比较调整、首选/Memory/新参考和全部降级状态整合为连续三栏体验，并完成最终验收回归。
- **完成后可观察结果**: 用户从选择节奏、分析参考、检查证据和 Prompt，到生成、比较、局部修正、再次生成、设置首选和沉淀 Memory，全程不离开 Workspace 且不被成功弹层打断。结果、失败和恢复动作始终在当前上下文中可见，方向切换前有明确确认，键盘焦点在确认、比较、应用、取消和返回时连续可理解。1440×900、1280×800 与 390×844 下不出现关键内容遮挡或横向布局回退；所有 AC、US 与存量关键路径通过 acceptance gate。
- **依赖**: plan-02、plan-04、plan-05、plan-06（间接包含 plan-01/03）
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
- **涉及架构模块**: Workspace Session Controller、Prompt Control & Compiler、Direction Results & Compare、Analysis & Generation Routes、Persistence & Repositories
- **前置条件**: plan-01～06 全部处于 review 或 done 且各自 green 证据有效；设计系统 `docs/design/DESIGN.md` 为视觉 SSOT。
- **不在范围**: 新模型/Provider、批量生成、自动评分/循环、Iteration Memory IA、Memory 验证规则、移动端工作台重设计。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 最终状态/查询/submit/比较/Memory 编排与旧 live 路径清理 |
| modify | `src/components/workspace/workspace-three-column-layout.tsx` | 结果 rail/比较内联区域与响应式空间收口 |
| modify | `src/components/workspace/__tests__/workspace-three-column-layout.test.tsx` | rail/compare/降级布局断言 |
| modify | `src/components/workspace/prompt-card.tsx` | 最终 Prompt + Render 组合与焦点目标接线 |
| modify | `src/components/workspace/output-card.tsx` | 最终 readiness/状态提示与动作接线 |
| modify | `src/components/workspace/generation-dialog.tsx` | 保留兼容组件但移除 Workspace 成功 live 消费，必要时标注退役边界 |
| modify | `src/components/workspace/__tests__/generation-dialog.test.tsx` | 兼容性/不再由成功路径打开的断言 |
| modify | `e2e/workspace-evidence-guided-render-loop.spec.ts` | AC-01～07 与 US-01～11 最终集成场景 |
| modify | `e2e/workspace-generation-dialog.spec.ts` | 成功不再弹层、失败内联回归 |
| modify | `e2e/ai-first-visual-regression.spec.ts` | 三种视口结果 rail/比较/降级截图或 DOM 视觉断言 |
| modify | `package.json` | 将新主 spec 纳入 `e2e:targeted`/acceptance 门 |

## 实现规格

### 前端部分

#### 1. 页面单一编排

- `page.tsx` 保持 AnalysisTask 为方向 key、GenerationTask 为状态 SSOT、Workspace v5 为当前草稿；统一 `submitGeneration` 同时服务手动和快速请求。
- 快速 effect 只读授权快照 + Recipe 默认值；manual 再生成只读当前草稿；选择旧结果不隐式恢复历史参数。
- direction feed、主动详情轮询和 Iteration detail 各有唯一 query owner；方向变化清瞬时 selected/compare，但不删除历史任务。

#### 2. 成功弹层退场与内联布局

- generation completed 后只更新 rail/selected/live region，不打开 GenerationDialog；failed 在 rail 内显示原因、保留内容与主动恢复。
- GenerationDialog 若仍被其他存量测试/入口引用，保持兼容但不承载 Workspace 主成功流程；不得直接删除导致无关回退。
- 三栏布局内结果 rail 默认紧凑，比较面板可展开且不 modal trap；保持 Reference、Style Intelligence、Prompt + Render 同时可见或可理解折叠。

#### 3. 焦点、文案与降级

- 创作节奏确认、方向切换确认进入当前任务并关闭回触发器；比较打开聚焦标题，取消回结果按钮，应用聚焦摘要；完成通知 polite 不夺焦点。
- L1～L5 状态统一说明发生什么、保留什么、下一步；不得在任一区域输出相反 readiness 结论或假图。
- 用户可见术语以架构 §7.6 和现有英文产品口径为准；不重新引入“verified/representative”描述本次首选。

#### 4. 存量回归与 visual

- 更新旧 `workspace-generation-dialog.spec.ts` 为“成功不弹层”；修正因主流程改变而失效的断言但不得放宽行为标准。
- 新主 spec 加入 `e2e:targeted`；在 1440×900、1280×800、390×844 检查高度、横向溢出、焦点环、reduced motion、rail/compare/降级可见性。
- 最后运行 `verify:acceptance`；若存量 targeted spec 因本期真实语义变化变红，仅做最小口径对齐并记录原因。

### 全流程验收（US 覆盖矩阵）

| US | 用户故事简述 | 承接功能 | 最终验证 |
| --- | --- | --- | --- |
| US-01 | 快速先看一张结果 | plan-02, plan-07 | 快速确认→一次自动生成 E2E |
| US-02 | 选择贴近复刻/同风格 | plan-04 | Prompt 控制 E2E |
| US-03 | 选择快速/平衡/详细 | plan-01, plan-04 | invariant 恒等 + UI E2E |
| US-04 | 接受或覆盖参考画幅 | plan-01, plan-04 | 比例/恢复 E2E |
| US-05 | Workspace 内比较多结果 | plan-03, plan-05 | 六结果/状态/比较 E2E |
| US-06 | 指出偏差并调整规则 | plan-05 | 零/单/多规则与四动作 E2E |
| US-07 | 首选并沉淀 Memory | plan-06 | 首选/确认写点 E2E |
| US-08 | 保留专业编辑能力 | plan-04 | 三编辑模式 E2E |
| US-09 | 恢复来源和原设置 | plan-02, plan-04, plan-06 | Iteration/Memory 恢复回归 |
| US-10 | 异常后继续而非重来 | plan-02, plan-03, plan-05, plan-07 | L1～L5 场景 E2E |
| US-11 | 键盘连续完成创作 | plan-02, plan-05, plan-07 | 焦点旅程 E2E |

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：补最终集成/旧弹层/视觉场景 | frontend | done | 确认差距并留证 |
| 2 | 收口 page.tsx 单一编排 | frontend | done | 删除重复 state/effect/live 消费 |
| 3 | 成功弹层退场与失败内联 | frontend | done | 保持兼容组件 |
| 4 | 三栏/rail/compare 响应式收口 | frontend | done | 遵循 DESIGN.md |
| 5 | 焦点、live region 与降级文案收口 | frontend | done | L1～L5 统一 |
| 6 | targeted/visual/存量 spec 对齐 | frontend | done | package script 纳入新 spec |
| 7 | green：主 spec、smoke、acceptance | frontend | done | 保存证据并进入 review |

## 验收标准

### 最终功能验收

- [x] AC-01～AC-07 在 `workspace-evidence-guided-render-loop.spec.ts` 中都有明确场景且 green；无孤立或被弱化的 AC。
- [x] 成功结果不再打开阻断式 GenerationDialog；进行中、成功、失败、恢复动作全部内联。
- [x] Reference、Evidence、Prompt、Result/Compare 在核心视口中连续可理解，比较和 rail 不造成不可恢复遮挡。
- [x] 快速、手动再次生成、首选、Memory、新参考和方向恢复没有重复提交、自动重试或上下文丢失。
- [x] 所有确认/比较/应用/取消/返回具备确定焦点，结果通知不夺正在编辑的焦点。
- [x] 1440×900、1280×800、390×844 视觉回归通过，reduced motion 下无功能缺失。

### 全流程验收（US-01～US-11）

- [x] 上述 US 覆盖矩阵 11 条均能在当前实现和证据中追踪到承接 PLAN 与自动化验证。

### 降级回归验收（架构 §8.2）

- [x] L1 segment 降级、L2 feed/图片、L3 Provider、L4 分析、L5 DB/R2/服务错误均显示“发生什么/保留什么/下一步”，且不遮挡编辑上下文。

### 全局质量门

- [x] `pnpm verify:fast`、`pnpm verify:full`、`pnpm verify:acceptance` 全部通过；若有环境 flake，必须单独复证并记录，不得放宽断言。

## 验证命令

```bash
pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts e2e/workspace-generation-dialog.spec.ts e2e/ai-first-visual-regression.spec.ts --project=workspace
pnpm verify:fast
pnpm verify:full
pnpm verify:acceptance
```

## 交接上下文

- **架构章节**: §3 全流程/状态、§4 模块、§6.1～6.7、§8.1～8.6、§9 Phase C
- **相关代码**: `src/app/workspace/page.tsx`、`workspace-three-column-layout.tsx`、`generation-dialog.tsx`、`package.json`
- **契约 / 数据对象**: Workspace v5、Quick snapshot、PromptControlSnapshot、DirectionIterationFeed、RenderReadiness
- **下游消费方**: 无；本功能完成后进入 task-review/UAT/release readiness

## 风险与边界

- **执行顺序**: 等待 plan-02/04/05/06 green；先 red 集成，再页面收口，最后存量/视觉/acceptance。
- **验证失败排查方向**: page.tsx 重复 effect/query、旧 GenerationDialog opener、三栏 overflow、mock route 顺序、存量 spec 文案/定位器。
- **允许修改的额外文件**: `e2e/` 下因本期语义变化变红的存量 Workspace spec（仅最小断言对齐，必须在 green evidence 列明）。
- **暂停条件**: acceptance 失败暴露架构外产品决策；需要移动端重设计；需要删除第 14 期 Memory 行为才能通过。
- **E2E 不适用说明**: 不适用；本功能承担最终用户旅程验收。
- **风险备注**: 不能用截图通过替代行为断言；视觉与键盘是行为测试的补充。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 快速 effect 与手动点击相邻发生 | 共享 submit lock，只允许一个有效任务 | done |
| 成功回调晚于方向切换 | 按 analysisTaskId 归入原方向，不污染新 rail | done |
| 比较面板在窄视口打开 | 使用可理解堆叠/滚动，不丢关闭与焦点返回 | done |
| 存量 GenerationDialog 仍有其他调用方 | 保留组件兼容，仅移除 Workspace 成功 opener | done |
| targeted 存量 spec 因新语义变红 | 仅更新过时断言，保留行为强度并记录 | done |

## 执行记录

### 2026-09-01 task-review 失败后的定向修复轮（B-1）

- **触发**: `reviews/plan-07-review-20260901.md` 未通过（2 blocker）。按失败恢复协议回到 implement，只做最小修复；frontmatter 保持 `review`，Task/边界场景状态不动，等待重新验收。
- **B-1 修复（测试基建缺失，非断言放宽）**:
  - 修改文件: `e2e/workspace-degradation.spec.ts`（仅「生成错误Retry：内联错误主动重试后清除」用例，L256 起）。
  - 原因: Task 6 对齐改写后，重试 POST 返回 201 时 `submitGeneration` 调用 `ws.startGeneration(task.id)`，`useGeneration` 随即轮询 `GET /api/generation/{id}`；用例未 mock 该 GET，请求落到真实 dev server 返回 401，`useGeneration` 的 401 处理触发 `signIn("google")` 导航离开 Workspace，后续断言确定性失败。
  - 修复: 为 `degeneration-generation-retry-task` 补 `mockGenerationPolling`（completed 终态详情，`generation-completed.json` fixture + id 覆写，参照 `workspace-layout.spec.ts` 生成用例与主 spec TC-7.8 的 mock 组合）。completed 终态驱动 `completeGeneration` → state=`generation_ready`，与用例末尾「Generate 恢复可用」断言一致；方向 feed 无需补 mock（`useDirectionIterations` 对非分组 DTO 防御性回退 `EMPTY_DIRECTION_FEED`，L1/L2 用例既有口径）。
- **B-2 准备（本轮不改 green 证据）**: `docs/e2e/evidence/plan-07-e2e-green-20260901.md` 的「14 个对齐文件全部被命令 3/4 门覆盖」不实声明保持原样，由下一步 test-e2e 产出修正版并补录门外文件实际执行证据；14 个对齐文件清单与本轮执行状态见下表。
- **修复后验证（全部通过）**:
  1. `pnpm e2e -- e2e/workspace-degradation.spec.ts --project=workspace`: 6/6（含原失败用例），13.4s。
  2. 验收报告 §加验清单复跑（除已单跑的 workspace-degradation）：9 个门外 spec + `ai-first-shell` 联跑 63/63，1.1m。
  3. `pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts e2e/workspace-generation-dialog.spec.ts e2e/ai-first-visual-regression.spec.ts --project=workspace`: 65/65，2.0m。
  4. `pnpm verify:fast`: exit 0（workflow:check 5 plans/5 specs/87 Skills、type-check、lint 0 errors、Vitest 118 文件 1211 用例全绿）。flake 单独复证：一次中间运行 `src/lib/ai/__tests__/model-config.test.ts > 绑定使用阶段不允许的 provider 时拒绝加载` 全量并发下失败（与本修复无关，本轮 diff 仅 Playwright spec）；该文件隔离复跑 3 次均 19/19 绿，全量 `verify:fast` 复跑 exit 0 全绿，未放宽任何断言。
- **14 个对齐文件执行状态（B-1 修复后，2026-09-01）**:

| # | 文件 | 门归属 | 本轮执行 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `e2e/ai-first-shell.spec.ts` | targeted 门内 | 加验联跑（验证 2） | 绿 |
| 2 | `e2e/degradation.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 3 | `e2e/edge-cases.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 4 | `e2e/error-path.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 5 | `e2e/happy-path.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 6 | `e2e/helpers/workspace-actions.ts` | —（helper，非独立 spec） | 经消费方 spec 覆盖（happy-path/workspace-layout/workspace-prompt-generate 等，均绿） | 绿 |
| 7 | `e2e/style-memory-reuse.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 8 | `e2e/workspace-ai-first-iteration-memory.spec.ts` | smoke+targeted 门内 | 未重跑（门内，green 证据 148/148 与 review 抽查已覆盖） | 门内绿 |
| 9 | `e2e/workspace-ai-first-render-dock.spec.ts` | smoke+targeted 门内 | 未重跑（同上） | 门内绿 |
| 10 | `e2e/workspace-degradation.spec.ts` | 门外 | 单文件全量（验证 1，B-1 修复后） | 绿（6/6） |
| 11 | `e2e/workspace-history-strip.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 12 | `e2e/workspace-layout.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 13 | `e2e/workspace-prompt-generate.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
| 14 | `e2e/workspace-three-column-layout.spec.ts` | 门外 | 加验联跑（验证 2） | 绿 |
