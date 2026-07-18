---
feat_id: "FEAT-02"
title: "全站壳层与导航统一"
dimension: frontend
phase: 2
status: review
depends_on: ["FEAT-01"]
---

# FEAT-02: 全站壳层与导航统一

## 功能概要

- **目标**: 统一 `AuthHeader`、`WorkspaceLayout`、`LeftSidebar`、页面背景和导航选中状态，让首页、工作台、模板库切换时保持同一产品感。
- **完成后可观察结果**: 顶部导航在首页、工作台、模板库中保持轻质玻璃形态；工作区侧边导航和页面背景不再使用厚重深色边界；>=1280px 下主任务区域位置稳定，导航选中清晰但不刺眼。
- **依赖**: FEAT-01
- **关联验收标准**: [AC-02, AC-03, AC-07]
- **涉及架构模块**: AppShell, PageLayoutContract, DesignTokenLayer
- **前置条件**: FEAT-01 提供 Precision Glass token 和交互 utility。
- **不在范围**: 重绘首页具体内容、重绘工作台具体业务组件、移动端壳层专项适配。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/auth/auth-header.tsx` | 顶部导航玻璃化、品牌统一、首页/工作台/模板库入口和当前路径高亮 |
| modify | `src/app/layout.tsx` | 必要时调整 body/page 背景 class 和 header 包裹，不改变 Providers 顺序 |
| modify | `src/app/workspace/layout.tsx` | 统一工作区背景、常规宽屏布局约束、children 滚动边界 |
| modify | `src/components/workspace/left-sidebar.tsx` | 侧边导航轻质化、去除厚边框、选中/hover/focus 状态统一 |
| create | `e2e/precision-glass-shell.spec.ts` | 验证跨页面导航、选中态、>=1280px 布局稳定 |

## 实现规格

### 前端部分

#### 1. AuthHeader

- 使用 `.glass-panel` 或等价 token 表达 sticky 顶部栏。
- 品牌名统一为产品当前对外名称；若保留 `StyleGen` 和 `Visoryn` 存在冲突，应以架构/PRD 的 Visoryn 口径为准，并避免同时出现两个品牌名。
- 导航至少包含首页、工作台、模板库；使用 pathname 或 href 判断当前入口。
- OAuth 错误提示迁移为轻质 floating 状态，不使用明显重影。
- 保持 `SessionProvider` 消费方式和登录埋点逻辑不变。

#### 2. WorkspaceLayout

- 外层使用 `h-[calc(100vh-var(--header-height))]` 或等价方式避免顶部 header 与工作区重复占满 viewport。
- 背景使用 `--surface-page`，children 区域 `min-w-0`、`overflow-hidden`。
- 不新增全局 shell 组件；保持 App Router 现有布局层级。

#### 3. LeftSidebar

- 去除厚重 `border-r` 表达，改用 tonal layer、ghost border 或内发光。
- Generate / Library 选中态使用轻色 surface + accent 意图，不使用高噪音色块。
- Docs / Help 维持低优先级，不能抢工作区主任务视觉重量。
- 所有按钮支持 hover 和 focus-visible。

#### 4. 跨页面宽屏约束

- 首页、工作台、模板库在 1280px 和 1440px 下都不出现整页横向溢出。
- 工作区左侧导航、中央主任务、历史面板相对位置稳定。
- 模板库复用工作区壳层，Library 导航高亮。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 改造 `AuthHeader` 视觉和导航入口 | frontend | done | 保持登录逻辑和错误提示 |
| 2 | 调整根布局和工作区布局背景 | frontend | done | 避免 header + workspace 高度冲突 |
| 3 | 改造 `LeftSidebar` 选中/hover/focus 状态 | frontend | done | 去除厚边界，接入共享 utility |
| 4 | 编写 shell E2E red spec | frontend | done | 先断言当前深色/缺模板入口状态失败 |
| 5 | 跑通 shell E2E green | frontend | done | 验证首页、工作台、模板库切换 |
| 6 | 运行类型检查和构建 | frontend | done | 确认布局层无类型/构建错误 |

## 验收标准

### 前端验收

- [ ] AC-02 首页、工作台、模板库的顶部导航、背景、品牌入口、用户入口视觉语言一致。
- [ ] AC-02 工作台和模板库的 `LeftSidebar` 当前项高亮准确。
- [ ] AC-03 顶部导航链接、侧边导航按钮、登录入口、错误提示均有清晰 hover/focus/disabled 或 loading 状态。
- [ ] AC-07 1280px 和 1440px 下首页、工作台、模板库无整页横向溢出。
- [ ] AC-07 页面切换时主任务区域不发生大幅漂移。
- [ ] E2E-TDD：`e2e/precision-glass-shell.spec.ts` 先 red 后 green。
- [ ] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-02-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-02-e2e-green-{date}.md`。

### 降级回归验收

- [ ] OAuth 错误提示仍能展示，不被 header 或工作区布局遮挡。
- [ ] 未登录状态下工作台/模板库入口仍给出可理解登录入口。

## 验证命令

```bash
pnpm e2e -- e2e/precision-glass-shell.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-02/AC-07、§4.2 AppShell、§6.4、§7.2 PageLayoutContract
- **相关代码**: `src/app/layout.tsx`、`src/components/auth/auth-header.tsx`、`src/app/workspace/layout.tsx`、`src/components/workspace/left-sidebar.tsx`
- **契约 / 数据对象**: `PageLayoutContract`、`InteractiveState`
- **下游消费方**: FEAT-03、FEAT-04、FEAT-05

## 风险与边界

- **执行顺序**: 先 header，再 workspace layout，再 sidebar，最后 E2E。
- **验证失败排查方向**: 检查 header sticky 高度、workspace layout viewport 高度、pathname 判断和 Playwright 视口配置。
- **允许修改的额外文件**: `e2e/helpers/*`，仅限增加通用导航断言 helper。
- **暂停条件**: 若品牌名冲突需要产品决策且无法从 PRD/架构确定，暂停并报告。
- **E2E 不适用说明**: 不适用；本功能必须有跨页面 E2E。
- **风险备注**: 顶部 header 与工作区左侧导航可能重复，需要通过层级和信息密度区分。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| `/workspace/templates` 高亮错误 | 用 `pathname.startsWith("/workspace/templates")` 覆盖 | done |
| 顶部 header 遮挡 workspace 内容 | 调整布局高度或 padding，确保主区完整 | done |
| 登录加载态闪烁 | 保留现有 loading 避免闪烁逻辑 | done |
| 1280px 下工作区拥挤 | 保持主要区域稳定，必要时局部滚动，不做移动端折叠 | done |
