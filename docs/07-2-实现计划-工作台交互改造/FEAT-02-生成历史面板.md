---
feat_id: "FEAT-02"
title: "生成历史面板"
dimension: mixed
phase: 2
status: done
depends_on: ["FEAT-01", "FEAT-03"]
---

# FEAT-02: 生成历史面板（后端 + 前端）

## 功能概要

- **目标**: （1）后端：新增生成历史列表 API 和详情 API 扩展（recipe join）；（2）前端：HistoryPanel 从骨架升级为真实数据渲染（缩略图列表 + 分页 + 进度动画），实现 useHistoryList / useHistoryRestore hook，扩展 workspace 状态机支持 history_restored，打通「生成→历史出现→点击恢复→修改→再生成」迭代循环
- **依赖**: FEAT-01（三段式布局骨架就绪）、FEAT-03（RecipeEditor 组件就绪）
- **涉及架构模块**: Generation History API (service), HistoryPanel (ui), Workspace State Machine (integration)
- **前置条件**: 数据库连接可用；FEAT-01 的 layout.tsx 和 history-panel.tsx 已创建；FEAT-03 的 recipe-editor.tsx 已创建
- **不在范围**: 历史数据的 CRUD 操作（删除/收藏）、WebSocket 推送、分页方式变更、Recipe 编辑持久化

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/repositories/generation-task-repository.ts` | 新增 `listCompleted()` 和 `findByIdWithRecipe()` 方法 |
| modify | `src/app/api/generation/route.ts` | 新增 GET handler，返回历史列表（cursor 分页） |
| modify | `src/app/api/generation/[id]/route.ts` | 扩展 GET handler 响应体，增加 `recipe` 字段（FK join analysis_tasks） |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/hooks/use-history-list.ts` | 历史列表 hook（React Query infinite query） |
| create | `src/hooks/use-history-restore.ts` | 历史恢复 hook（加载详情 + 分发状态） |
| modify | `src/components/workspace/history-panel.tsx` | 从骨架升级为真实数据渲染（缩略图列表 + 分页 + 点击恢复） |
| modify | `src/app/workspace/page.tsx` | 接入历史恢复回调 + history_restored 状态集成 + 生成完成后刷新历史 + 按钮文案适配 |
| modify | `src/hooks/use-workspace-state.ts` | 扩展状态机，新增 history_restored 状态及转换逻辑 |

## 实现规格

### 后端部分

#### 1. Repository 层新增方法

在 `src/lib/repositories/generation-task-repository.ts` 中新增两个方法：

```typescript
/** 列出用户已完成的生成任务（历史列表） */
async function listCompleted(
  userId: string,
  cursor: string | null,
  pageSize: number = 20
): Promise<{ items: GenerationHistoryItem[]; nextCursor: string | null }>

/** 根据 ID 查询生成任务详情（含关联 Recipe） */
async function findByIdWithRecipe(
  id: string,
  userId: string
): Promise<GenerationTaskDetail | null>
```

**listCompleted 实现要点**：
- 查询 `generation_tasks` JOIN `assets`（通过 `result_asset_id`）
- WHERE 条件：`user_id = :userId AND status = 'completed'`
- ORDER BY `created_at DESC`
- cursor 分页：基于 `created_at` + `id` 组合游标（避免并发插入导致遗漏/重复）
- 返回 `{ id, resultFileUrl, createdAt }` 列表
- 默认 pageSize=20，最大限制 50

**findByIdWithRecipe 实现要点**：
- 查询 `generation_tasks` LEFT JOIN `analysis_tasks`（通过 `analysis_task_id`）
- WHERE：`generation_tasks.id = :id AND generation_tasks.user_id = :userId`
- 返回完整 GenerationTask 数据 + `recipe: VisualRecipe | null`（从 analysis_tasks.recipe JSONB 取出）
- 仅当 generation_task.status = 'completed' 时才附带 recipe

#### 2. GET /api/generation（历史列表）

在 `src/app/api/generation/route.ts` 中新增 GET handler：

**请求参数**（query）：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| pageSize | number | 否 | 20 | 每页条数，范围 1-50 |
| cursor | string | 否 | null | 游标（上一次返回的 nextCursor） |

**响应体**：
```typescript
{
  items: Array<{
    id: string            // generation_task ULID
    resultFileUrl: string  // 结果图 R2 URL
    createdAt: string      // ISO 8601
  }>
  nextCursor: string | null
}
```

**安全要求**：必须鉴权（复用现有 auth middleware）；仅返回当前 user_id 的数据；pageSize 参数校验（1-50 范围 clamp）。

