---
feat_id: "plan-05"
title: "本次结果区与内联比较"
dimension: mixed
phase: 4
status: done
depends_on: ["plan-03", "plan-04"]
---

# plan-05: 本次结果区与内联比较

## 功能概要

- **目标**: 在 Workspace 内交付当前方向结果 rail 与参考/结果内联比较：分别展示五个成功结果、active 和 latestFailure，管理当前选择与会话首选，并把用户选择的维度落到真实 invariant adjustment。
- **完成后可观察结果**: 生成开始后状态直接进入本次结果区，成功结果自动成为当前选择且不弹成功弹层；用户能在五个真实成功结果间切换，进行中/失败不会挤掉缩略图。打开比较后可并排看到真实参考和结果，选择维度并查看对应观察、规则和 Prompt 表达；多规则必须再选具体规则，零规则只允许全文编辑。应用调整只更新当前草稿与摘要，不自动生成，取消保持草稿不变且焦点返回触发器。
- **依赖**: plan-03（direction feed/detail 快照）、plan-04（Prompt controls/adjustment/摘要）
- **关联验收标准**: [AC-04, AC-05, AC-06, AC-07]
- **涉及架构模块**: Direction Results & Compare、Prompt Control & Compiler、Workspace Session Controller
- **前置条件**: plan-03 API 契约与 plan-04 Prompt UI green；现有 Iteration detail hook 可复用。
- **不在范围**: 首选写入 Style Memory 与作为新参考（plan-06）；最终移除旧成功弹层与全量回归（plan-07）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/hooks/use-direction-iterations.ts` | direction feed 查询、active 刷新与 previous data 保留 |
| create | `src/hooks/__tests__/use-direction-iterations.test.tsx` | 分组响应、刷新、错误缓存和终态测试 |
| create | `src/components/workspace/direction-result-rail.tsx` | 五成功结果、active/failure、选择/首选/动作区 |
| create | `src/components/workspace/__tests__/direction-result-rail.test.tsx` | 状态、配额、键盘、滚动首选测试 |
| create | `src/components/workspace/result-comparison-panel.tsx` | 内联比较、维度/真实 invariant/四动作与焦点管理 |
| create | `src/components/workspace/__tests__/result-comparison-panel.test.tsx` | 零/单/多规则、应用/取消与历史上下文测试 |
| modify | `src/components/workspace/comparison-view.tsx` | 支持内联面板布局、真实缺失态和可访问标签 |
| modify | `src/components/workspace/__tests__/comparison-view.test.tsx` | 双图、缺图与布局测试 |
| modify | `src/app/workspace/page.tsx` | direction key、查询、selected/preferred、比较与 adjustment 接线 |
| modify | `e2e/workspace-evidence-guided-render-loop.spec.ts` | 增加 AC-04/05/06 结果与比较场景 |

## 实现规格

### 前端部分

#### 1. direction feed hook

- 请求 `GET /api/generation?view=direction&analysisTaskId=…&pageSize=5`；分析方向变化时 query key 隔离。
- active 存在时每 2-3 秒刷新；当前主动 task 可继续详情轮询；终态后停止。错误保留 previous data/草稿并提供重试，不回退空结果。
- 只消费分组 DTO，不把 active/latestFailure 混入 completed 五张缩略图。

#### 2. 本次结果 rail

- completed 最多五个真实图片；pending/processing 作为独立 active face；最近 failed 显示截断原因和主动重试入口；缺 Asset 不显示假图。
- 新 completed 自动更新瞬时 `selectedIterationId`，绝不自动更新 preferred；两者用不同文案、视觉与 aria 状态。
- 动作入口：比较、设为本次首选、沿用当前草稿再次生成、作为新参考、打开完整 Iteration；本功能先提供回调，Memory/新参考由 plan-06 接管。

#### 3. 内联比较与 adjustment

- 打开时加载所选 Iteration detail，展示该结果历史 Prompt 快照但明确“正在调整当前草稿”；参考/结果 URL 缺失时显示真实缺失态和打开 Iteration/重试。
- 可选维度来自当前 Recipe observations 或 invariants；“其他”聚焦全文编辑。选维度后展示 observations、全部真实 invariants 与 segments/provenance。
- 一条 invariant 可见地预选；多条时四动作 disabled 直到选择目标；零条只允许“其他/全文编辑”，不创建 adjustment。
- 应用按 invariantId 覆盖当前 adjustment，重编译草稿/摘要但不 submit；关闭/取消零写入。打开聚焦标题，取消回比较按钮，应用聚焦更新摘要，通知为 polite。

#### 4. E2E-TDD

- 扩展主 spec：queue→success/failure；六个成功仅显示最新五个；active/failure 不挤占；selected/preferred 分离；真实双图；零/单/多 invariant；四动作；取消/其他；应用后无 generation POST；焦点连续。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：结果/比较 E2E 场景 | frontend | done | AC-04/05/06/07 |
| 2 | 实现 direction feed hook | frontend | done | polling/previous data/query key |
| 3 | 创建 result rail 与组件测试 | frontend | done | 三组状态不共享配额 |
| 4 | 改造 ComparisonView | frontend | done | 真图/缺失态/布局 |
| 5 | 创建 comparison panel | frontend | done | 维度→真实 invariant→四动作 |
| 6 | Workspace 接线 selected/preferred/adjustment | frontend | done | selected 瞬时、preferred 会话持久化 |
| 7 | green：组件/E2E/fast gate | frontend | done | 保存证据 |

## 验收标准

### 功能验收

- [x] AC-04 queue/processing/success/failure 全部内联显示；成功不依赖弹层理解结果。
- [x] AC-04 六个成功结果只显示最新五个，active/latestFailure 独立呈现，旧结果可打开 Iteration。
- [x] AC-06 新成功只成为当前选择；本次首选只由用户操作且视觉/文案不同。
- [x] AC-05 比较使用真实参考/结果；选择维度后展示真实 observation/invariant/Prompt segment，不输出自动偏差结论。
- [x] AC-05 零/单/多 invariant 分支正确；四动作只作用于所选真实规则；应用不自动生成，取消零写入，“其他”进入全文编辑。
- [x] AC-07 列表/图片/详情失败保留缓存和草稿并提供重试/Iteration 动作；焦点进入和返回连续。
- [x] E2E-TDD：主 spec 的结果/比较场景先 red 后 green。

### 性能验收（架构 §8.1）

- [x] active 时 2-3 秒一次刷新，终态停止；每个 Workspace 至多一个 direction query 和一个主动详情轮询。
- [x] 比较详情 API p95 ≤500ms（不含图片传输），前端无重复瀑布请求。

### 降级回归验收（架构 §8.2）

- [x] L1 segment 缺失逐项标记且全文编辑可用；L2 feed/图片失败不显示假图、不清草稿。
- [x] L3 Provider 失败条目保留 Prompt/Recipe/params 上下文，并只提供主动重试。
- [x] `pnpm verify:fast` 通过。

## 验证命令

```bash
pnpm vitest --run src/hooks/__tests__/use-direction-iterations.test.tsx src/components/workspace/__tests__/direction-result-rail.test.tsx src/components/workspace/__tests__/result-comparison-panel.test.tsx src/components/workspace/__tests__/comparison-view.test.tsx
pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts --project=workspace
pnpm verify:fast
```

## 交接上下文

- **架构章节**: ADR-5/7、§6.4、§6.5、§7.2/7.3、§8.1/8.2
- **相关代码**: `src/hooks/use-iteration-detail.ts`、`src/components/workspace/comparison-view.tsx`、`src/app/workspace/page.tsx`
- **契约 / 数据对象**: `DirectionIterationFeed`、`DirectionIterationListItem`、`InvariantAdjustment`、`selectedIterationId`/`preferredIterationId`
- **下游消费方**: plan-06、plan-07

## 风险与边界

- **执行顺序**: red → hook → rail → compare → page wiring → green。
- **验证失败排查方向**: React Query key/interval、selected 与 preferred 双写、历史快照误覆盖当前草稿、focus return ref。
- **允许修改的额外文件**: `src/components/iterations/iteration-state-faces.tsx`（仅复用/扩展现有任务状态 face，保持 Iteration 页面兼容）。
- **暂停条件**: direction GET 不符合 plan-03 契约；比较需要新增 AI 偏差评分；调整无法定位真实 invariant ID。
- **E2E 不适用说明**: 不适用；本功能是核心用户可观察闭环。
- **风险备注**: rail 可紧凑/横向滚动，但不得把完整历史塞入 Workspace。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| feed 查询失败后重试 | 保留 previous data 与草稿，重试同 query | done |
| completed 缺图片资产 | 显示来源异常，不渲染假图或开放结果动作 | done |
| 维度有多个 invariants | 未选具体规则时四动作 disabled | done |
| 维度无 invariant | 只允许其他/全文编辑，不写 adjustment | done |
| 比较的是旧快照结果 | 展示历史上下文，调整明确写入当前草稿 | done |
| preferred 滚出五条窗口 | 暂保 ID，plan-06 用 detail 验证并显示 Iteration 提示 | done |

## 执行记录

### 2026-09-01 implement 完成后的全量回归修复：Prompt 卡编辑区压入 Render Dock（TC-8.2/8.3）

- **现象**: 全量 workspace E2E 回归中 `e2e/ai-first-visual-regression.spec.ts › TC-8.2/TC-8.3 analysis_ready layout has no text overlap or button overflow` 失败：1440×900 下 `expectNoOverlap(output-card, unified-prompt-editor)` 报重叠 14137px²。
- **根因（boundingBox 探针实测）**: plan-04 在 Prompt 卡顶部引入两轴控制条（`prompt-intent-controls`，实测 88px）后，`prompt-card.tsx` 的 `prompt-editor-frame` 在 Render Dock 可见分支仍保留 `min-h-[11.5rem]`（184px）固定下限。1440×900 下内容区剩余可用高度约 146px < 184px，flex item 无法收缩到下限以下，编辑框布局盒越过内容区下界（内容区 `overflow-hidden` 只裁剪视觉，`boundingBox` 仍重叠）伸入 Render Dock 槽位约 38px。任何固定大下限在 1440×900 都放不下；探针进一步实测 1280×720 下卡片固定内容（标题 55 + 控制条 88 + Render Dock 141 + 边距）已超过卡片总高（307px），内容区仅 53px——该视口的重叠是本期 UI 堆叠的结构性挤压，只能缓解（保留可见下限）无法完全消除。
- **修复（三处最小布局调整）**:
  1. `src/components/workspace/prompt-card.tsx`：编辑区 frame 在「控制区存在且 Render Dock 可见」分支的下限从 `min-h-[11.5rem]` 改为 `min-h-[8rem]`（128px）——1440×900 下可用约 188px（配合下述空间回收）完全容纳、不再压入 Render Dock；同时 720p 高度下结构化只读视图等内部区块保留可见高度（实测 96px 下限时 `structured-readonly-view` 会被压缩到 0，导致 TC-4.5 失败）。无控制区（证据预览/旧形态，从未触发重叠）分支保留原 `min-h-[14rem]`。
  2. `src/components/workspace/prompt-card.tsx`：卡片标题行下边距 `mb-4 → mb-2`，把纵向空间让给编辑区/Render Dock。
  3. `src/components/workspace/direction-result-rail.tsx`（plan-05 交付物）：空态/加载态从两行块（约 63px）收成单行紧凑形态（实测 29px），rail 常驻三栏下方时不再挤压专业画布。
- **修复后实测**: 1440×900 编辑框底边回到内容区下界之内（恢复与 Render Dock 槽的 mt-2 间隙）；1280×720 编辑器保持 128px 可见（旧形态重叠从 147px 降至 49px，该视口无断言且属结构性挤压，遗留 plan-07 全量回归统一处理）。
- **修改文件**: `src/components/workspace/prompt-card.tsx`（frame 下限 + 标题边距，该文件为 plan-04 交付物，本次为本期 UI 改动引入回归的最小修复）、`src/components/workspace/direction-result-rail.tsx`（空态紧凑化）。视觉 spec 断言未改动。
- **验证**: `pnpm exec playwright test e2e/ai-first-visual-regression.spec.ts --project=workspace` 6/6 通过（含 TC-8.2/8.3）；`pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts --project=workspace` 37/37 通过；`pnpm verify:fast` 通过（117 文件 1190 测试）。
