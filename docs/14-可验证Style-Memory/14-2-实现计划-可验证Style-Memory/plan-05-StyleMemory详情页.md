---
feat_id: "plan-05"
title: "Style Memory 详情页"
dimension: frontend
phase: 3
status: done
depends_on: ["plan-02", "plan-03"]
---

# plan-05: Style Memory 详情页

## 功能概要

- **目标**: 新建 `/workspace/templates/[id]` 详情页，按 PRD §3.1 线框交付四分区布局（验证依据 / 保留的风格 / 可替换内容 / 排除约束与增强方向 + 完整提示高级信息 + 使用情况），并承载治理闭环：编辑（含状态回退提示）、选择/替换代表结果、复制、删除。
- **完成后可观察结果**: 打开一条已验证 Memory 详情，先看到参考图与代表结果并排、来源 Iteration 可打开，右侧呈现风格指纹标签、核心保留规则清单、可替换变量默认值与排除约束；完整提示收在高级信息折叠区；底部显示最近使用与派生数量。点"编辑"修改核心保留规则时出现"保存后转为待验证"提示，保存后状态如提示回退；待验证 Memory 可从相关已完成 Iteration 中选择代表结果并转为已验证，替换流程取消一次后原状态不变；复制品以待验证开始；删除确认层说明仍会保留的关联内容，取消回原详情、确认回列表。缺失的分区单独说明而非隐藏。
- **依赖**: plan-02（详情/编辑/治理端点）、plan-03（ModalDialog / DropdownMenu）
- **关联验收标准**: [AC-03, AC-05, AC-07, AC-08, AC-09, AC-10]
- **涉及架构模块**: ④ 详情页模块
- **前置条件**: plan-02/03 完成。
- **不在范围**: "使用这条 Memory" 的预检行为（plan-07 接管，本功能按钮先按现状跳转工作区）；保存流程（plan-06）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/workspace/templates/[id]/page.tsx` | 详情路由（数据加载/状态/动作接线） |
| create | `src/components/style-memory/style-memory-detail-view.tsx` | 四分区 + 高级信息 + 使用情况展示 |
| create | `src/components/style-memory/style-memory-edit-form.tsx` | 编辑表单（5 字段 + 回退提示） |
| create | `src/components/style-memory/representative-result-selector.tsx` | 候选选择器弹层（ModalDialog 内） |
| create | `src/components/style-memory/style-memory-delete-dialog.tsx` | 删除确认（destructive ModalDialog） |
| create | `src/components/style-memory/__tests__/style-memory-detail.test.tsx` | 组件测试（分区/编辑提示/缺失标记） |
| modify | `src/app/workspace/iterations/page.tsx` | 支持 `focus` 查询参数定位迭代条目（来源 Iteration 打开链路） |
| create | `e2e/style-memory-detail.spec.ts` | AC-03/05/07/09 场景（red 先行） |

## 实现规格

### 前端部分

#### 1. 页面路由（`[id]/page.tsx`）

- 路由 `/workspace/templates/[id]`；挂载时 `GET /api/templates/[id]` 加载 `StyleMemoryDetail`
- 404 → "Memory 不存在或已被删除" + 返回列表（恢复原查询）；503 → 错误态可重试，**列表入口保持可用**（AC-10）；加载骨架稳定
- 页面头：`← 返回列表`（保留 query 恢复列表条件）、名称、状态徽标（文字+视觉）、`[编辑]`、`[更多]`（DropdownMenu：编辑 / 复制 / 删除，danger 项）、`[使用这条 Memory]`（本功能按现状跳转 `/workspace?templateId=`，plan-07 接管）
- **确认导航初始焦点**：页面挂载后初始焦点置于页面主标题（plan-03 约定，PRD 键盘旅程第 4 步）

#### 2. 详情视图（`style-memory-detail-view.tsx`）

按 PRD 线框布局，数据全部来自 `StyleMemoryDetail`：

- **验证依据**：参考图（`sourceImageUrl`）与代表结果（`representativeResult.imageUrl`）并排；已验证时代表结果与状态徽标同显；待验证且无代表结果时，此区显示引导："从相关的已完成 Iteration 选择代表结果" + `[选择代表结果]` 按钮；`sourceGenerationTask` 存在时显示"来源 Iteration [打开]"（跳 `/workspace/iterations?focus={id}`；iterations 页新增 `focus` 参数定位支持，参照 templates 页既有 focus 实现模式：`pendingFocusId` + 列表加载后滚动定位与高亮）
- **保留的风格**：风格指纹（`styleTokens` 标签组）、核心保留规则（`retainedRules` 清单，勾选样式呈现为已确认状态）
- **可替换内容**：`variables` 逐项显示名称 + 默认值（空默认值标注"必填"）
- **排除约束与增强方向**：`negativeConstraints` 列表 + `enhancementHints` 标签组
- **完整提示**：`content` 收进高级信息折叠区（复用 `src/components/ui/expandable-panel.tsx`），默认收起
- **使用情况**：`usage.lastUsedAt`（null → "尚未使用"）+ 派生 `{derivedIterationCount} 次`
- **缺失分区标注**（AC-09）：任一分区数据缺失（旧资产：规则空、来源图空、来源迭代空、代表结果空），该分区原位显示"待补充 / 来源缺失"说明，其余分区正常渲染；**不虚构、不用其他数据顶替**

#### 3. 编辑表单（`style-memory-edit-form.tsx`）

- 字段：名称（1–50）、说明（≤500）、变量默认值（逐变量，名称不可改）、核心保留规则（逐条可编辑/增删，≤12）、排除约束（同）
- **回退提示**：输入变化时用 plan-01 的 `ruleSetsChanged`（客户端同口径实现，import `src/lib/style-memory-rules.ts`）与已加载的原值比较；任一集合 changed → 表单内即时显示"保存后状态将变为：待验证"；仅元数据变化 → 显示"保持用户已验证"
- 提交 `PUT /api/templates/[id]`（五字段）；409 显示服务端文案保留表单；成功后回读刷新详情（状态可能已回退）；取消编辑不发请求恢复展示态
- 名称错误时机：中性帮助文案，提交或失焦后才显示错误（PRD 规则 14）

#### 4. 代表结果选择器（`representative-result-selector.tsx`）

- ModalDialog 内实现；挂载时 `GET /api/templates/[id]/representative-candidates` 游标加载（"加载更早"）
- 条目：结果缩略图 + promptSummary + 时间；单选；`[确认]` → `POST representative-result { generationTaskId}` → 成功关闭并刷新详情（`user_verified` + 新代表结果）
- **取消零请求**（AC-05）：关闭/Escape 不发任何请求，原状态与原代表结果不变
- 空候选：说明"暂无相关已完成 Iteration"并解释相关范围

#### 5. 删除确认（`style-memory-delete-dialog.tsx`）

- `destructive` ModalDialog（背景点击不关闭）；文案含 Memory 名称与"仍会保留：来源参考图、来源 Iteration、代表结果和历史生成记录"（PRD 删除线框）
- 取消 → 关闭还原焦点；确认 → `DELETE /api/templates/[id]` → `router.push('/workspace/templates')`（恢复原查询条件）；503 保留弹层可重试

#### 6. 复制（更多菜单项）

`POST /api/templates/[id]/duplicate` → 201 后跳转复制品详情并提示重新命名（banner/文案，名称已带 "(copy)"）；失败保留菜单上下文展示错误。

#### 7. E2E（`e2e/style-memory-detail.spec.ts`，red 先行）

mocked 模式覆盖：AC-03（分区与高级信息）、AC-05（五连动作：改元数据保持 → 改规则回退 → 复制待验证 → 待验证选代表结果转已验证 → 替换先取消再确认）、AC-07（删除取消/确认双分支 + Iteration 仍可访问）、AC-09（旧资产缺失分区）、AC-08（键盘：编辑表单/菜单/两个弹层 Tab 循环、Escape 还原、确认后焦点落点）、AC-10（详情 503 重试且列表可用）。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：style-memory-detail.spec.ts 编写并确认失败 | frontend | done | red 证据：docs/e2e/evidence/plan-05-e2e-red-2026-08-26.md（17/17 预期失败于 404） |
| 2 | 详情路由 + 数据加载/错误态 | frontend | done | react-query 加载 GET 详情；404「不存在或已被删除」+返回列表；503 StatePresenter failedRecoverable 且入口保留；骨架 testid；数据就绪后初始焦点落页面主标题（plan-03 约定） |
| 3 | detail-view 四分区 + 高级信息 + 使用情况 | frontend | done | 缺失分区原位「待补充/来源缺失」标注；高级信息默认收起、原位展开——未复用 expandable-panel 展开态（其 fixed 全屏 overlay 会遮挡页面头，违反 TC-9.1 展开后编辑入口仍可用的契约，属 red spec 优先的偏差） |
| 4 | 编辑表单 + 回退提示 | frontend | done | 五字段 + plan-01 ruleSetsChanged 客户端同口径（回退/保持提示）；名称错误仅提交/失焦显示；成功后失效列表缓存 + 回读 GET 刷新（禁乐观更新） |
| 5 | 代表结果选择器 | frontend | done | 挂载即请求 + 「加载更早」游标 + radio 单选 + 确认 POST；取消/Escape 零请求；空候选解释相关范围 |
| 6 | 删除确认 + 复制 + 更多菜单 | frontend | done | destructive 弹层（背景不关闭、含名称与「仍会保留」清单）；确认 DELETE → 失效列表缓存 → 回列表恢复原查询（sessionStorage 记录，列表页写入）；复制 201 → 跳复制品 + notice=rename 重新命名提示 |
| 7 | 组件测试 | frontend | done | src/components/style-memory/__tests__/style-memory-detail.test.tsx 9/9（分区渲染/回退提示出现与不出现分支/顺序不变不回退/缺失标注/待验证引导/名称错误时机） |
| 8 | iterations 页 focus 参数支持 | frontend | done | pendingFocusId 模式 + 既有 selectedId 选中态联动（详情面板打开 + scrollIntoView），参数一次性消费；plan-05 范围外新增对列表页的最小改动（挂载聚焦主标题 + 写入原查询 sessionStorage），由 TC-7.3/TC-8.4 red 契约驱动 |
| 9 | green：spec 全绿 + verify:fast | frontend | done | style-memory-detail 17/17（3 连跑稳定）；list 14/14、iterations 相关 24/24、templates 相关 15/15 不回归；组件 9/9；type-check/lint/verify:fast 108 文件 979 用例全绿。green evidence 待 test-e2e 留存 |

## 验收标准

### 功能验收

- [x] AC-03 详情清楚区分参考图、代表结果、来源 Iteration、风格指纹、核心保留规则、增强方向、排除约束、可替换变量与使用情况；完整提示仅在高级信息中（e2e 断言默认不可见、展开后可见）（TC-3.1/TC-3.3 全绿；review 复跑 17/17）
- [x] AC-05 五连动作 e2e 通过：仅改名称/变量默认值 → 保持已验证；改核心保留规则 → 表单出现回退提示且保存后状态变待验证；复制 → 复制品待验证且无代表结果；待验证选代表结果 → 转已验证；替换先取消（原状态与代表结果不变）再确认（详情展示新代表结果）（TC-5.1～TC-5.5 全绿）
- [x] AC-07 删除：确认层含"仍会保留"说明；取消后详情/查询不变；确认后回列表且 Memory 不可见不可打开，来源 Iteration 仍可访问（TC-7.1～TC-7.3 全绿）
- [x] AC-08 键盘：仅键盘完成 编辑→保存、菜单→复制/删除、选择器取消/确认、删除取消/确认；焦点在弹层内循环、背景不可达、关闭还原触发位置；确认导航后焦点落页面首要内容（TC-8.1～TC-8.4 keyboard API 全绿）
- [x] AC-09 旧资产详情：状态为待验证；缺失分区原位说明；其余内容可用；仍可进入编辑与复用入口（TC-9.1 全绿）
- [x] AC-10 详情 503：错误态 + 重试成功恢复；期间列表入口可用（TC-10.1 全绿）
- [x] 来源 Iteration 打开链接带 `focus={id}` 且 iterations 页定位高亮对应条目（TC-3.2 全绿：iterations 页 pendingFocusId → selectedId 联动 + 详情面板打开；组件测试断言 href）
- [x] 组件测试：分区渲染、回退提示出现/不出现分支、缺失标注分支通过（9/9；review 复跑 9/9）
- [x] `pnpm verify:fast` 通过（108 文件 / 979 用例；review 复跑通过）

### 性能验收（架构 §8.1）

- [x] 详情接口（含 usage 聚合与代表结果联查）响应 p95 ≤ 300ms；造数方式：复用 plan-04 的 seed SQL 数据（≥ 500 条 Memory，目标 Memory 带 representative 与多条派生 generation_tasks），DevTools Network 记录 20 次请求 p95（green 证据：真实 repository 路径 `findStyleMemoryDetail` 直连本地 PG，520 条 Memory + 40 条派生，预热 1 次后 20 次测量 p95 = 1.7ms ≤ 300ms，seed 已清理 0 残留；API 层 requireAuth 需真实 Google 会话，方法偏差已在 green 证据记录）

### 契约对接验收

- [x] 消费字段与 `StyleMemoryDetail` / `RepresentativeCandidate` 完全一致；无对不存在字段的可选链兜底滥用（缺失即按分区标注处理）（review 逐一核对：详情/选择器/编辑表单消费均为 DTO 真实字段；`label ?? name` 与 `description ?` 为类型内合法可空/可选处理；`sourceGenerationTask ?? sourceGenerationTaskId` 双字段均存在）

## 验证命令

```bash
pnpm e2e -- e2e/style-memory-detail.spec.ts --project=workspace
pnpm vitest --run src/components/style-memory/__tests__/style-memory-detail.test.tsx
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.2（详情链路）、§6.4（编辑回退/选择器/复制/删除）、§4.2-④ 交互链路、§3.3 状态机、§8.2 L2/L4、ADR-1（状态以响应为准）
- **相关代码**: `src/components/ui/expandable-panel.tsx`（高级信息折叠复用）、`src/components/ui/state-presenter.tsx`（错误态复用）、plan-03 两个原语
- **契约 / 数据对象**: `StyleMemoryDetail` / `RepresentativeCandidate` / `UpdateStyleMemoryRequest`；`src/lib/style-memory-rules.ts`（plan-01 交付，前端回退提示同口径）
- **下游消费方**: plan-07（接管详情"使用这条 Memory"为预检入口）
- **列表页联动**: 本功能上线后列表卡片仅"查看详情/使用"（plan-04 已收敛），治理动作全部在本页

