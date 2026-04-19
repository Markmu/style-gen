---
feat_id: "FEAT-04"
title: "模板库与清理"
dimension: mixed
phase: 3
status: done
depends_on: ["FEAT-01", "FEAT-02"]
---

# FEAT-04: 模板库与清理（后端 + 前端）

## 功能概要

- **目标**: （1）后端：扩展现有模板 API 支持 search 参数；（2）前端：新建模板库独立页面（搜索 + 卡片网格 + Use Template 跳转），完善 workspace page 的 templateId query 参数加载逻辑，清理废弃组件（template-drawer 等）和死代码
- **依赖**: FEAT-01（Layout 就绪，Library 导航可跳转）、FEAT-02（workspace page 历史集成已完成，避免 page.tsx 改动冲突）
- **涉及架构模块**: Template Search API (service), TemplateLibraryPage (ui)
- **前置条件**: FEAT-01 的 workspace/layout.tsx 已生效；数据库 templates 表有测试数据
- **不在范围**: 模板卡片预览图自动生成、全文搜索/标签过滤/排序、模板分享功能、Landing Page 改造

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/templates/route.ts` | GET handler 扩展：新增 search 参数 + ILIKE 过滤 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/workspace/templates/page.tsx` | 模板库独立页面 |
| create | `src/components/workspace/template-card.tsx` | 模板卡片组件 |
| create | `src/hooks/use-template-search.ts` | 模板搜索 hook（debounce + React Query） |
| modify | `src/app/workspace/page.tsx` | 完善 templateId query 参数检测和加载逻辑 |
| delete | `src/components/workspace/template-drawer.tsx` | 废弃：模板抽屉（已被模板库页面替代） |
| 清理引用 | 多个文件 | 移除 template-drawer 的 import 和使用；确认 recipe-step 无引用后删除 |

## 实现规格

### 后端部分

#### 1. GET /api/templates 扩展

在现有 GET handler（143-211 行）中增加 `search` 参数处理。

**新增请求参数**（query）：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| search | string | 否 | "" (空字符串 = 不过滤) | 模板名称模糊搜索关键词 |

**实现要点**：
1. 从 `request.nextUrl.searchParams.get('search')` 获取参数
2. 参数校验：
   - 类型：必须是 string
   - 长度限制：≤ 100 字符，超出则返回 400 错误
   - 安全：trim 后若为空字符串等同于不传 search（返回全量结果）
3. 当 search 非空时，在现有 WHERE 条件中追加 AND 子句：
   ```sql
   AND name ILIKE '%' || $search || '%'
   ```
   使用 Drizzle ORM 的 `ilike()` 方法
4. 与现有 cursor 分页完全兼容（search 和 cursor/limit 可组合使用）
5. 不改变现有响应体结构（`{ items, hasMore, nextCursor }`）

**安全要求**：复用现有 auth middleware；search 参数长度限制 ≤ 100 字符（防 ReDoS）；parameterized query 防 SQL 注入。

**可观测性（架构 §8.5）**：当 search 参数非空时，记录搜索词和返回条数（用于后续评估搜索质量）。使用项目现有日志工具输出 `{ search: keyword, itemCount: N, userId }`。

### 前端部分

#### 2. 模板搜索 Hook（`src/hooks/use-template-search.ts`）

```typescript
interface UseTemplateSearchReturn {
  templates: Template[] | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  search: string
  setSearch: (keyword: string) => void
  isSearching: boolean  // debounce 期间为 true
}
```

**实现要点**：
- 使用 `useState` 管理 search keyword
- 使用自定义 debounce hook（300ms）或 `useDeferredValue`
- 使用 React Query `useQuery` 请求 `GET /api/templates?search=${debouncedValue}&limit=20`
- queryKey: `['templates', { search }]`（search 变化时自动重新请求）
- 初始 search 为空字符串（加载最近模板）
- 暴露 `setSearch` 给搜索框组件

#### 3. 模板卡片组件（`src/components/workspace/template-card.tsx`）

```typescript
interface TemplateCardProps {
  template: Template
  onUse: (id: string) => void
  onEdit?: (id: string) => void
  onDuplicate?: (id: string) => void
  onDelete?: (id: string) => void
}
```

