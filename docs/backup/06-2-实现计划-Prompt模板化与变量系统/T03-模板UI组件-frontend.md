---
task_id: "T03"
title: "模板 UI 组件"
dimension: frontend
phase: 2
status: done
depends_on: ["T02"]
---

# T03: 模板 UI 组件（前端）

## 任务概要

- **目标**: 实现模板功能的三个核心 UI 组件：保存对话框（TemplateSaveDialog）、模板列表面板（TemplateDrawer）、删除确认对话框，完成 P0 前端组件层的独立开发
- **依赖**: T02（API 端点契约已确定）
- **所属模块**: 模板保存对话框 + 模板 Drawer 组件
- **前置条件**: T02 已完成（或至少 API 契约已冻结可并行开发）
- **不在范围**: 工作区页面集成（T04）、P1 变量向导、样式微调/动画

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/template-save-dialog.tsx` | 模板保存对话框组件 |
| create | `src/components/workspace/template-drawer.tsx` | 模板列表面板（Drawer） |

> `src/lib/template-parser.ts` 已在 T01 中创建，为纯函数模块，前后端共享同一份源码（Next.js 对 server/client 边界的纯函数无限制）。本任务直接 import 使用 `extractVariables` 和 `hasVariables`。

## 实现规格

### 1. TemplateSaveDialog 组件

**文件**: `src/components/workspace/template-save-dialog.tsx`

**功能**:
- 模态对话框，包含：名称输入框、prompt 文本编辑区、变量插入工具栏、「保存模板」和「取消」按钮
- 打开时预填充当前编辑器文本内容（ADR-7）
- 支持在文本中插入 `{{变量名}}` 标记
- 保存前校验：名称非空、内容非空
- 保存成功/失败的反馈提示

**Props 接口**:
```typescript
interface TemplateSaveDialogProps {
  open: boolean;
  initialContent: string;        // 编辑器当前文本（ADR-7）
  sourceAnalysisTaskId?: string; // 可选的来源分析任务 ID
  onSave: (template: PromptTemplate) => void;
  onClose: () => void;
}
```

**内部状态**:
```typescript
const [name, setName] = useState("");
const [content, setContent] = useState(initialContent);
const [isSaving, setIsSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**UI 结构**:
```
┌──────────────────────────────────────┐
│  保存为模板                    [×]   │
├──────────────────────────────────────┤
│                                      │
│  模板名称                             │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  Prompt 内容                         │
│  ┌─ [{{}} 插入变量] ──────────────┐  │
│  │                                │  │
│  │  (textarea, 预填充编辑器内容)    │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  变量预览（从 content 实时提取）        │
│  · subject                          │
│  · lighting                         │
│                                      │
│          [取消]    [保存模板]         │
└──────────────────────────────────────┘
```

**变量插入工具栏交互**:
1. 用户点击「插入变量」按钮
2. 弹出内联小输入框：输入变量名（实时校验格式 `[a-zA-Z_]\w*`）
3. 确认后在 textarea 当前光标位置插入 `{{variableName}}`
4. 同时更新下方变量预览列表（实时调用 `extractVariables(content)`）

光标位置操作使用 textarea 的 `selectionStart`/`selectionEnd` + React ref。

**保存流程**:
1. 校验 name 非空 → 否则提示「请输入模板名称」
2. 校验 content 非空 → 否则提示「Prompt 内容不能为空」（ADR-7 分支）
3. 设置 `isSaving = true`（防止重复提交）
4. 调用 `POST /api/templates`，body: `{ name, content, sourceAnalysisTaskId }`
5. 成功（201）→ `onSave(template)` + 关闭
6. 失败（409）→ 显示「已存在同名模板」，保留内容不关闭
7. 失败（其他）→ 显示错误信息，保留内容不关闭
8. 无论成败 → `isSaving = false`

**样式约定**:
- CSS 变量系统：`--surface-mid`, `--surface-bright`, `--border`, `--text-primary`, `--text-secondary`, `--accent-primary`
- 对话框背景：`bg-[var(--surface-mid)]` + `ring-1 ring-[var(--border)]` + `rounded-xl`
- Modal 遮罩：半透明黑色背景 + 点击关闭

### 2. TemplateDrawer 组件

**文件**: `src/components/workspace/template-drawer.tsx`

**功能**:
- 右侧抽屉面板（~320px 宽度），展示当前用户的模板列表（cursor-based 分页）
- 每张卡片显示：模板名称、变量数量、创建时间
- 卡片操作：「使用」（加载到编辑器）+ 「···」菜单（删除）
- 底部「加载更多」按钮（hasMore=true 时显示）
- 空状态展示引导文案
- 加载/错误/加载更多状态处理

**Props 接口**:
```typescript
interface TemplateDrawerProps {
  open: boolean;
  onLoadTemplate: (content: string) => void;
  onDeleteSuccess: (id: string) => void;
  onClose: () => void;
}
```

**内部状态**:
```typescript
const [templates, setTemplates] = useState<TemplateListItem[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [nextCursor, setNextCursor] = useState<string | null>(null);
const [hasMore, setHasMore] = useState(false);
const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
```

**UI 结构**:
```
┌──────────────┐
│ 我的模板  [×] │
├──────────────┤
│              │
│ ┌──────────┐ │
│ │ 赛博朋克  │ │
│ │ 变量: 2   │ │
│ │ 2026-04-09│ │
│ │ [使用] [·]│ │
│ └──────────┘ │
│              │
│   [加载更多]  │
│              │
│ （空状态时）   │
│ "还没有模板   │
│  先保存一个吧" │
└──────────────┘
```

**数据获取（cursor-based 分页）**:

首次加载（`open` 变为 true 时）:
1. 调用 `GET /api/templates`（不传 cursor，默认 limit=10）
2. 解析响应 `{ items, hasMore, nextCursor }`
3. 设置 state

加载更多:
1. 点击「加载更多」→ `isLoadingMore = true`
2. 调用 `GET /api/templates?cursor={nextCursor}&limit=10`
3. 将返回的 items **追加**到现有数组
4. 更新 hasMore 和 nextCursor
5. `isLoadingMore = false`

状态管理：使用原生 fetch + state（与 workspace 页面现有模式一致）。

**「使用」按钮行为**:
1. 调用 `GET /api/templates/:id` 获取完整 content
2. 成功 → `onLoadTemplate(content)` + `onClose()`
3. 失败 → 显示错误 toast

**删除确认流程**（内联实现，保持视觉一致性）:
1. 用户点击「···」→ 选择「删除」
2. 弹出内联确认对话框：`确定删除模板"XXX"？删除后不可恢复。`
3. 用户确认 → 调用 `DELETE /api/templates/:id`
4. 成功 → 从本地列表移除 + `onDeleteSuccess(id)`
5. 失败 → 显示错误提示

**样式约定**:
- Drawer 从右侧滑入，固定宽度 `w-[320px]`
- 背景：`bg-[var(--surface-base)]`
- 卡片：`bg-[var(--surface-mid)]` + `rounded-lg` + `ring-1 ring-[var(--border)]`
- 空状态：居中图标 + 引导文字

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 `src/components/workspace/template-save-dialog.tsx` | done | 含 Props 定义、状态管理、表单校验、变量插入工具栏、保存逻辑 |
| 2 | 创建 `src/components/workspace/template-drawer.tsx` | done | 含列表渲染、卡片组件、空状态、cursor 分页+加载更多、使用/删除逻辑、内联确认对话框 |
| 3 | 组件基本视觉验证 | done | pnpm dev 启动后确认组件可正常渲染（需手动挂载测试或等待 T04 集成） |
| 4 | 关键操作埋点 [架构8.5] | done | 在 TemplateSaveDialog 保存成功时输出 `template_saved`、加载模板时输出 `template_loaded`、删除成功时输出 `template_deleted`（使用 console.log 或统一事件函数，与现有模式一致） |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建验证
pnpm build
```

## 预期结果

1. `pnpm type-check` 和 `pnpm build` 通过
2. TemplateSaveDialog 可正常打开/关闭，支持名称输入、文本编辑、变量插入
3. TemplateSaveDialog 保存时调用 POST /api/templates 并处理各响应状态（201/409/4xx/5xx）
4. TemplateDrawer 打开时自动加载模板列表（GET /api/templates）
5. TemplateDrawer 的「使用」按钮可加载模板 content（GET /api/templates/:id）
6. TemplateDrawer 的删除流程含二次确认（DELETE /api/templates/:id）
7. 所有组件使用统一的 CSS 变量设计系统
8. Drawer 支持 cursor 分页 + 加载更多

## 交接上下文

- **架构章节**: 5.2 模块职责、ADR-5（Drawer 架构）、6.1 保存链路、6.2 加载链路、6.3 删除链路
- **相关代码**: `src/components/workspace/prompt-editor.tsx`（参考样式模式）、`src/app/workspace/page.tsx`（集成目标）、T02 API 契约
- **契约 / 数据对象**: `TemplateListItem`, `CreateTemplateRequest`, `PromptTemplate`
- **消费的上游契约摘要**:

```typescript
// T02 API 契约 — 本任务消费
// POST /api/templates
//   Request: { name: string, content: string, sourceAnalysisTaskId?: string }
//   Response 201: { id, name, content, variables: TemplateVariable[], sourceAnalysisTaskId?, createdAt }
//   Error 409: { error: "已存在同名模板", code: "TEMPLATE_NAME_CONFLICT" }

// GET /api/templates — 列表（cursor-based 分页）
//   Query: cursor?: string, limit?: number (default 10, max 50)
//   Response 200: { items: TemplateListItem[], hasMore: boolean, nextCursor: string | null }

// GET /api/templates/:id
//   Response 200: { id, name, content, variables, sourceAnalysisTaskId?, createdAt, updatedAt }
//   Error 404: { error: "模板不存在", code: "TEMPLATE_NOT_FOUND" }

// DELETE /api/templates/:id
//   Response 204 (No Content)
//   Error 404: { error: "模板不存在", code: "TEMPLATE_NOT_FOUND" }

// template-parser.ts — 本任务消费（纯函数，前后端共享）
// extractVariables(content): TemplateVariable[]
// hasVariables(content): boolean
```

## 执行指引

- **工具链**: pnpm, React 19, TypeScript, Tailwind CSS 4
- **执行顺序**: Task 列表按序执行（SaveDialog → Drawer → 视觉验证）
- **阻塞处理**: T02 API 未就绪时可先用 mock 数据开发 UI，但最终需对接真实 API
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - 类型错误：检查 API 响应类型定义是否与 T02 契约一致
  - 样式问题：对比 `prompt-editor.tsx` 的 CSS 类名确保一致性
  - import 错误：确认 `template-parser` 的 import 路径正确
- **允许修改的额外文件**: 无（本任务只创建新组件文件）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 组件使用原生 fetch（与 workspace 页面一致），未引入 React Query
- TemplateDrawer 宽度 ~320px 与 workspace 右列宽度一致，打开时的布局协调由 T04 处理
- 变量插入的光标位置操作需要 textarea 的 `selectionStart`/`selectionEnd` + React ref
- 删除确认对话框建议内联实现而非 window.confirm，保持视觉一致性
- Drawer 重新打开时重置分页状态（重新从第一页开始）

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| API 请求数据完整性 | 保存时 name 和 content 来自受控组件 state，保证非空后才发送请求 | todo |
| 加载/等待状态 | isSaving/isLoading/isLoadingMore 状态控制按钮 disabled + spinner/loading 文案 | todo |
| 错误处理与重试 | 保存失败保留对话框内容和用户输入，显示错误信息，用户可直接修改重试 | todo |
| 空状态处理 | Drawer 无模板时显示空状态引导（"还没有模板，先保存一个吧"） | todo |
| 网络异常 | fetch 的 try-catch 兜底，显示通用网络错误提示 | todo |
| 编辑器内容超长 | content > 10000 字符时保存前前端拦截提示 | todo |
| 快速重复点击保存 | isSaving 防止重复提交 | todo |
| 变量名格式非法 | 变量插入时实时正则校验 `[a-zA-Z_]\w*`，非法输入不允许确认 | todo |
| 分页边界 | hasMore=false 时隐藏「加载更多」按钮；全部加载完毕显示「已全部加载」或隐藏 | todo |