## 风险与边界

- **执行顺序**: Task 1 red 先行；Task 3 依赖 2；Task 5/6 依赖 3。
- **验证失败排查方向**: 五连动作 e2e 状态串扰（每场景独立 fixture 与用户数据）；键盘断言失败先确认 plan-03 原语行为本身绿。
- **允许修改的额外文件**: 无。
- **暂停条件**: plan-02 响应字段与展示需求出现缺口（需回 plan-02 补契约）时。
- **E2E 不适用说明**: 不适用本功能（核心用户可观察功能）。
- **风险备注**: 替换代表结果的"取消一次再确认"序列（AC-05）是必测路径，勿在实现中把选择器确认做成乐观更新（必须等服务端响应后回读）。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 待验证 + 无候选 Iteration | 选择器空态解释相关范围，引导从工作区生成 | done |
| 编辑期间数据被并发修改 | 提交以服务端结果为准回读；409 名称冲突保留表单 | done |
| 代表结果图加载失败 | 图片区显示"暂不可用"，状态徽标不受影响 | done |
| variables 中存在空默认值变量 | 显示"必填"标注（与 plan-07 预检口径一致） | done |
| 删除请求 503 | 弹层保留 + 重试，不重复导航 | done |

### 实现备注（red spec 契约驱动的范围记录）