**视觉结构**：
```
┌─────────────────────────┐
│                    ⋮   │  ← 右上角 overflow menu (3 dots)
│  ┌───────────────────┐  │
│  │                   │  │  ← 预览图（或占位图）
│  │   预览图 / 占位图  │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  模板名称               │  ← 名称（最多 2 行截断）
│  tag1  tag2  tag3       │  ← 标签 chips
│                         │
│  ┌───────────────────┐  │  ← hover 时出现
│  │    Use Template   │  │  ← 主按钮
│  └───────────────────┘  │
└─────────────────────────┘
```

**实现要点**：
- 卡片固定宽高比（约 3:4），CSS Grid 自适应列数（每行 3-4 张）
- 预览图：使用模板的 previewImageUrl 或占位图（灰色背景 + 模板图标）
- Hover 态：半透明深色覆盖层 + "Use Template" 按钮（`group-hover`）
- 右上角 overflow menu（3 点图标）：Edit / Duplicate / Delete
- 标签 chips：从模板的 variables 数量提取（或使用空数组）

#### 4. 模板库页面（`src/app/workspace/templates/page.tsx`）

新建客户端组件页面。

**页面结构**：
```
┌──────────────────────────────────────────────┐
│  📚 Template Library                        │  ← 页面标题
│                                              │
│  ┌────────────────────────────────────┐      │
│  🔍 Search templates...               │      │  ← 搜索框（全宽）
│  └────────────────────────────────────┘      │
│                                              │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │ Card │  │ Card │  │ Card │  │ Card │    │  ← 卡片网格
│  │      │  │      │  │      │  │      │    │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│  ┌──────┐  ┌──────┐                       │
│  │ Card │  │ Card │                       │
│  └──────┘  └──────┘                       │
└──────────────────────────────────────────────┘
```

**实现要点**：
- 使用 `useTemplateSearch()` hook 获取数据和搜索能力
- 顶部搜索框：全宽输入框，placeholder "Search templates..."
- 卡片网格：`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`，gap-4
- 加载中：skeleton 卡片占位
- 空态（无模板 + 未搜索）："还没有模板，去创作一个吧！"
- 空态（搜索无结果）："没有找到匹配的模板" + 清除搜索按钮
- 加载错误：错误提示 + 重试按钮
- Use Template → `router.push('/workspace?templateId=' + id)`
- 页面通过 workspace/layout.tsx 自动获得 LeftSidebar，Library 导航项高亮

#### 5. Workspace Page 模板加载完善（修改 `workspace/page.tsx`）

在 FEAT-02 改造的基础上，添加 templateId 处理逻辑：

```typescript
const searchParams = useSearchParams()
const templateId = searchParams.get('templateId')

useEffect(() => {
  if (!templateId) return

  async function loadTemplate() {
    try {
      const res = await fetch(`/api/templates/${templateId}`)
      if (!res.ok) throw new Error('Template not found')
      const template = await res.json()

      const variables = extractVariables(template.content)
      if (variables.length > 0) {
        setPendingTemplate(template)
        setShowTemplateWizard(true)
      } else {
        setPrompt(template.content)
      }
    } catch (err) {
      toast.error('加载模板失败')
    } finally {
      router.replace('/workspace')
    }
  }

  loadTemplate()
}, [templateId])
```

**实现要点**：
- 使用 `useSearchParams()` 读取 query 参数
- 调用 `GET /api/templates/:id` 获取模板内容
- 使用已有的 `extractVariables()` 函数（`@/lib/template-parser`）检测变量
- 含变量时复用现有 `TemplateWizard` 组件
- 加载完成后 `router.replace('/workspace')` 清除 query
- 模板加载不影响当前工作区的参考图和 Recipe（仅更新 Prompt）

#### 6. 废弃组件清理

**删除文件**：
- `src/components/workspace/template-drawer.tsx` — 模板抽屉（已被模板库页面替代）

**清理引用**：
- `src/app/workspace/page.tsx` — 移除 import 和 `<TemplateDrawer />`
- 其他可能引用了 template-drawer 的文件（全局搜索确认）

**其他潜在废弃项**（经确认无引用后删除）：
- `src/components/workspace/recipe-step.tsx` — 如已被 FEAT-03 的 RecipeEditor 完全替代且无其他引用