**可观测性（架构 §8.5）**：handler 入口处记录查询耗时和返回条数，用于后续评估历史列表查询性能。使用项目现有日志工具（如有 structured logger 则优先使用），至少保证 `console.time`/`console.timeEnd` 或等效计时 + `console.log` 输出 `{ duration: ms, itemCount: N, userId }`。

#### 3. GET /api/generation/:id 扩展

修改 `src/app/api/generation/[id]/route.ts` 的 GET handler：

**变更内容**：响应体新增可选字段 `recipe`

```typescript
// 现有响应体不变，新增字段：
recipe?: VisualRecipe  // 仅 status='completed' 时存在，来自 FK join analysis_tasks.recipe
```

**实现方式**：改用 `findByIdWithRecipe()` 替代原有的 `findGenerationTaskById()`

#### 4. 索引确认

在 repository 初始化或首次调用时检查 `(user_id, created_at DESC)` 索引是否存在。如不存在，输出 warning 日志（不阻塞，但建议手动创建）。

#### 5. 类型定义

```typescript
// 历史面板列表项（GET /api/generation 返回）
interface GenerationHistoryItem {
  id: string
  resultFileUrl: string
  createdAt: string
}

// 历史恢复详情（GET /api/generation/:id 扩展响应）
interface GenerationTaskDetail {
  id: string
  analysisTaskId: string
  status: 'completed'
  promptSnapshot: string
  negativePromptSnapshot: string
  params: GenerationParams
  modelName: string
  resultAssetId: string
  resultFileUrl: string
  recipe?: VisualRecipe          // 新增：通过 FK join 获取
  createdAt: string
  updatedAt: string
}
```

### 前端部分

#### 6. useHistoryList Hook（`src/hooks/use-history-list.ts`）

封装历史列表的数据获取逻辑。

```typescript
interface UseHistoryListReturn {
  data: GenerationHistoryItem[] | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  refetch: () => void
}
```

**实现要点**：
- 使用 React Query 的 `useInfiniteQuery`
- queryKey: `['generation-history']`
- 初始请求：`GET /api/generation?pageSize=20`
- 翻页请求：携带上一页返回的 `nextCursor` 作为 `cursor` 参数
- `getNextPageParam` 从响应中提取 `nextCursor`
- 暴露 `refetch` 供生成完成后调用 invalidate

#### 7. useHistoryRestore Hook（`src/hooks/use-history-restore.ts`）

封装单条历史记录的恢复逻辑。

```typescript
interface UseHistoryRestoreReturn {
  restore: (id: string) => Promise<void>
  isRestoring: boolean
  error: Error | null
}
```

**实现要点**：
- 调用 `GET /api/generation/:id` 获取含 recipe 的详情
- 成功后返回完整数据：
  ```typescript
  interface RestoredData {
    resultFileUrl: string
    recipe: VisualRecipe | null
    promptSnapshot: string
    negativePromptSnapshot: string
    params: GenerationParams
  }
  ```
- 错误处理：失败时抛出错误，由调用方展示 Toast

#### 8. HistoryPanel 数据对接（修改 `history-panel.tsx`）

从 FEAT-01 的骨架升级为完整组件。

**新增能力**：
- 调用 `useHistoryList()` 获取数据
- 渲染缩略图列表：每项显示结果图缩略图（`<img>` + R2 URL）+ 相对时间（"2小时前"）
- 当前进行中的生成任务（`currentGenerationTaskId` prop）顶部展示脉冲动画指示器
- 滚动到底部触发 `fetchNextPage()` 加载更多
- 点击条目调用 `onRestore(id)` 回调
- 加载中显示 skeleton 骨架屏
- 加载失败显示"加载失败，点击重试" + 重试按钮（调用 refetch）
- 空态保持"还没有生成记录"

**缩略图项结构**：
```
┌──────────────┐
│  ┌──────────┐ │
│  │  缩略图   │ │  ← img 标签，object-cover，圆角
│  │          │ │
│  └──────────┘ │
│  2小时前      │  ← 相对时间
└──────────────┘
```

#### 9. Workspace Page 历史集成（修改 `workspace/page.tsx`）

在 FEAT-01 改造的基础上进一步改造：

**a) history_restored 状态集成**：
- import `useHistoryRestore`
- 定义 `handleHistoryRestore(id)` 函数：
  1. 调用 `restore(id)`
  2. 成功后更新 workspace state：
     - 设置 resultImage 为 `restoredData.resultFileUrl`
     - 设置 recipe 为 `restoredData.recipe`
     - 设置 prompt 为 `restoredData.promptSnapshot`
     - 设置 negativePrompt 为 `restoredData.negativePromptSnapshot`
     - 设置 output params 为 `restoredData.params`
     - 切换 workspace 状态为 `history_restored`
  3. 失败时 Toast 提示错误
