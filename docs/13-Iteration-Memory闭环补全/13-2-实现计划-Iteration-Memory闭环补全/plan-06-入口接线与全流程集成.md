---
feat_id: "plan-06"
title: "入口接线与全流程集成"
dimension: frontend
phase: 5
status: done
depends_on: ["plan-04", "plan-05"]
---

# plan-06: 入口接线与全流程集成

## 功能概要

- **目标**: 打通全部用户入口——近期迭代条"查看全部"与左侧导航 Iterations 项——并以一条全流程 E2E 回归整个 Iteration Memory 闭环（列表 → 详情 → 继续 → 生成 → 保存），同时确认 US-01~US-10 全部可走通、近期条既有行为不回归。
- **完成后可观察结果**: 用户在工作台底部近期迭代条点击"查看全部"进入完整 Iteration Memory（默认全状态）；左侧导航出现 Iterations 入口，可与生成、Style Memory 并列切换。从近期条到列表、详情、继续此方向（含守卫确认）、回到工作台修改并生成新迭代、再保存为 Style Memory 的完整旅程可在一条 E2E 中走通。既有近期迭代条行为与其 E2E（`workspace-history-strip.spec.ts`、`workspace-ai-first-iteration-memory.spec.ts`）不回归。
- **依赖**: plan-04（恢复链路）、plan-05（保存链路）
- **关联验收标准**: [AC-01, AC-07]
- **涉及架构模块**: 入口与沉淀模块（近期条与导航）、Iteration Memory 页面与组件（集成回归）
- **前置条件**: plan-02 ~ plan-05 全部合入
- **不在范围**: 新功能实现；任何后端改动

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 将近期条 onViewAll 既有接线（当前指向不存在的 `/history` 路由，约 L796）改为 `/workspace/iterations?status=all` |
| modify | `src/components/workspace/history-strip.tsx` | "查看全部"动作已存在（onViewAll prop）；仅按 PRD 线框校准文案与位置，既有交互不变 |
| modify | `src/components/workspace/left-sidebar.tsx` | 增加 Iterations 导航项（与生成 / Style Memory 并列） |
| modify | `package.json` | 将本期 5 个新 spec 追加进 `e2e:targeted` 脚本清单（承接架构 §9 Phase B 验证目标，纳入 CI 验收门） |
| create | `e2e/workspace-iteration-memory-integration.spec.ts` | 全流程集成 E2E（red → green） |

## 实现规格

### 前端部分

#### 1. 近期迭代条"查看全部"（既有入口接线修正）

- "查看全部"按钮已存在于 `history-strip.tsx`（`onViewAll` prop 上抛），但 `page.tsx` 当前接线指向不存在的 `/history` 路由（死链）。本任务把该接线改为 `/workspace/iterations?status=all`，并按 PRD 线框校准入口文案与位置；近期条自身继续以默认参数（completed-only）调用列表接口，条目与既有交互不变。
- PRD 线框中的"比较最近"为既有能力范畴，不在本任务改动。

#### 2. 左侧导航项（`left-sidebar.tsx`）

- 按现有导航结构增加 Iterations 项（图标复用 `src/components/ui/app-icon.tsx` 既有图标集），高亮规则与现有项一致；窄屏遵循既有响应式收纳规则。

#### 3. 全流程集成 E2E（`workspace-iteration-memory-integration.spec.ts`）

- 场景主线（mock API 驱动）：近期条"查看全部" → 列表（三态）→ 搜索/筛选 → 打开已完成详情 → 继续此方向（守卫确认）→ 工作台恢复快照 → 修改提示并生成（断言新 `POST /api/generation`）→ 回到详情保存为 Style Memory → 已保存态 + 打开定位。
- 附近期条回归：既有两个 spec 保持绿色；本 spec 断言近期条默认参数调用不受入口新增影响。

#### 4. 验收门接入（`package.json`）