- `src/app/workspace/templates/page.tsx`（列表页）与 `src/lib/style-memory-view-model.ts` 为文件清单外改动：TC-7.3 要求删除确认后回列表恢复原查询（列表页把当前 search/status 写入 sessionStorage，键 `STYLE_MEMORY_LIST_QUERY_STORAGE_KEY`，详情页读取）；TC-8.4 要求确认导航后初始焦点落 `style-memory-page` 容器（列表页挂载聚焦主标题 `tabIndex={-1}`，plan-03 确认导航约定）。
- 高级信息折叠区未使用 `expandable-panel.tsx` 的展开态：其展开为 fixed 全屏 overlay，会遮挡页面头，导致 TC-9.1「展开完整提示后编辑/使用入口仍可操作」失败；改为原位展开（aria-expanded + aria-controls），默认收起契约不变。
- 治理写点（PUT/duplicate/DELETE/representative-result）成功后统一失效 `["templates"]` 列表缓存：全局 QueryClient `staleTime: 60s`（`src/components/providers.tsx`），否则删除/改名后回列表展示过期条目（TC-7.3）。
- 「使用这条 Memory」按现状跳转 `/workspace?templateId=`，采用整页导航（`window.location.assign`）：工作台既有契约会消费参数并 `router.replace("/workspace")`（template.spec.ts 断言），SPA 跳转会使握手地址在可观察前被清除（TC-9.1 断言 URL 含 templateId）；plan-07 接管该入口为预检。