- 将 `handleHistoryRestore` 传给 HistoryPanel 的 `onRestore` prop

**b) 生成完成后刷新历史**：
- 在 useGeneration 的成功回调中（或 useEffect 监听 generationTask 状态变为 completed）：
  ```typescript
  queryClient.invalidateQueries(['generation-history'])
  ```

**c) 按钮文案适配**：
根据 workspace 状态调整主按钮文案：
- `history_restored` → 主按钮显示"生成"（非"重新生成"）

#### 10. Workspace State Machine 扩展（修改 `use-workspace-state.ts`）

在现有状态机基础上新增 `history_restored` 状态。

**变更要点**：
- 状态联合类型新增 `'history_restored'`
- 新增转换函数：
  - `enterHistoryRestored()`: 从 idle / analysis_ready / generation_ready 进入
  - `exitHistoryRestored()`: 回到 idle（清空/重新上传时）
- `history_restored` 状态下的行为标志：
  - `canGenerate: true`（可以基于历史参数新生成）
  - `showRegenerateButton: false`（显示"生成"而非"重新生成"）
- 不影响现有任何状态的转换逻辑

#### 11. 决策面板过渡动画

在状态切换时添加 CSS 过渡效果：

- 使用 Tailwind CSS `transition-all duration-200`
- 面板内容区域使用 `opacity` + `translate-y` 组合过渡
- 进入新状态时：opacity 0→1, translate-y-2→0
- 退出旧状态时反向动画
- 使用 CSS transition，不引入 JS 动画库

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 新增 `listCompleted` repository 方法 | backend | done | cursor 分页，JOIN assets 获取结果图 URL |
| 2 | 新增 `findByIdWithRecipe` repository 方法 | backend | done | LEFT JOIN analysis_tasks 获取 recipe |
| 3 | 实现 GET /api/generation handler | backend | done | query 参数解析 + 调用 listCompleted + 响应格式化 |
| 4 | 扩展 GET /api/generation/:id handler | backend | done | 使用 findByIdWithRecipe，响应体增加 recipe |
| 5 | 创建 `use-history-list.ts` hook | frontend | done | React Query infinite query 封装 |
| 6 | 创建 `use-history-restore.ts` hook | frontend | done | 单条恢复 + 数据分发 |
| 7 | 升级 `history-panel.tsx` 数据对接 | frontend | done | 缩略图列表 + 分页 + 进度动画 + 点击恢复 |
| 8 | 扩展 `use-workspace-state.ts` 状态机 | frontend | done | 新增 history_restored 状态及转换 |
| 9 | 改造 `workspace/page.tsx` 历史集成 | frontend | done | 历史恢复回调 + 按钮文案 + invalidation |
| 10 | 添加过渡动画 | frontend | done | 状态切换 CSS transition |
| 11 | 后端单元测试 | backend | done | 覆盖正常查询、空结果、cursor 分页边界 |
| 12 | 功能验证 | frontend | done | 浏览器验证：上传→分析→生成→历史出现→点击恢复→修改→再生成 |

## 验收标准

### 后端验收

- [ ] `GET /api/generation?pageSize=20` 返回当前用户的已完成生成任务列表（按时间倒序），支持 cursor 分页翻页
- [ ] `GET /api/generation/:id` 在 task 状态为 completed 时响应体包含 `recipe` 字段（VisualRecipe 对象）
- [ ] 两个端点均正确鉴权，仅返回当前用户数据
- [ ] 单元测试覆盖主要路径

### 前端验收

- [ ] HistoryPanel 显示生成历史缩略图列表（时间倒序），支持滚动翻页
- [ ] 生成任务进行中时 HistoryPanel 顶部显示进度动画
- [ ] 点击历史项后工作区正确恢复：结果显示图、Recipe 加载、Prompt 加载、状态变为 history_restored
- [ ] history_restored 状态下主按钮显示"生成"，点击后创建新的生成任务
- [ ] 生成完成后历史面板自动刷新，新条目出现在顶部
- [ ] 状态切换有平滑过渡动画（200-300ms）
- [ ] 所有现有功能（上传、分析、生成）不受影响

### 全流程验收

- [ ] 「上传→分析→生成→历史出现→点击恢复→修改→再生成」完整迭代循环走通

### 性能验收（架构 §8.1 目标）

- [ ] `GET /api/generation?pageSize=20` 首次加载响应时间 ≤ 500ms（DevTools Network 面板人工确认）
- [ ] `GET /api/generation/:id` 历史恢复响应时间 ≤ 300ms（含 recipe JOIN）

## 验证命令

```bash
# 后端
pnpm vitest --run src/lib/repositories/__tests__/generation-task-repository.test.ts

# 前端
pnpm type-check
pnpm lint
pnpm build
```

