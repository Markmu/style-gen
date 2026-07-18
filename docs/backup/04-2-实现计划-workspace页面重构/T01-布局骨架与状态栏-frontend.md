---
task_id: "T01"
title: "布局骨架与状态栏"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# T01: 布局骨架与状态栏（前端）

## 任务概要

- **目标**: 搭建两段式 Grid 布局骨架（左侧内容画布 + 右侧决策面板），创建 StatusBar 组件，重构 page.tsx 为薄编排层。完成后 Workspace 页面框架就位，后续任务可在此基础上填充内容。
- **依赖**: 无
- **所属模块**: WorkspacePage / StatusBar
- **前置条件**: `pnpm dev` 可正常启动，现有代码可编译
- **不在范围**: 画布内部子视图、决策面板 Step 内容、降级/错误处理迁移

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/status-bar.tsx` | 新建 StatusBar 组件 |
| modify | `src/app/workspace/page.tsx` | 重构为薄编排层 + 两段式 Grid 布局 |
| modify | `src/hooks/use-workspace-state.ts` | 增量扩展：新增 isRecipeExpanded 状态和 toggle action |

## 实现规格

### 1. StatusBar 组件 (`status-bar.tsx`)

创建 `StatusBar` 组件，位于全局 AuthHeader 下方（不在 page 内部修改 AuthHeader）。

Props 接口：

```typescript
interface StatusBarProps {
  state: WorkspaceState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  onReplace: () => void;
}
```

实现要点：

- 使用架构文档 §7.2 定义的 `STATUS_BAR_CONFIG` 映射表，根据 `state` 计算 `label`、`description`、`showReplaceButton`
- 状态标签使用 pill/badge 样式，配色参考设计 token
- "更换参考图"按钮仅在 `showReplaceButton === true` 时渲染
- 使用 Tailwind CSS + CSS 变量（`var(--surface-mid)`、`var(--text-primary)` 等）
- 布局：水平排列 —— 左侧标题+说明文案，右侧状态标签+更换按钮

### 2. 两段式 Grid 布局 (`page.tsx`)

将现有 `grid-cols-[5fr_5fr_3fr]` 三栏布局替换为两栏布局：

```tsx
<div className="grid grid-cols-[1fr_380px] gap-6">
  {/* 左侧：WorkspaceCanvas placeholder */}
  <div>
    {/* Phase 2-3 填充 */}
  </div>
  {/* 右侧：DecisionPanel placeholder */}
  <div>
    {/* Phase 2 填充 */}
  </div>
</div>
```

- 画布区域最小宽度：`min-w-[55%]`
- 面板区域固定宽度范围：360-420px（使用 `w-[380px] min-w-[360px] max-w-[420px]`）
- StatusBar 渲染在 Grid 之上

**重构 page.tsx 为薄编排层**：

- 保留所有 hook 初始化（useWorkspaceState / useUpload / useAnalysis / useGeneration）
- 保留所有回调定义（handleFileSelected / handleGenerate / handleRetry / handleReplace / handleGenerateRetry）
- 保留所有 useEffect（文件消费、分析/生成轮询监听、L1 降级计时）
- 移除布尔条件计算（showRecipe / showPromptEditor 等）和条件渲染逻辑——这些将在 T02/T03 中下沉到子组件
- 暂时将现有组件渲染保留在左右两栏的 placeholder 中（临时过渡），确保功能不中断
- 目标：page.tsx 的 return 语句简化为 StatusBar + 左栏容器 + 右栏容器

### 3. useWorkspaceState 增量扩展

在 WorkspaceContext 接口中新增：

```typescript
// 新增到 WorkspaceContext
isRecipeExpanded: boolean;
```

在 WorkspaceActions 接口中新增：

```typescript
// 新增到 WorkspaceActions
toggleRecipeExpanded: () => void;
```

实现：
- `isRecipeExpanded` 初始值 `false`
- `toggleRecipeExpanded` 切换布尔值
- 在 `completeGeneration` action 中将 `isRecipeExpanded` 重置为 `false`（架构 §4.1 "折叠为本次生成参数摘要"）
- 此状态不需要 sessionStorage 持久化（独立 UI 状态）
- 不在 useWorkspaceState 中添加 canvasView——它是派生计算，在使用处计算

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 StatusBar 组件 | done | 含 STATUS_BAR_CONFIG、状态标签、更换参考图按钮 |
| 2 | 扩展 useWorkspaceState | done | 新增 isRecipeExpanded + toggleRecipeExpanded |
| 3 | 重构 page.tsx 布局 | done | 三栏→两栏 Grid、引入 StatusBar、保留现有功能在 placeholder 中 |
| 4 | 验证编译和类型检查 | done | `pnpm type-check && pnpm build` 通过 |

## 验证命令

```bash
pnpm type-check && pnpm lint && pnpm build
```

## 预期结果

1. Workspace 页面渲染为两栏布局（左侧大面积 + 右侧 ~380px）
2. StatusBar 在页面顶部正确渲染，状态标签随 `ws.state` 变化
3. 现有功能（上传、分析、生成）在过渡阶段仍可正常使用
4. TypeScript 编译和 lint 无错误

## 交接上下文

- **架构章节**: ADR-1（两段式布局）、ADR-5（状态扩展）、ADR-6（薄编排层）、§5.2 模块职责（StatusBar / WorkspacePage）、§7.2 STATUS_BAR_CONFIG
- **相关代码**: `src/app/workspace/page.tsx`、`src/hooks/use-workspace-state.ts`
- **契约 / 数据对象**: `WorkspaceState`、`WorkspaceContext`、`WorkspaceActions`、`StatusBarConfig`
- **提供给下游的契约摘要**:

```typescript
// StatusBar props
interface StatusBarProps {
  state: WorkspaceState;
  error: WorkspaceError | null;
  resultImageUrl: string | null;
  onReplace: () => void;
}

// useWorkspaceState 新增返回
interface WorkspaceContext {
  // ...existing fields...
  isRecipeExpanded: boolean;
}
interface WorkspaceActions {
  // ...existing methods...
  toggleRecipeExpanded: () => void;
}
```

## 执行指引

- **工具链**: pnpm, Next.js App Router, Tailwind CSS 4
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 Tailwind CSS 4 的 grid 语法是否正确、CSS 变量是否已在全局定义、import 路径是否正确
- **允许修改的额外文件**: `src/app/workspace/page.tsx` 的 import 语句
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- page.tsx 重构需要保证过渡期功能不中断，现有组件渲染暂时放在新布局的 placeholder 中
- StatusBar 的样式需要与现有 AuthHeader 在视觉上协调，注意间距和色调

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 窄屏（1280-1440px）下画布比例 | 画布 min-w-[55%]，面板 max-w-[420px]，确保不挤压 | done |
| StatusBar 状态标签文案长度 | 固定枚举映射，不存在过长文案 | done |
| error 状态下的 StatusBar 展示 | error 不影响 StatusBar 状态标签（state 仍为 idle/generation_ready） | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
