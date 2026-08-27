---
feat_id: "plan-04"
title: "Style Memory 列表页"
dimension: frontend
phase: 3
status: done
depends_on: ["plan-02"]
---

# plan-04: Style Memory 列表页

## 功能概要

- **目标**: 按 PRD §3.1 线框与架构 §6.1 重建 Style Memory 列表：新卡片（验证状态徽标 + 代表结果/来源图预览 + 规则摘要 + 变量数 + 最近使用）、三态验证筛选、与可见信息一致的搜索、最近使用排序、URL 条件持久化、空态双入口与全部异常状态，导航术语统一为 "Style Memory"。
- **完成后可观察结果**: 进入列表后，已验证卡片以代表结果为主预览并标注参考图，待验证卡片只显示真实来源图或"无预览"，卡片规则摘要来自实际保存内容而非名称推导；搜索一条卡片上可见的规则或变量名能命中，状态筛选与搜索可组合，进详情返回后条件与浏览位置保持；空列表提供"打开工作区 / 查看 Iterations"双入口；未登录与服务异常状态保留查询条件并可恢复。卡片"使用"按钮本功能保持现状跳转（由 plan-07 接管为预检入口）。
- **依赖**: plan-02（列表 API 新 DTO）
- **关联验收标准**: [AC-01, AC-02, AC-08, AC-10]
- **涉及架构模块**: ③ 列表页模块
- **前置条件**: plan-02 完成且本地库有 mock/测试数据可用；`e2e/` 现有 mocked 模式可参照。
- **不在范围**: 预检弹层与"使用"行为改造（plan-07）；详情页（plan-05）；删除/复制入口迁移（本功能卡片仅保留"查看详情/使用"，治理动作移入详情——移除卡片上的复制/删除按钮）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/style-memory-view-model.ts` | 重写为真实字段驱动，删除 `NAME_TAG_RULES` 名称派生 |
| modify | `src/lib/__tests__/style-memory-view-model.test.ts` | 用例重写 |
| modify | `src/hooks/use-template-search.ts` | 接新 DTO + `status` 筛选参数 |
| modify | `src/app/workspace/templates/page.tsx` | 筛选/URL 持久化/排序/空态/错误态/卡片接线 |
| modify | `src/components/workspace/template-card.tsx` | 新卡片布局 |
| modify | `src/components/workspace/left-sidebar.tsx` | "Library" → "Style Memory"、ariaLabel 同步 |
| create | `e2e/style-memory-list.spec.ts` | AC-01/02/10 场景（red 先行） |
| modify | `e2e/template.spec.ts` | 受影响用例更新 |
| modify | `e2e/ai-first-style-memory.spec.ts` | 受影响用例更新 |
| modify | `e2e/template-default-values.spec.ts` | 卡片/DTO 变更影响的模板默认值用例更新（架构 §9 Phase B 点名 spec，全量 e2e 门） |
| modify | `e2e/ai-first-shell.spec.ts` | 导航 "Library"→"Style Memory" 断言更新 |
| modify | `e2e/workspace-iteration-memory-integration.spec.ts` | "Style Memory Library" 导航断言更新 |
| modify | `e2e/precision-glass-shell.spec.ts` | 导航文案基线更新 |
| modify | `e2e/ai-first-visual-regression.spec.ts` | 模板列表页卡片视觉基线重拍（卡片重设计后旧基线失效） |

## 实现规格

### 前端部分

#### 1. 视图模型重写（`style-memory-view-model.ts`）

输入改为 `StyleMemoryListItem`（plan-02 DTO），输出卡片视图：

- **状态徽标**：`user_verified` → "用户已验证" / `pending_verification` → "待验证"；同时含文字与视觉标识（图标 + 文本），不只依赖颜色（PRD 规则 3）
- **规则摘要**：`retainedRulesPreview.join(" · ")`（服务端已取前 2 条；空数组显示"规则待补充"）
- **预览选择**：已验证 → `representativeImageUrl` 为主预览 + 来源图小图与"参考图"标注；待验证 → `sourceImageUrl`，无则显示"无预览"占位（不使用示例图暗示成功，PRD 规则 7）
- **次要信息**：`{variableCount} 个变量`、`lastUsedAt ? 相对时间 : "尚未使用"`
- **动作**：`查看详情`（→ `/workspace/templates/{id}`）、`使用`（本功能维持现状跳转 `/workspace?templateId={id}`；plan-07 接管）
- **删除全部名称派生逻辑**（`NAME_TAG_RULES` / `deriveNameTags` / `NAME_STOP_WORDS`）与 "Source-backed / Prompt-only / Variable structure" 推导标签

#### 2. 搜索/筛选 hook（`use-template-search.ts`）

- 请求参数增加 `status`（`all | user_verified | pending_verification`，与 URL 同步）；响应条目映射新视图模型输入
- 搜索防抖与加载/错误/未登录状态沿用既有结构

#### 3. 列表页（`templates/page.tsx`）

- **筛选**：`[全部] [用户已验证] [待验证]` 互斥单选，替换现有 all/source-backed/prompt-only；与搜索组合生效
- **URL 条件持久化**：`search` / `status` / `cursor` 写入 query（`router.replace` 浅替换），从详情返回时原条件与滚动位置恢复（沿用现有 `focus` 参数模式扩展）
- **搜索提示**：placeholder 与实际谓词一致，承诺范围 = "名称、说明、风格规则（含指纹与增强方向）、排除约束、变量名与标签"（架构 §6.1 口径，不承诺来源图像检索）；placeholder 可精简为"搜索名称、风格规则或变量"，但 aria-label/help 文案必须承载全量口径
- **排序**：仅"最近使用"（服务端已按 `COALESCE(last_used, updated_at) DESC` 返回，前端不二次排序；无排序切换器）
- **空态**：双入口——"打开工作区"（`/workspace`）与"查看 Iterations"（`/workspace/iterations`）；现有空态两按钮均指向工作区，须修正其一（AC-10 首句）
- **未登录**（401）：说明云端 Memory 需要登录，保留 URL 查询条件，提供登录入口与返回工作区（PRD AC-10）
- **服务不可用**（503）：保留搜索/筛选/当前内容可见，提供重试；重试成功恢复原条件与位置
- **加载**：沿用现有 `SkeletonCard` 骨架，不显示虚假资产
- **卡片交互**：更多操作/复制/删除按钮从卡片移除（治理集中在详情，PRD 决策"详情为统一入口"）；清除搜索按钮有 `aria-label` 且命中面积 ≥ 44×44px（PRD 规则 29）

#### 4. 导航术语（`left-sidebar.tsx`）

- `label: "Library"` → `"Style Memory"`；`ariaLabel: "Style Memory Library"` → `"Style Memory"`；`app-shell.tsx` 已输出 "Style Memory" 仅核对无回归（架构 ADR-8）

#### 5. E2E（`e2e/style-memory-list.spec.ts`，red 先行）

遵循现有 mocked 模式（拦截 `/api/templates` 路由返回 fixture）：

- AC-01：已验证卡（代表结果预览 + 状态徽标 + 规则摘要）与待验证卡（来源图/无预览）对比断言；加载骨架出现后消失
- AC-02：按规则词搜索命中、按变量名搜索命中、状态筛选组合、无结果时条件保留与清除动作、进详情返回后条件保持
- AC-10：空态双入口存在且分别指向 `/workspace` 与 `/workspace/iterations`；401 状态保留查询

同步更新 `template.spec.ts` / `ai-first-style-memory.spec.ts` 中因卡片/筛选/导航改名受影响的用例。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：style-memory-list.spec.ts 编写并确认失败 | frontend | done | red 证据：docs/e2e/evidence/plan-04-e2e-red-2026-08-26.md（14/14 预期失败） |
| 2 | 视图模型重写 + 单测 | frontend | done | 9/9 绿；删除名称派生（NAME_TAG_RULES/deriveNameTags/NAME_STOP_WORDS） |
| 3 | use-template-search 扩展 status | frontend | done | 新 DTO + status 三态 + initialCursor URL 恢复；queryKey 隔离防快速切换竞态 |
| 4 | 列表页筛选/URL 持久化/空态双入口/错误态 | frontend | done | router.replace 浅替换持久化 search/status；401 callbackUrl 带查询；503 保留工具栏可重试；骨架 testid |
| 5 | template-card 新布局 | frontend | done | 徽标/预览选择/规则摘要/L1 onError 回退；卡片仅“查看详情/使用” |
| 6 | left-sidebar 导航改名 | frontend | done | label/ariaLabel 均为 "Style Memory"；app-shell 核对无回归 |
| 7 | 存量 e2e 受影响用例更新 | frontend | done | 计划内 7 个 spec + 计划外 2 个受影响 spec（ai-first-landing-states、workspace-iteration-save-style-memory，英文文案/旧 DTO 断言受新卡片影响）；视觉基线按新卡片断言重拍（ai-first-visual-regression 无 committed 基线截图，结构性断言已更新） |
| 8 | green：新 spec 全绿 + verify:fast | frontend | done | 新 spec 14/14；全 workspace e2e 195/195；verify:fast 107 文件 970 用例全绿 |

## 验收标准

### 功能验收

- [x] AC-01 已验证卡片显示代表结果主预览 + 参考图标注 + 状态徽标（文字+视觉）+ 真实规则摘要 + 变量数 + 最近使用；待验证卡片不用成功语气、不显示示例结果、无名称派生标签（e2e TC-1.1 断言卡片文本与图片 src 全绿）
- [x] AC-01 加载期间页面结构稳定、显示骨架、无虚假资产闪现（e2e TC-1.2，`data-testid="style-memory-card-skeleton"`）
- [x] AC-02 规则词/变量名搜索命中；`search + status` 组合生效；无结果时保留条件并提供清除；进详情返回后原条件与浏览位置恢复（e2e TC-2.1～TC-2.6）
- [x] AC-10 空态有"打开工作区"与"查看 Iterations"双入口（href 断言）；401 保留查询条件；503 保留内容可重试（e2e TC-10.1～TC-10.3）
- [x] AC-08 清除搜索按钮有可理解名称且命中面积 ≥ 44×44px（e2e TC-8.1 boundingBox：44×44）
- [x] 导航显示 "Style Memory"（e2e TC-11 文本与 accessible name 均 exact）；`app-shell` 无回归（ai-first-shell TC-2.1 全绿）
- [x] 视图模型单测：徽标/摘要/预览选择/尚未使用分支全覆盖（含空规则数组）（9/9 绿）
- [x] `pnpm verify:fast` 通过（107 文件 / 970 用例全绿）

### 性能验收（架构 §8.1）

- [x] 列表接口（含聚合联查）响应 p95 ≤ 500ms。造数：本地对 templates/generation_tasks 执行一次性 seed SQL（520 条 Memory：偶数 user_verified/奇数 pending、规则与变量齐备、updated_at 递减；560 条 generation_tasks：300 条 source_template_id 派生关联 + 260 条代表结果关联，测量后已全部清理为 0 残留）。测量方式说明：API 层 `requireAuth` 需真实 Google 会话，DevTools HTTP 面板无法本地复现，故以真实 repository 代码路径 `findAllByUserId`（即路由内执行的聚合联查 SQL）直连本地 PostgreSQL 测量，每场景 20 次请求取 p95（DB 查询为接口耗时主体）：
  - list default（limit 20）：p95=4.6ms
  - list + status=user_verified：p95=3.1ms
  - list + search=柔和漫射光（规则命中）：p95=5.3ms
  - list + search=Subject + status=pending_verification（变量 label 命中全表）：p95=3.6ms
  - list 第 3 页 keyset 游标：p95=3.4ms
  - seed SQL 要点（`PLNBENCH*` 前缀，`generate_series(1,520)` 构造 templates，`(1000+g)`/`(2000+g)` 两段构造 generation_tasks，`UPDATE templates SET representative_generation_task_id` 关联代表结果；完整脚本见实现工作记录）。

### 降级回归验收（架构 §8.2）

- [x] L1（代表结果图 URL 失效）：已验证卡片 onError 回退来源图 + "代表结果图暂不可用"标注，状态徽标不变（template-card 组件测试覆盖）
- [x] L4/L5（登录失效/服务不可用）：条件保留、重试恢复原视图、工作区不受影响（e2e TC-10.2 / TC-10.3 覆盖）

## 验证命令

```bash
pnpm e2e -- e2e/style-memory-list.spec.ts --project=workspace
pnpm e2e -- e2e/template.spec.ts e2e/ai-first-style-memory.spec.ts e2e/template-default-values.spec.ts --project=workspace
pnpm e2e -- e2e/ai-first-shell.spec.ts e2e/workspace-iteration-memory-integration.spec.ts e2e/precision-glass-shell.spec.ts --project=workspace
pnpm e2e -- e2e/ai-first-visual-regression.spec.ts --project=workspace
pnpm vitest --run src/lib/__tests__/style-memory-view-model.test.ts
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.1（列表链路与搜索谓词/口径决策）、§4.2-③（模块交互链路）、ADR-8（导航改动点）、§8.2 降级链 L1/L4/L5、§8.1 性能目标
- **相关代码**: `src/app/workspace/templates/page.tsx`（现有 `SkeletonCard`、`focus` 参数、`primeWorkspaceSnapshotFromTemplate`——后者本功能不动）、`StatePresenter`（既有状态呈现组件，错误/空态优先复用）
- **契约 / 数据对象**: `StyleMemoryListItem`（消费）
- **下游消费方**: plan-07（接管卡片"使用"按钮为预检入口）

