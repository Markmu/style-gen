---
feat_id: "plan-03"
title: "迭代详情三态与轮询"
dimension: frontend
phase: 3
status: done
depends_on: ["plan-02"]
---

# plan-03: 迭代详情三态与轮询

## 功能概要

- **目标**: 在列表页内交付 master-detail 详情面板——completed / processing / failed 三种变体、进行中 5s 轮询与状态原地迁移、上一条/下一条切换、详情打开与关闭不重置列表、旧记录缺失上下文的显式标记。
- **完成后可观察结果**: 用户点击列表条目后，页面右侧（详情区）打开对应详情且列表滚动位置不动。已完成详情并排展示参考图与真实结果，右侧清晰区分风格证据与不变量、提示内容、变量与排除项、生成设置；旧记录缺失的证据/变量/来源图被明确标记而不阻断浏览。进行中详情展示当前阶段与已保留上下文，几秒后自动原地切换为真实结果或失败态，全程没有生成或重复提交入口。失败详情展示失败说明与保留的上下文。详情加载失败时列表与筛选保持不变，可重试或关闭。"上一条/下一条"可连续切换，关闭详情回到原列表位置。
- **依赖**: plan-02（页面骨架、视图 store、列表数据）
- **关联验收标准**: [AC-03, AC-04, AC-07]
- **涉及架构模块**: Iteration Memory 页面与组件（详情侧）
- **前置条件**: plan-01 详情接口与 plan-02 页面已合入
- **不在范围**: "继续此方向 / 修正并继续"的动作行为（plan-04，本功能渲染动作区插槽占位）；"保存为 Style Memory"入口（plan-05）；列表含 processing 时的 10s 低频重拉在 Task 6 一并交付

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/iterations/iteration-detail-panel.tsx` | 三态详情面板（含动作区插槽 props） |
| create | `src/hooks/use-iteration-detail.ts` | 详情加载 + processing 5s 轮询 + 失败退避 |
| modify | `src/app/workspace/iterations/page.tsx` | 详情编排：selectedId 联动、上一条/下一条、打开/关闭 |
| modify | `src/hooks/use-iteration-list.ts` | 列表含 processing 条目时 10s 低频重拉 |
| modify | `src/lib/iterations/view-model.ts` | 详情视图模型（缺失标记 → 提示文案） |
| create | `src/components/iterations/__tests__/iteration-detail-panel.test.tsx` | 三态变体与缺失标记组件测试 |
| modify | `e2e/helpers/mock-api.ts` | 详情三态 mock 与轮询序列 mock |
| create | `e2e/workspace-iteration-detail.spec.ts` | 详情 E2E（red → green） |

## 实现规格

### 前端部分

#### 1. 详情数据 hook（`use-iteration-detail.ts`）

- 输入 `selectedId`；加载 `GET /api/generation/[id]`，输出 `{ detail, status: 'loading'|'ready'|'error' }`。
- `detail.status === 'processing'` 时每 5s 轮询同一端点；观测到 `completed`/`failed` 原地替换并停止；轮询连续失败 3 次停止并进入"更新暂不可用 + 重试"，保留已展示内容。
- `selectedId` 变化即取消在途请求与轮询（防串台）。

#### 2. 详情面板（`iteration-detail-panel.tsx`）

- 头部：`← 返回列表`、状态徽标、`上一条 / 下一条`（由页面传入回调与可用性）。
- **completed 变体**：左区参考图与生成结果并排（第一视觉焦点）；右区"当时的创作上下文"分区块——风格证据与不变量（recipe facets，复用 `src/lib/evidence-facets.ts` 的既有展示映射）、提示内容、变量与排除项、生成设置（`params` + `modelName`）。底部动作区以插槽 props 暴露（`actions?: ReactNode`），本功能传空占位容器。
- **processing 变体**：当前阶段文案 + "参考图、提示和设置已经保留，可以离开此页面" + 已保留上下文区；不渲染任何生成/重复提交动作。
- **failed 变体**：失败说明（`errorMessage` 映射为业务文案）+ 保留的参考图/提示/变量/排除项/设置 + 底部动作区插槽（"修正并继续"由 plan-04 填充）。
- **缺失标记**（消费 `recipeSource`/`variablesSource`/`sourceImageUrl == null`/`sourceAssetId == null`）：对应区块显示"该内容来自回退记录 / 当时内容缺失"类提示（L2 降级，文案三段式）；来源图缺失显示占位说明而非裂图。
- 详情错误态：保留列表，详情位展示错误说明 + 重试 / 关闭。
- 安全（架构 §8.3 继承）：详情中的提示、排除项、失败说明与证据文本一律按纯文本渲染，不拼接 HTML、不执行任何快照内容。

#### 3. 页面编排（`page.tsx` 改造）

- `selectedId`（来自视图 store）驱动详情 hook；关闭详情只清 `selectedId`，不触碰列表状态与滚动。
- 上一条/下一条：基于当前列表条目序列 + 游标栈计算相邻 id；跨页边界触发"加载较早"后继续切换；切换后列表选中高亮同步。
- 列表低频刷新：当前窗口含 `processing` 条目时每 10s 重拉当前查询（仅替换条目数据，不重置滚动；无 processing 即停）。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | E2E red | frontend | done | `workspace-iteration-detail.spec.ts` 先写 spec 并跑出预期失败，留存 red 证据：`docs/e2e/evidence/plan-03-e2e-red-2026-08-17.md`（9 用例 TC-3.1~3.9 全部预期失败，判定"预期失败，测试有效"） |
| 2 | 详情 hook + 轮询退避 | frontend | done | `use-iteration-detail.ts`：React Query `refetchInterval` 实现 processing 5s 轮询、`fetchFailureCount >= 3` 停止并保留内容、query-key 随 selectedId 切换隔离（防串台） |
| 3 | 详情面板三态变体 | frontend | done | completed/processing/failed 三变体 + `primaryActions`/`secondaryActions` 插槽（本功能传空占位容器，processing 不渲染动作区） |
| 4 | 缺失标记与降级呈现 | frontend | done | recipeSource/variablesSource `data-source` 标记 + 三段式降级文案（fallback/missing，view-model 扩展）、sourceImageUrl 缺失与图片加载失败占位（`iteration-reference-missing`） |
| 5 | 页面 master-detail 编排 | frontend | done | selectedId 驱动详情 hook；关闭详情只清 selectedId（列表/筛选/滚动不动）；详情 5xx/404 → `iteration-detail-error`（Retry/Close），列表状态保持 |
| 6 | 上一条/下一条 | frontend | done | 列表序列计算相邻 id；下一条跨页边界先触发"加载较早"，新页到位后由 effect 自动继续切换；边界方向按钮 disabled |
| 7 | 列表 10s 低频重拉 | frontend | done | `use-iteration-list` `refetchInterval`：当前窗口含 processing 时 10s 重拉（仅替换条目数据，不重置滚动），无 processing 即停 |
| 8 | 组件测试 | frontend | done | `iteration-detail-panel.test.tsx` 17 用例：三态渲染、缺失/回退提示、无重复提交入口、快照文本纯文本渲染（含 `<script>`/`<img onerror>` 字面量断言）、插槽与边界禁用 |
| 9 | 实现至 E2E green | frontend | done | `pnpm e2e -- e2e/workspace-iteration-detail.spec.ts --project=workspace` 9/9 通过；plan-02 回归 `workspace-iteration-memory-list.spec.ts` 9/9；`pnpm vitest --run src/components/iterations/__tests__/iteration-detail-panel.test.tsx` 17/17；`pnpm verify:fast` 全绿（772 unit + workflow + type + lint） |

## 验收标准

### 功能验收

- [x] AC-03 已完成详情并排展示参考图与真实结果，并清晰区分风格证据与不变量、提示内容、变量、排除项、生成设置
- [x] AC-03 快照来源为 `snapshot`（新记录）；存量记录回退展示并带明确缺失/回退标记；`missing` 与来源图缺失均有提示且不阻断其余内容
- [x] AC-04 processing 详情展示当前阶段与已保留上下文，不出现生成/重复提交入口；轮询完成后原地切换为真实结果或失败态
- [x] AC-04 failed 详情展示失败说明、保留的参考与创作上下文，底部动作区为"修正并继续"预留插槽（点击行为由 plan-04 验收）
- [x] 详情打开/关闭与上一条/下一条切换均不重置列表搜索、筛选与滚动位置
- [x] 详情加载失败：列表与视图状态不动，可重试或关闭；轮询连续失败 3 次停止并保留最后内容
- [x] 组件测试与 `pnpm verify:fast` 通过

### E2E 验收（red → green）

- [x] `pnpm e2e -- e2e/workspace-iteration-detail.spec.ts --project=workspace`：三态详情渲染、processing 轮询序列到 completed 原地切换（mock 轮询）、failed 上下文保留、详情 5xx 保留列表可重试、上一条/下一条与返回保位；实现前先留存 red 证据
  - red：`docs/e2e/evidence/plan-03-e2e-red-2026-08-17.md`（9 用例全部预期失败）
  - green：2026-08-17 本地运行 9/9 通过（TC-3.1~TC-3.9）；plan-02 回归 `workspace-iteration-memory-list.spec.ts` 9/9 通过

## 验证命令

```bash
pnpm e2e -- e2e/workspace-iteration-detail.spec.ts --project=workspace
pnpm vitest --run src/components/iterations/__tests__/iteration-detail-panel.test.tsx
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §3.3（详情状态机）、§6.2（打开详情链路）、§6.5（轮询更新）、§7.2（IterationDetail 含 source 标记）、ADR-7
- **相关代码**: `src/lib/evidence-facets.ts`（recipe → facet 展示映射）、`src/components/workspace/history-detail-dialog.tsx`（既有详情呈现参照）、plan-02 的视图 store 与列表 hook
- **契约 / 数据对象**: `IterationDetail`（plan-01 交付）；`actions` 插槽约定：`{ primaryActions?: ReactNode; secondaryActions?: ReactNode }`
- **下游消费方**: plan-04（"继续此方向/修正并继续"填充 primaryActions）、plan-05（保存入口填充 secondaryActions）

