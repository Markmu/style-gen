---
feat_id: "plan-02"
title: "AppShell 与 AI 状态头"
dimension: frontend
phase: 2
status: done
depends_on: ["plan-01"]
---

# plan-02: AppShell 与 AI 状态头

## 功能概要

- **目标**: 建立 Landing、Workspace、Style Memory 和登录入口共享的页面壳层、导航选中规则与 AI 协作状态头，使全站在进入 Workspace 主链路前先拥有一致的页面层级和状态反馈。
- **完成后可观察结果**: 用户在首页、工作台和风格记忆库之间切换时，能看到一致的导航、登录入口、当前页面识别和 AI 协作状态语言。Workspace 宽屏三栏仍被保留，但上方状态头会说明当前阶段、AI 正在理解的内容、下一步行动和服务状态。Style Memory 与 Landing 不再像孤立页面，而是落在同一套 shell、surface、button 和 status token 下。未登录入口不会清空 Workspace 上下文，登录按钮和用户菜单也遵循同样的视觉反馈。
- **依赖**: plan-01（DesignTokenLayer 与状态语言基线）
- **关联验收标准**: [AC-02, AC-07, AC-08]
- **涉及架构模块**: AppShell、StatePresenter/StatusLanguage、WorkspaceExperience、StyleMemoryExperience、LandingExperience
- **前置条件**: plan-01 的 token/status copy 已完成；现有 `src/app/layout.tsx`、`src/app/workspace/layout.tsx`、`AuthHeader`、`LeftSidebar`、`StatusBar` 可用。
- **不在范围**: Workspace evidence facet 细节、Render Dock 生成 readiness、Style Memory 卡片内容、Landing hero 具体视觉重写。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/app-shell.tsx` | 共享页面壳层，承载 nav/header/main landmarks 和 surface 约束 |
| modify | `src/app/layout.tsx` | 接入全站 shell 所需 body/root class 与 landmarks |
| modify | `src/app/workspace/layout.tsx` | 使用共享 shell 组织 Workspace/Style Memory 内容区域 |
| modify | `src/components/auth/auth-header.tsx` | 导航文案从 Template Library 迁移为 Style Memory，保持路由/API 不变 |
| modify | `src/components/auth/login-button.tsx` | 登录入口视觉和状态反馈对齐 AI-first shell |
| modify | `src/components/workspace/left-sidebar.tsx` | 导航选中、折叠态、Style Memory 命名和状态反馈统一 |
| modify | `src/components/workspace/status-bar.tsx` | 收敛为 Workspace AI 状态头入口，展示 phase/readiness/next action |
| modify | `src/components/workspace/ai-copilot-ribbon.tsx` | 作为 AI 协作状态摘要，消费状态 copy 和 readiness 语义 |
| modify | `src/components/workspace/__tests__/left-sidebar.test.tsx` | 覆盖导航选中、Style Memory 文案、折叠态 |
| modify | `src/components/workspace/__tests__/status-bar.test.tsx` | 覆盖 AI 状态头 phase、next action、service 状态 |
| create | `src/components/auth/__tests__/auth-header.test.tsx` | 覆盖全站 nav 和登录入口 |
| create | `e2e/ai-first-shell.spec.ts` | AppShell/导航/状态头 targeted E2E |

## 实现规格

### 前端部分

#### 1. 共享 AppShell

在 `src/components/app-shell.tsx` 创建轻量壳层组件：

- props: `children`、`variant?: "landing" | "workspace" | "memory"`、`pageLabel`、`statusSummary?`、`actions?`。
- 输出共享 `main` landmark；Landing 提供顶部 `header`/`nav`，Workspace 路由由左侧栏提供工作区 `nav`，避免重复导航 landmark。
- 使用 plan-01 token：`.workspace-chromatic`、`.ai-panel`、`.surface-panel`，不新增 UI 框架。
- 保留 children 的布局自由度，不把 Workspace 三栏放入嵌套卡片。
- 支持 auth header 或 left sidebar 的插槽，具体 route 仍由现有 Next.js layout/page 控制。

#### 2. Workspace layout 接线

调整 `src/app/workspace/layout.tsx`：

- 保留现有 Workspace/Style Memory 路由结构。
- 将 `LeftSidebar` 和内容区包进 AppShell 或等价共享结构。
- 保证 `/workspace`、`/workspace/templates` 的 active nav 来源于 pathname，不依赖页面内部 state。
- 不改变 `templateId` query 注入 Workspace 的业务流程。

#### 3. 导航与命名迁移

`AuthHeader` 和 `LeftSidebar` 的用户可见文案迁移：

- Landing 顶部导航显示 `Style Memory`；Workspace 左侧栏使用更紧凑的可见文案 `Library`，并以 `Style Memory Library` 作为可访问名称；路由仍为 `/workspace/templates`。
- 旧 `Template Library` 文案只允许出现在代码/API 命名或兼容测试注释中，不应继续作为主导航文案。
- 登录入口、用户菜单和导航按钮使用 plan-01 button/input/status token。

#### 4. AI 状态头

`StatusBar` 与 `ai-copilot-ribbon` 形成统一 Workspace 状态头：

- 输入 Workspace state、degradation、error、prompt/recipe 简要信息。
- 输出 phase label、AI 当前动作、readiness summary、service availability 和 next action。
- `analysisQueueing` / `generationQueueing` 展示 queued copy；`generationUnavailable` 展示服务受限但保留编辑能力。
- 避免把错误状态只放在 tooltip 或 `title` 属性中。

#### 5. E2E red/green

`e2e/ai-first-shell.spec.ts` 覆盖：

- Landing、Workspace、Style Memory 共享 AI-first shell；Landing 使用顶部导航，Workspace 与 Style Memory 共享左侧工作区导航。
- `/workspace/templates` 左侧导航显示 Library、可访问名称为 Style Memory Library 且 active。
- Workspace 状态头在 idle/analyzing/analysis_ready/generating/failed 中有可见文案。
- 未登录或 auth 入口不清空已存在的 workspace sessionStorage 快照。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `ai-first-shell.spec.ts` red 用例和证据 | frontend | done | 证据写入 `docs/e2e/evidence/plan-02-e2e-red-20260705.md` |
| 2 | 创建共享 `AppShell` 组件 | frontend | done | 只承担壳层和 landmarks，不承载业务逻辑 |
| 3 | 改造 root/workspace layout 接入 shell | frontend | done | 保留路由、query 和三栏工作台结构 |
| 4 | 更新 AuthHeader/LoginButton/LeftSidebar 文案与 token | frontend | done | Landing 显示 Style Memory，Workspace 左侧栏显示 Library，代码/API 保持 template |
| 5 | 收敛 StatusBar 与 AiCopilotRibbon 状态头 | frontend | done | 映射 phase、readiness、next action、degradation |
| 6 | 更新导航和状态头组件测试 | frontend | done | 覆盖 active nav、折叠态、aria-label、服务受限 |
| 7 | 运行 red/green E2E、组件测试、类型检查和构建 | frontend | done | 证据写入 `docs/e2e/evidence/plan-02-e2e-green-20260705.md` |

## 验收标准

### 壳层验收

- [x] AC-02 `/workspace` 渲染共享壳层、Workspace 导航、AI 状态头和三栏内容区域，且不回退旧 two-pane 主体验。
- [x] AC-07 Landing、Workspace、Style Memory 和登录入口使用一致 surface、button、nav active 和状态语言。
- [x] AC-07 Landing 主导航使用 `Style Memory`；Workspace 左侧栏使用 `Library` 并保留 `Style Memory Library` 可访问名称；`/workspace/templates` 路由和 template API 命名不变。
- [x] AC-08 未登录或受限入口显示可继续行动，不清空 sessionStorage 中有效 Workspace 快照。
- [x] E2E-TDD：`e2e/ai-first-shell.spec.ts` 先 red 后 green，证据分别写入 `docs/e2e/evidence/plan-02-e2e-red-20260705.md` 与 `docs/e2e/evidence/plan-02-e2e-green-20260705.md`。

### 降级回归验收（架构 §8.2）

- [x] AC-08 L1 queued、L2 service unavailable、L4 authRequired 的 shell/status header 文案在新壳层中可见，不被导航或浮层遮挡。

### 性能验收（架构 §8.1 目标）

- [x] AC-02 AppShell 不增加新的阻塞式数据请求；无 reference 时 Workspace shell 和空态直接渲染（架构 §8.1）。

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/left-sidebar.test.tsx src/components/workspace/__tests__/status-bar.test.tsx src/components/auth/__tests__/auth-header.test.tsx
pnpm e2e -- e2e/ai-first-shell.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-02/AC-07/AC-08、§4.2 AppShell、§6.1、§6.7、§7.6。
- **相关代码**: `src/app/layout.tsx`、`src/app/workspace/layout.tsx`、`src/components/auth/auth-header.tsx`、`src/components/workspace/left-sidebar.tsx`、`src/components/workspace/status-bar.tsx`、`src/components/workspace/ai-copilot-ribbon.tsx`。
- **契约 / 数据对象**: route pathname、Workspace state summary、`ProductStatus` copy、Style Memory 文案映射。
- **下游消费方**: plan-03 Workspace、plan-04 Render Dock、plan-06 Style Memory、plan-07 Landing/Auth、plan-08 targeted E2E。

## 风险与边界

- **执行顺序**: 先写 red E2E，再创建 AppShell，随后接 layout/nav/status header，最后更新测试。
- **验证失败排查方向**: 检查 pathname active 规则、Style Memory 文案是否仍有旧 `Template Library` 主文案、状态头是否接收了正确 degradation/error。
- **允许修改的额外文件**: 无。
- **暂停条件**: 若需要重构 Next.js 路由、引入全局状态库、改 auth provider 或新增后端 session API，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能为全站用户可观察壳层。
- **风险备注**: `src/components/workspace/ai-copilot-ribbon.tsx` 当前可能处于并行未提交改动中；实现时必须先读取最新文件并只做必要增量修改。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| `/workspace/templates` active nav | 显示 Style Memory active，不改变 route | done |
| 用户未登录 | 登录入口展示 authRequired 行动，不清空 Workspace context | done |
| Workspace 正在生成 | 状态头显示 processing/queued，不允许重复提交 | done |
| generation service unavailable | 状态头显示服务受限，提示仍可编辑/保存 | done |
| 窄屏 shell | nav/content 不重叠，允许合理折叠或横向滚动 | done |