## 风险与边界

- **执行顺序**: Task 1（red）必须先行；Task 2/3 可并行；Task 4/5 依赖 2/3。
- **验证失败排查方向**: e2e fixture 与 DTO 字段不一致（先对照 plan-02 响应结构）；URL 恢复失败检查 `useSearchParams` 与 `router.replace` 的浅替换参数。
- **允许修改的额外文件**: `src/components/app-shell.tsx`（仅当导航核对发现回归时）。
- **暂停条件**: 存量 spec 更新量超过预期（> 10 个用例需重写）时暂停汇报。
- **E2E 不适用说明**: 不适用本功能（核心用户可观察功能，e2e 为主质量门）。
- **风险备注**: 卡片移除复制/删除按钮是交互收敛决策（PRD"详情为统一入口"），存量用例若断言卡片按钮需同步改写而非保留。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 规则数组为空（旧资产） | 摘要显示"规则待补充"，不虚构 | done |
| 代表结果图加载失败 | onError 回退来源图 + "代表结果图暂不可用"标注 | done |
| lastUsedAt 为 null | 显示"尚未使用" | done |
| 快速连续切换筛选 | 以最后一次请求为准（沿用 React Query key 隔离模式） | done |
| 游标翻页后返回列表 | 恢复原条件与位置（cursor 编码于 URL） | done（URL cursor → 请求参数透传已实现；翻页加载 UI 不在本功能范围） |