- 将 `workspace-iteration-memory-list / workspace-iteration-detail / workspace-iteration-restore / workspace-iteration-save-style-memory / workspace-iteration-memory-integration` 5 个 spec 追加进 `e2e:targeted` 脚本的 spec 清单（该脚本是 `verify:acceptance` 的浏览器套件来源，CI 手动验收门由此覆盖本期全部新 spec）。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 集成 E2E red | frontend | done | 4 用例（TC-6.1~6.4）全部预期失败，red 证据：`docs/e2e/evidence/plan-06-e2e-red-2026-08-17.md`（判定"预期失败，测试有效"） |
| 2 | 近期条"查看全部"接线修正 | frontend | done | `page.tsx` 约 L884 `onViewAll` 死链 `/history` 改为 `router.push("/workspace/iterations?status=all")`；`history-strip.tsx` 现有表达（右侧 `[Compare][View all]`、View all 恒启用）已与 PRD 线框一致，按"既有交互不变"零 delta |
| 3 | 左侧导航 Iterations 项 | frontend | done | `navItems` 追加 Iterations（label/ariaLabel "Iterations"、href `/workspace/iterations`、`startsWith` match、`aria-current`/`data-active` 高亮同现有项、图标复用既有集 `History`），置于 Style Memory 之后（PRD §3.1 线框顺序：生成 / Style Memory / Iterations） |
| 4 | e2e:targeted 接入 | frontend | done | `package.json` 将 5 个新 spec（list / detail / restore / save-style-memory / integration）追加进 `e2e:targeted`（`verify:acceptance` 浏览器套件来源，CI 手动验收门覆盖） |
| 5 | 实现至 E2E green + 回归 | frontend | done | 集成 spec 4/4 绿（2026-08-17 实跑两次均绿）；`workspace-ai-first-iteration-memory.spec.ts` 回归 6/6 绿；`pnpm verify:fast` 绿（workflow + type + lint + 99 文件 807 用例）；`workspace-history-strip.spec.ts` 为 plan-04 审查确认的存量失败（见风险备注），非本期回归 |

## 验收标准

### 功能验收

- [x] AC-01 从工作台近期迭代条"查看全部"可到达完整 Iteration Memory 并默认展示全部状态（TC-6.1/6.2/6.4：URL `/workspace/iterations?status=all`、All 单选选中、三态条目渲染）
- [x] 左侧导航 Iterations 项可正常切换与高亮，不破坏既有导航（TC-6.3：Generate / Style Memory Library / Iterations 三项并列，命中时 `aria-current="page"` 且 Generate 不高亮）
- [x] 近期迭代条既有行为与 spec（`workspace-history-strip.spec.ts`、`workspace-ai-first-iteration-memory.spec.ts`）不回归 —— `workspace-ai-first-iteration-memory.spec.ts` 6/6 绿 + TC-6.2 断言近期条默认参数（pageSize=20、无 status/q → completed-only）不变；`workspace-history-strip.spec.ts` 失败为存量问题（断言的 `floating-generate-button`/`top-mode-switcher` 已被更早提交移除，plan-04 审查第 7 项确认为存量失败、不在任何 CI 套件内），本期改动不涉及其断言对象，按存量结论引用不修复
- [x] 5 个新 spec 已纳入 `pnpm e2e:targeted` 套件清单（架构 §9 验证目标承接，CI 验收门覆盖）
- [x] `pnpm verify:fast` 通过（exit 0：workflow:check + test:workflow + type-check + lint + 99 个测试文件 807 用例全绿）

### 全流程验收（US 覆盖矩阵）（架构 §2.3 成功标准）

> PRD §2.2 核心与延伸用户故事在完整功能交付后全部可走通。

| US 编号 | 用户故事简述 | 承接功能 | 验证方式 |
| --- | --- | --- | --- |
| US-01 | 查看全部生成尝试 | plan-02, plan-06 | 集成 E2E：近期条 → 查看全部 → 全状态列表 |
| US-02 | 按提示内容和状态查找 | plan-02 | 列表 E2E：搜索/筛选组合 |
| US-03 | 详情完整上下文 | plan-03 | 详情 E2E：并排展示 + 分区块 |
| US-04 | 安全带回工作台 | plan-04 | 恢复 E2E：快照恢复 + 新迭代 |
| US-05 | 恢复前明确提醒 | plan-04 | 恢复 E2E：守卫确认与取消 |
| US-06 | 失败记录保留完整上下文 | plan-03, plan-04 | 详情 E2E（failed）+ 恢复 E2E（修正并继续） |
| US-07 | 保存为 Style Memory | plan-05 | 保存 E2E：预填/已保存态/打开 |
| US-08 | 进行中任务阶段可见 | plan-03 | 详情 E2E：processing 轮询切换 |
| US-09 | 关闭详情停留原位置 | plan-02 | 列表 E2E：返回保位 |
| US-10 | 登录/服务问题说明保留 | plan-02 | 列表 E2E：未登录/5xx 面 |