## 风险与边界

- **执行顺序**: Task 1（red E2E）必须最先完成并留存失败证据，再按 Task 2-8 顺序实现，Task 9 收口转 green
- **验证失败排查方向**: 轮询场景失败先看 mock 序列与 hook 取消逻辑；缺失标记不显示检查 view-model 对 source 字段的映射
- **允许修改的额外文件**: 无
- **暂停条件**: 发现详情接口缺少面板必需字段（需回改 plan-01 契约）、或需要改既有 history-detail-dialog 的公共行为时
- **风险备注**: 详情与列表轮询叠加时单会话并发 ≤ 2（架构 §8.1）；10s 列表重拉仅替换数据不重置滚动
- **E2E 不适用说明**: 不适用（用户可观察功能，E2E 必选）

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 详情请求 5xx / 404 | 保留列表 + 详情错误位（重试/关闭） | done（TC-3.6） |
| 轮询连续失败 3 次 | 停止轮询 + "更新暂不可用 + 重试" | done（hook `refetchInterval` 于 `fetchFailureCount >= 3` 停止并保留内容；banner 与 Retry 由组件测试断言；red 用例清单未含该场景的 E2E 用例） |
| selectedId 快速切换 | 取消在途请求与轮询，防串台 | done（query-key 按 selectedId 隔离，旧响应只写回旧缓存；TC-3.7 连续切换覆盖） |
| 旧记录 recipe/variables 回退 | fallback 标记提示（L2） | done（TC-3.9 + 组件测试） |
| 来源图资产缺失/加载失败 | 占位说明，不显示裂图（L1） | done（TC-3.9 缺失 + 组件测试加载失败降级） |
| 上一条/下一条跨页边界 | 自动加载较早一页后继续 | done（页面 effect：`isAdvanceAfterLoadPending` 触发 `loadEarlier` 后自动前进；red 用例清单未含该场景的 E2E 用例） |
| processing 完成时用户在列表 | 10s 低频重拉后状态面替换为真实结果 | done（`use-iteration-list` 仅含 processing 时 10s `refetchInterval`，条目数据替换不重置滚动；red 用例清单未含该场景的 E2E 用例） |