## 预期结果

功能完成后，用户进入 workspace 页面时右侧 HistoryPanel 自动加载并显示历史生成记录的缩略图列表（时间倒序，最多 20 条），滚动到底部自动加载下一页。当前正在进行的生成任务在 HistoryPanel 顶部显示脉冲进度动画。点击任一缩略图后，中央工作区立即恢复该次生成的完整状态：画布显示结果图、RecipeEditor 加载关联 Recipe 的 4 行摘要、Prompt 编辑器加载 promptSnapshot、输出设置恢复 aspectRatio 等参数，主按钮文案变为"生成"，工作区状态切换为 `history_restored`。用户在 `history_restored` 状态下修改参数后点击"生成"可发起新的生成任务。新任务完成后 HistoryPanel 自动刷新，新条目出现在列表顶部。所有状态切换伴随 200-300ms 的平滑 CSS 过渡动画。

## 交接上下文

- **架构章节**: §3.3 工作区前端状态机, §4.2 HistoryPanel 模块职责, §5 ADR-8/ADR-9, §6.1-6.2 运行链路, §9 Phase B
- **相关代码**:
  - `src/lib/repositories/generation-task-repository.ts`（被扩展的 repository，125 行）
  - `src/app/api/generation/route.ts`（新增 GET handler，250 行）
  - `src/app/api/generation/[id]/route.ts`（扩展 GET handler，67 行）
  - `src/components/workspace/history-panel.tsx`（FEAT-01 创建的骨架，本次升级）
  - `src/hooks/use-workspace-state.ts`（被扩展的状态机，426 行）
  - `src/hooks/use-generation.ts`（生成成功回调参考）
  - `src/app/workspace/page.tsx`（FEAT-01 改造过的页面，本次进一步改造）
- **契约 / 数据对象**: `GenerationHistoryItem`, `GenerationTaskDetail`, `VisualRecipe`
- **下游消费方**: FEAT-04（模板 Use Template 跳转后的工作区状态不受影响）

## 执行指引

- **工具链**: Drizzle ORM, Next.js App Router, React Query (TanStack), React 19, Tailwind CSS 4, TypeScript
- **执行顺序**: Task 1-4（后端，可并行）→ Task 5-6（可并行）→ 7 → 8 → 9 → 10 → 11-12（可并行）
- **阻塞处理**: 如果 recipe 的 FK 关联查询性能有问题，考虑加索引或缓存
- **完成信号**: 浏览器全流程验证通过 + 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 React Query queryKey 是否一致、history_restored 状态转换是否正确触发 UI 更新、Drizzle JOIN 条件是否正确
- **允许修改的额外文件**: `src/types/models.ts`（补充类型定义）、`src/lib/db/schema.ts`（仅确认字段名）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 本功能是核心迭代循环的关键环节，历史恢复的状态分发涉及多个状态位同步更新，需确保原子性
- `queryClient.invalidateQueries` 需要 access queryClient 实例，确认项目中如何获取（通常从 `useQueryClient` hook）
- cursor 分页基于 `created_at` + `id` 组合，需确保编码/解码逻辑一致
- workspace page.tsx 经过 FEAT-01 和 FEAT-02 两次改造，diff 会比较大，注意 git review

## 边界场景检查

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 用户无历史记录 | 返回 `{ items: [], nextCursor: null }`，HTTP 200 | todo |
| pageSize 超出范围 | clamp 到 [1, 50]，不报错 | todo |
| cursor 无效/过期 | 返回空列表（视为第一页之后无数据） | todo |
| generation_task 无关联 assets | 过滤掉该条目或返回 resultFileUrl 为空字符串 | todo |
| analysis_task_id 为 NULL | recipe 返回 null，不报错 | todo |
| 非法 user_id 尝试访问他人数据 | auth middleware 拦截，返回 401/403 | todo |
| 并发插入导致的 cursor 重复/遗漏 | 使用 created_at + id 组合游标保证严格排序 | todo |

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 历史列表为空 | HistoryPanel 显示空态，不影响工作区 | todo |
| 历史列表加载失败 | 显示错误提示 + 重试按钮，工作区不受影响 | todo |
| 历史恢复时 API 返回 recipe 为 null | RecipeEditor 显示空态，其他字段正常加载 | todo |
| 快速连续点击不同历史项 | 取消前一次 restore 请求，只执行最后一次 | todo |
| 恢复过程中用户开始新操作 | disable 生成按钮或忽略冲突操作 | todo |
| 生成任务失败后历史面板 | 失败任务不进入历史列表（仅 completed） | todo |
| history_restored 状态下清空重新上传 | 正常切换到 idle → uploading 流程 | todo |