- [x] US-01 ~ US-10 全部可在当前实现下正常走通（最终集成回归）——主线由集成 E2E TC-6.1 端到端覆盖（近期条 → 查看全部 → 列表 → 详情 → 守卫恢复 → 新迭代生成 → 保存 → 打开定位）；US-02/03/05/06/08/09/10 的专项分支由 plan-02~05 各自 E2E 承载（本期各 spec 均绿，含本日 `pnpm e2e:targeted` 实跑）

### E2E 验收（red → green）

- [x] `pnpm e2e -- e2e/workspace-iteration-memory-integration.spec.ts --project=workspace` 全流程通过；实现前先留存 red 证据 —— red：`docs/e2e/evidence/plan-06-e2e-red-2026-08-17.md`（4/4 预期失败）；green：2026-08-17 实跑两次均 `4 passed`（TC-6.1~6.4 无放宽断言）；正式 green evidence 文档待 green_e2e 步骤产出

## 验证命令

```bash
pnpm e2e -- e2e/workspace-iteration-memory-integration.spec.ts --project=workspace
pnpm e2e -- e2e/workspace-history-strip.spec.ts --project=workspace
pnpm e2e -- e2e/workspace-ai-first-iteration-memory.spec.ts --project=workspace
pnpm e2e:targeted
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §4.2（入口与沉淀模块）、§2.3（成功标准与 US 覆盖）、§9 Phase C
- **相关代码**: `src/components/workspace/history-strip.tsx`、`src/components/workspace/left-sidebar.tsx`、`e2e/workspace-ai-first-iteration-memory.spec.ts`（近期条既有 spec，防回归）
- **契约 / 数据对象**: 入口链接 `/workspace/iterations?status=all`（页面级默认与 URL 同步规则见 plan-02）
- **下游消费方**: 无（最终集成功能）；发布检查与 UAT 以本功能 green 证据为前置

## 风险与边界

- **执行顺序**: Task 1（red E2E）必须最先完成并留存失败证据，再按 Task 2-4 顺序实现，Task 5 收口转 green
- **验证失败排查方向**: 集成 E2E 中断在恢复段 → 检查 plan-04 flush 时序；中断在保存段 → 检查 plan-05 提交体字段；近期条回归失败 → 检查"查看全部"是否影响既有布局/参数
- **允许修改的额外文件**: 无
- **暂停条件**: 集成 E2E 暴露前序功能缺陷且无法在本功能文件清单内修复时（回到对应 plan 修复后重跑）
- **风险备注**: 本功能是全链路验收门；任一环节 red 都应回溯到对应功能修复，不在本功能内打补丁。本期收口时全部环节一次转绿，未触发回溯。
- **存量问题引用**: `e2e/workspace-history-strip.spec.ts` 断言的 `floating-generate-button`/`top-mode-switcher` 已被更早提交（0ee90d4/3f2187e）移除，plan-04 审查第 7 项（`reviews/plan-04-review-2026-08-17.md`）确认为存量失败、不在任何 CI 套件内；本期改动（onViewAll 目标路由、导航项、脚本清单）不涉及其断言对象，按存量结论引用、不修复该 spec。近期条 completed-only 默认行为回归由 `workspace-ai-first-iteration-memory.spec.ts`（6/6 绿）与集成 spec TC-6.2 共同承载。
- **E2E 不适用说明**: 不适用（用户可观察功能，E2E 必选）

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 近期条无任何完成结果 | "查看全部"仍可用，进入列表页看全状态 | done（TC-6.4：空近期条 "View all" 恒启用，进入后 processing/failed 条目可见） |
| 从导航进入时 URL 无参数 | 页面级默认 status=all（plan-02 规则） | done（TC-6.3：导航项无参进入，首请求 `status=all`、All 单选选中） |
| 集成链路中某环节 mock 失败 | 回溯对应功能修复，不在本功能打补丁 | done（全流程一次通过，未触发回溯；plan-02~05 链路 spec 各自全绿） |
| 窄屏导航项收纳 | 遵循 left-sidebar 既有响应式规则 | done（新项复用现有项同一组类：图标常显、label `hidden md:inline`，未新增收纳规则） |
