---
feat_id: "FEAT-01"
title: "三段式工作台布局"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# FEAT-01: 三段式工作台布局（前端）

## 功能概要

- **目标**: 创建三段式工作台布局骨架——Left Sidebar（共享导航）+ 中央工作区 slot + Right History Panel（占位骨架），使 workspace 页面从两段式升级为三段式渲染。本功能是后续 FEAT-02（历史面板数据对接）和 FEAT-04（模板库页面）的布局基础。
- **依赖**: 无
- **涉及架构模块**: WorkspaceLayout, LeftSidebar, HistoryPanel（骨架）
- **前置条件**: 无
- **不在范围**: HistoryPanel 数据对接（FEAT-02）、Sidebar 折叠/隐藏、面板宽度拖拽调整、移动端适配

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/workspace/layout.tsx` | Workspace 共享 Layout：渲染 LeftSidebar + children |
| create | `src/components/workspace/left-sidebar.tsx` | 左侧导航栏组件（224px 固定宽） |
| create | `src/components/workspace/history-panel.tsx` | 右侧历史面板组件骨架（224px 固定宽，暂无数据） |
| modify | `src/app/workspace/page.tsx` | 改造为中央工作区 + Right History Panel 并排；移除旧的两段式 grid 布局逻辑 |

## 实现规格

### 1. Workspace Layout（`src/app/workspace/layout.tsx`）

新建客户端组件（'use client'），作为 `/workspace` 和 `/workspace/templates` 的共享 Layout。

**结构**：
```
┌──────────┬─────────────────────────────┐
│          │                             │
│ Left     │      {children}             │
│ Sidebar  │  (workspace page or         │
│ (224px)  │   templates page)           │
│          │                             │
│          │                             │
└──────────┴─────────────────────────────┘
```

**实现要求**：
- 使用 flex 布局：`flex h-screen`，Left Sidebar `w-56 flex-shrink-0`，children `flex-1 min-w-0`
- Left Sidebar 固定宽度 224px（Tailwind `w-56`），背景色使用设计 token（`bg-muted` 或等效色）
- children 区域 `overflow-auto` 以支持内部滚动
- 不做服务端数据获取（纯布局组件）
- 导出为默认导出

### 2. LeftSidebar（`src/components/workspace/left-sidebar.tsx`）

新建客户端组件。

**视觉结构**（从上到下）：
```
┌──────────────┐
│  🎨 Visoryn  │  ← 品牌标题（logo + 文字）
│              │
│  ✨ Generate │  ← 导航项（高亮当前页）
│  📚 Library  │
│              │
│              │
│              │
│ ──────────── │
│  📄 Docs     │  ← 底部辅助链接
│  ❓ Help     │
└──────────────┘
```

**实现要求**：
- 固定宽度 224px，高度撑满（`h-full`）
- 使用 `usePathname()` 判断当前路由高亮：
  - pathname === '/workspace' → Generate 高亮
  - pathname.startsWith('/workspace/templates') → Library 高亮
- 高亮态：背景色变化 + 左侧 accent 色竖条（`border-l-2 border-primary`）
- 导航项点击使用 `router.push()` 跳转
- 底部辅助链接区域 `mt-auto` 推到底部
- 品牌标题区域不可点击（或点击回到首页）
- 整体样式简洁，符合现有设计系统

### 3. HistoryPanel 骨架（`src/components/workspace/history-panel.tsx`）

新建客户端组件，本期只实现骨架（数据对接在 FEAT-02）。

**视觉结构**：
```
┌──────────────┐
│  History     │  ← 标题栏
│ ──────────── │
│              │
│  [空态提示]   │  ← 本期显示占位/空态
│  或          │
│  [缩略图列表] │  ← FEAT-02 填充真实数据
│              │
│              │
└──────────────┘
```

**实现要求（骨架版）**：
- 固定宽度 224px（`w-56`），高度撑满
- 标题栏："History" 文字 + 可选的刷新图标
- 内容区：默认显示空态提示文案"还没有生成记录"，使用居中灰色文字
- Props 接口预留：
  ```typescript
  interface HistoryPanelProps {
    currentGenerationTaskId?: string  // FEAT-02 使用：进行中任务的 ID
    onRestore?: (id: string) => void   // FEAT-02 使用：点击历史项回调
  }
  ```
- 本期这些 props 可选，组件内部做空态降级

### 4. Workspace Page 改造（`src/app/workspace/page.tsx`）

将现有 587 行的 workspace 页面改造为适配三段式布局。

**变更要点**：
- 移除旧的 responsive grid 两段/三段切换逻辑（如果存在）
- 页面主体变为两列 flex 布局：**中央工作区**（左侧，flex-1）+ **HistoryPanel**（右侧，w-56）
- 中央工作区内部保持现有组件排列（Canvas + Recipe/Prompt/Settings），但整体放入一个容器 div 中
- 引入 `<HistoryPanel>` 组件放到右侧
- 保持所有现有 hooks（useUpload、useAnalysis、useGeneration、useWorkspaceState）不变
- 保持现有组件引用（StatusBar、WorkspaceCanvas、RecipeStep、PromptEditor 等）不变——RecipeStep 的替换在 FEAT-03 做

**改造后的页面大致结构**：
```tsx
export default function WorkspacePage() {
  // ... existing hooks unchanged ...

  return (
    <div className="flex h-full">
      {/* 中央工作区 */}
      <div className="flex-1 min-w-0 overflow-auto">
        <StatusBar ... />
        <div className="flex gap-6">
          <WorkspaceCanvas ... />
          <div className="flex-1">
            <RecipeStep ... />       {/* FEAT-03 替换为 RecipeEditor */}
            <PromptEditor ... />
            <OutputSettings ... />
          </div>
        </div>
      </div>

      {/* 右侧历史面板 */}
      <HistoryPanel
        currentGenerationTaskId={generationTaskId}
        onRestore={handleHistoryRestore}  {/* FEAT-02 实现 */}
      />
    </div>
  )
}
```

**注意**：
- 本期 `handleHistoryRestore` 可以先定义为空函数或 console.warn
- `currentGenerationTaskId` 从 useGeneration hook 获取（如果暴露的话），否则先传 undefined
- 不要破坏现有的任何功能逻辑，仅改变布局结构

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 创建 `workspace/layout.tsx` | frontend | done | LeftSidebar + children 的 flex 布局 |
| 2 | 创建 `left-sidebar.tsx` | frontend | done | 品牌标题 + 导航项 + 底部链接 + 路由高亮 |
| 3 | 创建 `history-panel.tsx` 骨架 | frontend | done | 固定宽度 + 标题 + 空态 + Props 接口预留 |
| 4 | 改造 `workspace/page.tsx` 布局 | frontend | done | 中央工作区 + HistoryPanel 并排，保留全部现有功能 |
| 5 | 视觉验证 | frontend | done | 浏览器打开 /workspace 确认三列渲染正确 |
| 6 | 导航跳转验证 | frontend | done | 点击 Library 跳转到 /workspace/templates（404 是预期的，FEAT-04 创建页面） |

## 验收标准

### 前端验收

- [ ] 访问 `/workspace` 显示三段式布局：左侧 LeftSidebar（导航）+ 中央工作区（现有内容）+ 右侧 HistoryPanel（空态提示）
- [ ] LeftSidebar 的 Generate 项高亮，点击 Library 跳转到 `/workspace/templates`
- [ ] 中央工作区的所有现有功能（上传、分析、生成）不受影响
- [ ] HistoryPanel 显示空态文案，不影响中央工作区操作
- [ ] 布局在 ≥ 1280px 视口宽度下三列均可见且无溢出
- [ ] `pnpm type-check && pnpm lint && pnpm build` 通过

### 降级回归验收（架构 §8.2）

- [ ] 降级提示（L2 生成不可用→输出设置区错误、L5 全站不可用→整页维护提示）在三段式布局中正确显示，不被 LeftSidebar 或 HistoryPanel 遮挡

## 验证命令

```bash
pnpm type-check
pnpm lint
pnpm build
```

## 预期结果

功能完成后，访问 `/workspace` 页面将呈现完整的三段式布局：左侧 224px 宽的 LeftSidebar 显示品牌标题和导航（Generate 高亮、Library 可点击跳转），中央区域保持现有工作区所有功能不变（上传、分析、生成流程不受影响），右侧 224px 宽的 HistoryPanel 显示空态提示"还没有生成记录"。整个布局在 ≥1280px 视口下三列同时可见且无水平溢出，面板之间无硬切换跳变。`/workspace/templates` 路由通过共享 Layout 自动获得 LeftSidebar（Library 项高亮），当前返回 404 属于预期行为。

## 交接上下文

- **架构章节**: §4.2 WorkspaceLayout / LeftSidebar / HistoryPanel 模块职责, §9 Phase A 前端部分
- **相关代码**:
  - `src/app/workspace/page.tsx`（被改造的主页面，587 行）
  - `src/components/workspace/` 目录（现有组件参考样式）
  - `src/app/layout.tsx`（根 Layout 参考）
- **下游消费方**: FEAT-02（HistoryPanel 数据对接）、FEAT-04（模板库页面复用 Layout）

## 执行指引

- **工具链**: Next.js App Router, React 19, Tailwind CSS 4, TypeScript
- **执行顺序**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5/6（可并行）
- **阻塞处理**: 如果 workspace page.tsx 的现有布局结构比预期复杂（如有复杂的 responsive 逻辑），不要大幅重构——只在外层包一个 flex 容器把 HistoryPanel 加到右边
- **完成信号**: 浏览器验证通过 + 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 layout.tsx 是否正确包裹了 children、flex 布局是否导致溢出、pathname 匹配是否准确
- **允许修改的额外文件**: `src/app/globals.css`（仅限添加必要的布局样式）、`tailwind.config.ts`（如需要自定义宽度值）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- workspace page.tsx 有 587 行，改造时需仔细保留所有现有逻辑不被误删
- 建议先用 git diff 确认改动范围仅涉及布局结构调整
- HistoryPanel 骨架期的 props 是可选的，TypeScript 不应报错
- `/workspace/templates` 路由暂时返回 404 是正常的，FEAT-04 会创建该页面

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 视口宽度 < 1280px | 中央工作区压缩，Sidebar 和 Panel 保持固定宽度，工作区出现水平滚动条（本期不做移动端适配） | todo |
| HistoryPanel props 未传 | 组件正常渲染空态，不崩溃 | todo |
| LeftSidebar 导航项 pathname 精确匹配 | /workspace 高亮 Generate，/workspace/templates 高亮 Library | todo |
| children 为空 | Layout 正常渲染，只显示 Sidebar | todo |
| 页面快速切换路由 | usePathname() 正确更新高亮状态 | todo |
