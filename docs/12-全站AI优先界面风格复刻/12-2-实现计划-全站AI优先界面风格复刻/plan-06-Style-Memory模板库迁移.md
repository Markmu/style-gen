---
feat_id: "plan-06"
title: "Style Memory 模板库迁移"
dimension: frontend
phase: 3
status: done
depends_on: ["plan-02"]
---

# plan-06: Style Memory 模板库迁移

## 功能概要

- **目标**: 将 `/workspace/templates` 的用户可见体验从 Template Library 迁移为 Style Memory，复用现有模板 API、搜索、使用、复制和删除能力，强化来源图、变量数量、派生风格标签、复用意图、空态和受限状态。
- **完成后可观察结果**: 用户进入 `/workspace/templates` 时看到的是 Style Memory，而不是旧式模板文件列表。每张卡片优先展示来源图，缺失来源图时给出低噪音“无来源预览”状态；卡片展示变量数量、派生 style tags 或 reuse intent，并保留 Use、Duplicate、Delete 操作。搜索无结果、空库、API 失败和未登录会显示不同状态和下一步行动，用户可以清除搜索、返回工作台、登录或从参考图开始创建记忆。代码和 API 仍然使用 template 命名，避免误改后端 contract。
- **依赖**: plan-02（AppShell 与 AI 状态头）
- **关联验收标准**: [AC-06, AC-07, AC-08, AC-09]
- **涉及架构模块**: StyleMemoryExperience、StatePresenter/StatusLanguage、AppShell
- **前置条件**: plan-01 状态组件可用；plan-02 shell/nav 已显示 Style Memory；现有 `/api/templates`、`useTemplateSearch`、`TemplateCard` 可用。
- **不在范围**: 新增 `style_memories` 表、`/api/style-memory` 端点、后端 style tags/reuse intent 字段、模板编辑器重做、分页加载完整体验。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/templates/page.tsx` | 页面标题、搜索、列表、状态表达迁移为 Style Memory |
| modify | `src/components/workspace/template-card.tsx` | 卡片展示 source image、variables、派生 tags/reuse intent、Use/Duplicate/Delete |
| modify | `src/hooks/use-template-search.ts` | 保持 TemplateListItem contract，暴露 auth/API/search 状态供 UI 区分 |
| create | `src/lib/style-memory-view-model.ts` | 从 TemplateListItem 派生 StyleMemoryCardViewModel |
| create | `src/lib/__tests__/style-memory-view-model.test.ts` | 覆盖 tags/reuse intent、source image 缺失、变量数量 |
| modify | `src/components/workspace/__tests__/template-card.test.tsx` | 覆盖 Style Memory 卡片视觉与操作 |
| create | `src/app/workspace/templates/__tests__/page.test.tsx` | 覆盖 empty/noResults/auth/failed/populated 页面状态 |
| create | `e2e/ai-first-style-memory.spec.ts` | Style Memory targeted E2E |

## 实现规格

### 前端部分

#### 1. StyleMemoryCardViewModel 派生

创建 `src/lib/style-memory-view-model.ts`：

- 输入：`TemplateListItem`
- 输出符合架构 §7.2 的 `StyleMemoryCardViewModel` 子集：`id`、`name`、`sourceImageUrl`、`variableCount`、`styleTags`、`reuseIntent`、`createdAt`、`actions`。
- 首版 tags/reuse intent 从 `name`、`variableCount`、`sourceImageUrl` 和可用 list 字段派生；不为了 content/tags 新增列表 API 字段。
- 若 `sourceImageUrl` 缺失，`reuseIntent` 明确提示“无来源预览，可从 prompt 复用”。

#### 2. 页面迁移

`src/app/workspace/templates/page.tsx`：

- 页面主标题改为 `Style Memory`，副文案解释“保存过的风格方向和 prompt structure”。
- 搜索输入占位文案使用 Style Memory 语义。
- `isLoading` 使用 skeleton；`isError` 根据错误区分 authRequired/failedRecoverable；空列表为 empty；搜索无结果为 noResults。
- 使用 `StatePresenter` 展示 empty、noResults、authRequired、failedRecoverable，并提供 Clear Search、Back to Workspace、Login、Create from Reference 等行动。
- Use 仍跳转 `/workspace?templateId=id`；Duplicate/Delete 仍调用现有模板 API 并 invalidate `templates` query。

#### 3. TemplateCard 迁移

`src/components/workspace/template-card.tsx`：

- UI 标题/按钮从 Template 迁移为 Style Memory 语义：例如 `Use memory` 或 `Use style`。
- 来源图优先；缺失时展示低噪音占位和“No source preview”说明。
- 展示 variable count、styleTags/reuseIntent；不要把卡片做成旧文件列表。
- 操作菜单保留 Duplicate/Delete；若 Edit 仍只是临时 console 记录，应避免作为主要行动干扰验收。
- 继续使用 `TemplateListItem`，不得要求 API 改名。

#### 4. useTemplateSearch 状态

`src/hooks/use-template-search.ts`：

- 请求仍为 `/api/templates?search=&limit=20`。
- 保留 `TemplateListItem` 字段：id、name、variableCount、sourceAssetId、sourceImageUrl、createdAt。
- 对 401 可抛出带 `code` 或 status 的 Error，页面据此映射 authRequired。
- 不新增轮询，不改变 pagination contract。

#### 5. E2E red/green

`e2e/ai-first-style-memory.spec.ts` 覆盖：

- populated list 展示 Style Memory 标题、来源图、变量数、tags/reuse intent。
- Use 跳转 `/workspace?templateId=id` 并注入 prompt。
- Duplicate/Delete 调用现有 API 并刷新列表。
- 空库、搜索无结果、API 失败、401 未登录各有不同 StatePresenter 和行动。
- 页面不出现旧主标题 `Template Library`。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `ai-first-style-memory.spec.ts` red 用例和证据 | frontend | done | red 证据已存在：`docs/e2e/evidence/plan-06-e2e-red-20260706.md` |
| 2 | 实现 StyleMemoryCardViewModel 派生 helper 和测试 | frontend | done | 不新增后端字段 |
| 3 | 改造 templates page 标题、搜索、状态和行动 | frontend | done | StatePresenter 区分 empty/noResults/auth/failed |
| 4 | 改造 TemplateCard 为 Style Memory 卡片 | frontend | done | source image、variables、tags/reuse intent、操作 |
| 5 | 调整 useTemplateSearch 错误状态暴露 | frontend | done | 保持 `/api/templates` contract |
| 6 | 更新卡片和页面测试 | frontend | done | 覆盖 populated/empty/noResults/auth/API error |
| 7 | 运行 red/green E2E、单元测试、类型检查和构建 | frontend | done | 本 implement 已跑通 green；证据文件由后续 `test-e2e` 步骤归档 |

## 验收标准

### Style Memory 验收

- [x] AC-06 `/workspace/templates` 用户可见标题和主文案为 Style Memory，主页面不再展示旧 `Template Library`。
- [x] AC-06 每张记忆卡片优先展示 `sourceImageUrl`，缺失时有“无来源预览”状态。
- [x] AC-06 卡片展示变量数量、派生 style tags 或 reuse intent，并保留 Use/Duplicate/Delete 操作。
- [x] AC-06 Use 操作仍导航到 `/workspace?templateId=id`，Workspace 使用现有模板详情 API 注入 prompt/variables。
- [x] AC-07 Style Memory 页面使用 plan-01/02 共享 shell、token、状态语言和 nav active。
- [x] AC-08 401、API 失败、空库、搜索无结果分别映射 authRequired、failedRecoverable、empty、noResults，不清空 Workspace context。
- [x] AC-09 空库状态提供从工作台保存或从参考图开始的入口。
- [x] E2E-TDD：`e2e/ai-first-style-memory.spec.ts` 先 red 后 green；red 证据为 `docs/e2e/evidence/plan-06-e2e-red-20260706.md`，green 证据文件由后续 `test-e2e` 步骤归档。

### 性能验收（架构 §8.1 目标）

- [x] AC-06 默认请求仍为 20 条并保留 cursor/limit 能力；页面不为每张卡片额外请求详情（架构 §8.1）。

### 降级回归验收（架构 §8.2）

- [x] AC-08 L4 未登录、L5 空态/无结果、API failedRecoverable 均在 Style Memory 页面显示明确下一步。

### 安全要求（架构 §8.3）

- [x] AC-06 前端不信任 source image 字段做权限判断；模板 Use/Duplicate/Delete 仍依赖现有 API auth 和校验（架构 §8.3）。

## 验证命令

```bash
pnpm vitest --run src/lib/__tests__/style-memory-view-model.test.ts src/components/workspace/__tests__/template-card.test.tsx src/app/workspace/templates/__tests__/page.test.tsx
pnpm e2e -- e2e/ai-first-style-memory.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-06/AC-07/AC-08/AC-09、§3.2 使用风格记忆/受限未登录、§6.6、§7.3 templates API、§7.6 产品术语映射、§8.1、§8.2、ADR-6。
- **相关代码**: `src/app/workspace/templates/page.tsx`、`src/components/workspace/template-card.tsx`、`src/hooks/use-template-search.ts`、`src/app/api/templates/route.ts`（只读 contract）。
- **契约 / 数据对象**: `TemplateListItem`、`PromptTemplate`、`StyleMemoryCardViewModel`、`ProductStatus`。
- **下游消费方**: plan-07 Landing/Auth 需要链接到 Style Memory；plan-08 targeted E2E 汇总 Style Memory 状态。

## 风险与边界

- **执行顺序**: 先 red E2E，再实现 view-model helper，再改页面和卡片，最后补测试。
- **验证失败排查方向**: 检查 `/api/templates` mock 返回字段、401 错误映射、search deferred value、旧 Template Library 文案残留。
- **允许修改的额外文件**: 无。
- **暂停条件**: 若验收必须持久化 styleTags/reuseIntent、修改 templates 表或新增 `/api/style-memory`，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能为用户可见页面迁移。
- **风险备注**: UI 可显示 Style Memory，但 API/hook/repository 命名必须继续使用 template，避免跨层误改。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| sourceImageUrl 缺失 | 显示低噪音占位和“无来源预览”说明 | done |
| 搜索无结果 | StatePresenter noResults，提供 Clear Search | done |
| 空模板列表 | StatePresenter empty，提供从工作台保存/上传参考图入口 | done |
| API 401 | StatePresenter authRequired，提供 Login/Back to Workspace | done |
| Duplicate/Delete 失败 | failedRecoverable，不移除本地上下文 | done |