**清理验证**：`pnpm build` 成功（无 orphan import 错误）

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 扩展 GET /api/templates search 参数 | backend | done | 参数解析 + 校验 + ILIKE 过滤 + 兼容分页 |
| 2 | 创建 `use-template-search.ts` hook | frontend | done | debounce + React Query 搜索 |
| 3 | 创建 `template-card.tsx` 组件 | frontend | done | 卡片 + hover + overflow menu |
| 4 | 创建 `templates/page.tsx` 页面 | frontend | done | 搜索框 + 卡片网格 + 空态/错误态 |
| 5 | 完善 workspace page templateId 处理 | frontend | done | 检测 query → 加载模板 → Wizard 或直填 → 清除 query |
| 6 | 删除 template-drawer.tsx + 清理引用 | frontend | done | 移除文件 + 全局搜索清除引用 |
| 7 | 清理其他废弃组件 | frontend | waived | recipe-step.tsx 仍被 decision-panel.tsx 引用，保留不删 |
| 8 | 功能验证 | frontend | done | Library → 搜索 → Use Template → 跳转 → 加载 |
| 9 | Build 验证 | — | done | pnpm build 无错误，无 orphan import |

## 验收标准

### 后端验收

- [ ] `GET /api/templates?search=xxx` 返回名称包含 xxx 的模板列表（不区分大小写）
- [ ] `GET /api/templates`（不带 search）行为与改造前完全一致
- [ ] search 参数超过 100 字符返回 400 错误
- [ ] search 与 cursor/limit 参数可组合使用

### 前端验收

- [ ] 访问 `/workspace/templates` 显示模板库页面，LeftSidebar Library 项高亮
- [ ] 搜索框输入关键词后 300ms 内发起搜索，结果实时更新
- [ ] 模板卡片正确渲染名称、标签、预览图（或占位图）
- [ ] 卡片 hover 显示 "Use Template" 按钮，点击跳转至 `/workspace?templateId=xxx`
- [ ] 卡片 overflow menu 提供 Edit/Duplicate/Delete 操作
- [ ] Workspace 页面检测到 templateId 后正确加载模板内容到 Prompt 编辑器
- [ ] 含变量的模板打开 TemplateWizard 完成变量填充
- [ ] 加载完成后 URL query 被清除
- [ ] template-drawer.tsx 及其所有引用已清除
- [ ] `pnpm build` 无编译错误和无警告

### 全流程验收（US 覆盖矩阵）

> 架构文档 §2.3 定义的成功标准：US-01 ~ US-07 全部可正常走通。本期作为最终集成功能，负责验证全量 US 走通。

| US 编号 | 用户故事简述 | 承接功能 | 验证方式 |
|---|---|---|---|
| US-01 | 工作台有固定导航侧栏，工作台/模板库切换 | FEAT-01 + FEAT-04（本功能） | LeftSidebar 导航 + 模板库页面渲染 |
| US-02 | 分析完成后布局平滑过渡而非跳变 | FEAT-02 | 过渡动画验证 |
| US-03 | 风格拆解以 4 行可编辑摘要呈现 | FEAT-03 | RecipeEditor 编辑交互验证 |
| **US-04** | **每次生成结果自动出现在右侧历史面板** | **FEAT-02** | HistoryPanel 自动刷新验证 |
| **US-05** | **点击历史项恢复完整状态（Recipe+Prompt+结果图）** | **FEAT-02** | history_restored 全流程验证 |
| **US-06** | **模板库独立页面，支持搜索和卡片浏览** | **FEAT-04（本功能）** | **本功能全流程验收** |
| **US-07** | **Use Template 后跳转回工作台并加载模板内容** | **FEAT-04（本功能）** | **本功能全流程验收** |

- [ ] Left Sidebar → Library → 浏览模板 → 搜索 → Use Template → 工作台加载模板 → 可继续创作
- [ ] US-01 ~ US-07 全部可在三段式布局下正常走通（最终集成回归）

### 性能验收（架构 §8.1 目标）

- [ ] `GET /api/templates?search=xxx` 搜索响应时间 ≤ 500ms（DevTools Network 面板人工确认）

## 验证命令

```bash
# 后端 + 前端
pnpm type-check
pnpm lint
pnpm build
```

## 预期结果

