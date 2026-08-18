---
feat_id: "plan-02"
title: "Iteration Memory 列表页"
dimension: frontend
phase: 2
status: done
depends_on: ["plan-01"]
---

# plan-02: Iteration Memory 列表页

## 功能概要

- **目标**: 交付 `/workspace/iterations` 完整列表页——三态条目（真实结果预览 / 进行中 / 失败状态面）、提示关键词 + 状态筛选、继续加载较早记录、五种状态面（空态/加载/搜索无匹配/未登录/列表服务不可用），以及导航往返后不丢失的列表视图状态。
- **完成后可观察结果**: 用户直接访问 `/workspace/iterations` 时默认看到最近的全状态生成尝试，完成记录显示真实图片预览，进行中和失败显示明确状态面而非占位假图。输入关键词或切换筛选后列表即时收窄，无匹配时保留条件并给出清除/切换行动；点击"继续浏览较早记录"能加载更早一页。离开页面再回来（或从工作台往返），搜索词、筛选、浏览位置保持不变。未登录时看到登录引导，登录后回到原入口；列表加载失败时说明工作台不受影响并可重试。
- **依赖**: plan-01（列表接口的 `q`/`status` 参数与增补条目 shape）
- **关联验收标准**: [AC-01, AC-02, AC-07]
- **涉及架构模块**: Iteration Memory 页面与组件、恢复与视图状态（视图 store 部分）
- **前置条件**: plan-01 已合入并通过其验证命令
- **不在范围**: 详情面板（plan-03，本功能仅预留详情区占位与 `selectedId` 联动）；恢复与保存动作；近期条/导航入口接线（plan-06）

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/workspace/iterations/page.tsx` | 列表页（master-detail 骨架，本功能实现列表侧与详情区占位） |
| create | `src/hooks/use-iteration-memory-view.ts` | 视图状态 store（Context + Provider，挂 workspace layout） |
| create | `src/hooks/use-iteration-list.ts` | 列表数据 hook（q/status/游标加载） |
| create | `src/lib/iterations/view-model.ts` | DTO → 视图模型（状态文案、摘要、缺失标记文案 key） |
| create | `src/components/iterations/iteration-list.tsx` | 列表容器 + "继续浏览较早记录" |
| create | `src/components/iterations/iteration-list-item.tsx` | 三态条目 |
| create | `src/components/iterations/iteration-state-faces.tsx` | 空态/加载骨架/无匹配/未登录/列表错误五种状态面 |
| create | `src/components/iterations/__tests__/iteration-list-item.test.tsx` | 三态渲染组件测试 |
| create | `src/lib/iterations/__tests__/view-model.test.ts` | 视图模型纯函数测试 |
| modify | `src/app/workspace/layout.tsx` | 挂载视图状态 Provider |
| modify | `e2e/helpers/mock-api.ts` | 扩展 generation 列表/详情 mock（三态 shape、q/status 参数、游标） |
| create | `e2e/workspace-iteration-memory-list.spec.ts` | 列表页 E2E（red → green） |

## 实现规格

### 前端部分

#### 1. 视图状态 store（`use-iteration-memory-view.ts`）

- Context 形态（参照 `src/components/landing/use-file-store.tsx` 的既有 Context store 模式），Provider 挂 `src/app/workspace/layout.tsx`，生命周期覆盖 `/workspace/*` 路由切换。
- state：`{ q, status, selectedId, cursorStack, scrollResetToken }`；action：`setFilter`、`setSelected`、`pushCursor`、`resetScroll`。
- URL 同步：页面初始化时 URL `q`/`status` 优先于 store 记忆值；变更后 `router.replace` 写回查询参数（支持直达与回退）。页面级默认 `status=all`（API 默认 `completed` 仅为近期条兼容，架构 §6.1 步骤 2 双口径）。

#### 2. 列表数据 hook（`use-iteration-list.ts`）

- 基于当前 `{ q, status, cursor }` 调用 `GET /api/generation`（`pageSize=20`）；首屏加载与"加载较早"共用，追加条目并更新 `nextCursor`。
- 401 → 抛出未登录态信号（页面切 `UnauthorizedFace`，不清理任何本地状态）；5xx → 错误态（可重试，保留已见条目）。
- 状态机：`idle → loading → ready | empty | no-match | error`（对应架构 §3.3 列表侧；`empty` 与 `no-match` 区分：无任何记录 vs 当前查询无匹配）。

#### 3. 视图模型（`view-model.ts`）

- `IterationListItem` → 列表项视图模型：状态徽标文案、时间格式、设置摘要（`{aspectRatio} · {quality}`）、promptSummary 直展示。
- 缺失/降级文案 key 常量（详情侧复用），文案遵循 PRD 三段式（发生了什么 / 保留了什么 / 下一步），风格对齐 `src/lib/ui/status-copy.ts`。

#### 4. 页面与组件

- `page.tsx`：两栏骨架（列表区 + 详情区占位）；搜索输入（trim、≤100 字符）、状态筛选（全部/进行中/已完成/失败，互斥单选）；`selectedId` 写入 store（点击行为本功能仅高亮，详情面板 plan-03 填充）。
- `iteration-list-item.tsx`：completed → 真实结果图（`resultFileUrl`，加载失败降级为占位 + 说明）；processing / failed → 状态面（文字 + 状态图形，禁止示例图/空白框冒充）；右侧创建时间、状态、设置摘要。
- `iteration-state-faces.tsx`：`EmptyFace`（首次无记录 → 引导开始第一次创作 + 返回工作台）、`LoadingSkeleton`、`NoMatchFace`（保留搜索词与筛选 + 清除搜索 / 切换筛选行动）、`UnauthorizedFace`（说明云端记录需要登录、当前工作台仍被保留 + 登录/返回工作台）、`ListErrorFace`（说明当前工作台不受影响 + 重试 / 返回工作台）。
- 布局与视觉遵循 `docs/design/DESIGN.md`（The Precision Frame）。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | E2E red | frontend | done | 证据：`docs/e2e/evidence/plan-02-e2e-red-2026-08-17.md`（9 用例预期失败，测试有效） |
| 2 | 视图状态 store + layout Provider | frontend | done | `src/hooks/use-iteration-memory-view.tsx`（Context store：q/status/selectedId/cursorStack/scrollResetToken + 滚动位置 ref），Provider 挂 `src/app/workspace/layout.tsx`；URL 同步：页面挂载时 URL 优先（一次性同步），控件变更 `router.replace` 写回，默认 `status=all` |
| 3 | 视图模型 + 纯函数测试 | frontend | done | `src/lib/iterations/view-model.ts` + `__tests__/view-model.test.ts`（11 用例：状态文案、设置摘要、UTC 时间格式、三态模型映射、降级三段式文案 key） |
| 4 | 列表数据 hook | frontend | done | `src/hooks/use-iteration-list.ts`：keyset 游标分页（pageSize=20，id 去重）、401/5xx 分支信号、`empty`/`no-match` 区分、加载较早失败保留已见条目 |
| 5 | 页面骨架与筛选控件 | frontend | done | `/workspace/iterations` master-detail 骨架（列表 + 详情占位）、搜索（trim、maxLength 100）+ All/Processing/Completed/Failed 互斥单选；控件仅在挂载后渲染（防 hydration 前交互丢失） |
| 6 | 列表与三态条目组件 | frontend | done | `iteration-list.tsx`（滚动容器 + 滚动位置保存/恢复 + "Load earlier…"）、`iteration-list-item.tsx`（completed 真实预览/图片 404 降级占位、processing/failed 状态面无图） |
| 7 | 五种状态面组件 | frontend | done | `iteration-state-faces.tsx`：Empty/Loading/NoMatch/Unauthorized/ListError，三段式文案复用 StatePresenter |
| 8 | 组件测试 | frontend | done | `iteration-list-item.test.tsx`（7 用例：三态渲染、图片降级、选中态）+ NoMatchFace 文案与行动断言，合计 18 用例全绿 |
| 9 | 实现至 E2E green | frontend | done | `pnpm e2e -- e2e/workspace-iteration-memory-list.spec.ts --project=workspace` 9/9 通过（冷启动 dev server 复跑通过）；`pnpm verify:fast` 通过；green 证据文档由 test-e2e 步骤写入 |

## 验收标准

### 功能验收

- [x] AC-01 直达 `/workspace/iterations` 默认展示全状态记录、按最近创建排序；completed 显示真实结果预览，processing/failed 显示状态面（无占位假图）（TC-2.1 绿）
- [x] AC-02 关键词 + 状态筛选可组合生效；"继续浏览较早记录"按游标加载且无重复；返回/往返后搜索词、筛选与浏览位置保持（TC-2.2/2.3/2.4 绿）
- [x] AC-02 搜索无匹配时保留条件，提供"清除搜索 / 切换筛选"行动（TC-2.5 绿）
- [x] AC-07 首次进入无记录 → 空态引导；未登录 → 登录引导且本地工作台状态不被清空；列表 5xx → 说明工作台不受影响并可重试（TC-2.6/2.7/2.8 绿）
- [x] 列表项图片加载失败降级为占位说明，不影响条目其余信息（TC-2.9 绿 + 组件测试）
- [x] `pnpm verify:fast` 通过

### 降级回归验收（架构 §8.2）

- [x] 降级提示（列表服务不可用 L4、未登录引导）在页面结构中正确显示，不被加载骨架或列表组件遮挡（内容按 `unauthorized/error/empty/no-match/skeleton/list` 互斥渲染，TC-2.6/2.7 断言面可见且无列表条目）

### E2E 验收（red → green）

- [x] `pnpm e2e -- e2e/workspace-iteration-memory-list.spec.ts --project=workspace`：三态列表渲染、搜索/筛选组合、加载较早、导航往返保位、无匹配行动、未登录面、列表 5xx 面；实现前先留存 red 证据（red：`docs/e2e/evidence/plan-02-e2e-red-2026-08-17.md`；green：9/9 通过，green 证据文档待 test-e2e 步骤写入）

## 验证命令

```bash
pnpm e2e -- e2e/workspace-iteration-memory-list.spec.ts --project=workspace
pnpm vitest --run src/components/iterations/__tests__/iteration-list-item.test.tsx src/lib/iterations/__tests__/view-model.test.ts
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §3.3（列表状态机）、§6.1（进入与检索链路）、§7.2（IterationListItem）、ADR-6（视图状态保活）
- **相关代码**: `src/hooks/use-history-list.ts`（既有列表 hook 参照）、`src/components/landing/use-file-store.tsx`（Context store 参照）、`src/lib/ui/status-copy.ts`
- **契约 / 数据对象**: `IterationListItem`（plan-01 交付）；视图 store 的 `{ q, status, selectedId, cursorStack }`
- **下游消费方**: plan-03（selectedId/游标栈驱动详情与上一条/下一条）、plan-06（入口链接带 `status=all`）

## 风险与边界

- **执行顺序**: Task 1（red E2E）必须最先完成并留存失败证据（对应 `ready-to-dev → in-progress` 前置），再按 Task 2-8 顺序实现，Task 9 收口转 green
- **验证失败排查方向**: E2E 失败先看 `e2e/helpers/mock-api.ts` 的 mock shape 是否与 plan-01 DTO 一致；保位失败检查 Provider 是否挂到 layout 而非页面
- **允许修改的额外文件**: 无（spec 与 mock helper 均在本功能文件清单内，修改见下）
- **暂停条件**: 发现 plan-01 接口 shape 与本功能消费不匹配（需回改 plan-01 契约）、或需要引入全局状态库时
- **风险备注**: URL 同步使用 `router.replace` 避免污染历史栈；筛选切换期间的竞态以最后一次请求为准（丢弃过期响应）
- **E2E 不适用说明**: 不适用（用户可观察功能，E2E 必选）

### 实现期发现与修正记录（2026-08-17）

1. **spec 同步缺陷修正（TC-2.4）**：原断言 `expect(app-shell).toBeVisible()` 用作"已到达 /workspace"的等待，但 `app-shell` 是根布局元素、在所有路由可见，断言立即通过；随后 `goBack()` 在 next/link SPA 导航提交（dev 冷编译约 0.4s，Next 在导航提交时才 push history entry）之前执行，落到标签页初始 `about:blank` 历史条目，得到与功能无关的空白页。修正为 `expect(page).toHaveURL(/\/workspace$/)` 等待真实到达——不放宽任何行为断言，往返保位断言全部保持原样。
2. **mock 保真度修正（TC-2.6）**：`mockLoggedOutSession` 原返回 `{}`，会使 `useSession()` 得到真值对象且无 `user`，令既有 `LeftSidebar`（`session?.user.name`）崩溃；真实 Auth.js 无 session token 时 session 端点返回 `null` 体。改为 `JSON.stringify(null)` 对齐真实端点行为。
3. **实现侧防丢失**：筛选控件仅在客户端挂载后渲染（SSR HTML 中的控件会在 hydration 前接受输入、随后被 hydration 以服务端状态复位，交互丢失）；列表滚动位置在 `useLayoutEffect` cleanup 中保存（`useEffect` cleanup 时元素已脱离文档、scrollTop 归零）。
4. **文件名后缀**：视图状态 store 落地为 `src/hooks/use-iteration-memory-view.tsx`（计划写作 `.ts`）；store 含 Provider JSX（对齐既有 `src/components/landing/use-file-store.tsx` 的 Context store 模式），需 `.tsx` 后缀，内容与计划规格一致。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 无任何记录（首次使用） | EmptyFace + 引导首次创作 | done |
| 搜索/筛选后无匹配 | NoMatchFace，保留条件 + 行动 | done |
| 列表请求 5xx | ListErrorFace，保留已见条目 + 重试 | done |
| 未登录（401） | UnauthorizedFace，不清本地工作台状态 | done |
| 结果图片 URL 失效（404） | 条目图片位占位 + 说明（L1 降级） | done |
| 快速连续切换筛选 | 丢弃过期响应，以最后一次为准 | done（query key 按 q/status 隔离，React Query 天然丢弃过期响应） |
| 加载较早失败 | 该页加载动作失败提示，已加载条目不动 | done（`isLoadEarlierError` 内联提示，条目保留） |