功能完成后，用户通过 LeftSidebar 的 Library 导航进入 `/workspace/templates` 页面，看到独立的模板库页面：顶部搜索框支持关键词模糊搜索（debounce 300ms），下方以响应式卡片网格展示模板（每行 3-4 张），卡片显示预览图（或占位图）、名称和标签。Hover 卡片时浮现"Use Template"按钮，点击后跳转至 `/workspace?templateId=xxx`，workspace 页面自动检测 query 参数、调用 API 加载模板内容：无变量模板直接填入 Prompt 编辑器，含变量模板弹出 TemplateWizard 引导填充，加载完成后清除 URL query。废弃的 template-drawer 组件及其所有引用已彻底移除，recipe-step 在确认无残留引用后删除。`pnpm build` 编译无错误无警告。

## 交接上下文

- **架构章节**: §4.2 TemplateLibraryPage 模块职责, §5 ADR-11, §6.3 模板使用跳转, §9 Phase C
- **相关代码**:
  - `src/app/api/templates/route.ts`（现有 GET handler，211 行，扩展 search）
  - `src/app/workspace/templates/page.tsx`（新建页面）
  - `src/app/workspace/page.tsx`（templateId 处理）
  - `src/components/workspace/template-drawer.tsx`（待删除）
  - `src/components/workspace/template-wizard.tsx`（复用的变量填充组件）
  - `src/lib/template-parser.ts`（extractVariables 函数）
  - `src/components/workspace/recipe-step.tsx`（可能废弃）
- **契约 / 数据对象**: `Template` 类型（现有，不变）
- **API 契约**:
```typescript
// GET /api/templates?search=xxx&limit=xx（扩展后）
// 新增可选 query 参数: search (≤100 chars)
// 响应不变: { items: Template[], hasMore: boolean, nextCursor: string | null }

// 复用现有 CRUD
// GET /api/templates/:id → Template 详情
// POST /api/templates/:id/duplicate → 复制
// DELETE /api/templates/:id → 删除
```

## 执行指引

- **工具链**: Next.js App Router, React 19, React Query, Tailwind CSS 4, Drizzle ORM, TypeScript
- **执行顺序**: Task 1（后端）→ Task 2 → 3 → 4（可并行 5）→ 6 → 7 → 8 → 9
- **阻塞处理**: 如 TemplateWizard 的复用接口不清晰，需先阅读源码确认集成方式
- **完成信号**: 浏览器全流程验证通过 + pnpm build 成功 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 templateId query 参数读取时机、router.replace 是否触发不必要的 re-render、废弃组件清理是否有遗漏引用
- **允许修改的额外文件**: `src/components/workspace/template-wizard.tsx`（如需调整 props 接口）、`src/lib/template-parser.ts`（如需扩展）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- template-drawer 可能在非 workspace page 的地方也被引用，需全局搜索确认
- recipe-step.tsx 的删除需谨慎——确认 FEAT-03 的 RecipeEditor 已完全替代且无其他消费者
- Use Template 跳转使用 router.push 会在浏览器历史中留下记录（预期行为）
- 模板加载使用 client-side fetch（因需根据用户交互触发）
- 本功能是最后一个开发功能，之后可直接做全局回归验证

## 边界场景检查

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| search 为空字符串 | 等同于不过滤，返回全量结果 | todo |
| search 只有空白字符 | trim 后为空，返回全量结果 | todo |
| search 超过 100 字符 | 返回 400 Bad Request | todo |
| search 包含 SQL 特殊字符 | Parameterized query 自动安全处理 | todo |
| search 包含中文 | PostgreSQL ILIKE 支持 UTF-8 | todo |
| 无匹配结果 | 返回 `{ items: [], hasMore: false, nextCursor: null }` | todo |
| search + cursor 组合 | 先过滤再分页 | todo |

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 模板库为空 | 显示引导空态 + "去创作"按钮 | todo |
| 搜索无匹配结果 | 显示"未找到匹配模板" + 清除搜索按钮 | todo |
| 搜索 API 失败 | 搜索框下方提示"搜索失败"，保留上次结果 | todo |
| templateId 指向不存在的模板 | Toast "模板不存在"，清除 query | todo |
| 模板含大量变量 | TemplateWizard 正常处理 | todo |
| 用户在模板加载中离开页面 | fetch abort，无副作用 | todo |
| 快速连续点击 Use Template | 最后一次 navigation 生效 | todo |
| 删除模板确认 | 弹出确认 dialog | todo |
| 网络断开时搜索 | 显示离线提示，不 crash | todo |
