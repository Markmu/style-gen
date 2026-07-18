---
task_id: T02
title: Landing Page 视觉改造
dimension: frontend
phase: 2
status: done
depends_on: [T01]
---

# T02: Landing Page 视觉改造（前端）

## 任务概要

- **目标**: 按 PRD 视觉规范改造 Landing Page 全部组件，包括 Hero 重构、功能卡片增强、导航栏增强、底部区域新增
- **依赖**: T01（设计令牌基础建设）必须先完成
- **所属模块**: `src/components/landing/` + `src/components/auth/`
- **前置条件**: T01 已完成且 `globals.css` 包含完整令牌
- **不在范围**: Workspace 组件（由 T03 承接）、后端逻辑

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/landing/hero.tsx` | radial-gradient 背景、徽章标签、双 CTA |
| modify | `src/components/landing/value-section.tsx` | 功能卡片底部装饰区、hover 效果 |
| modify | `src/components/auth/auth-header.tsx` | 功能链接 + Material Symbols 图标 |
| create | `src/components/landing/stats-section.tsx` | 数据统计区：左右布局（文案 + 数据卡） |
| create | `src/components/landing/bottom-cta.tsx` | 底部 CTA：深底浅字反转按钮 |
| create | `src/components/landing/footer.tsx` | Footer：版权和链接 |
| modify | `src/app/page.tsx` | 引入 stats-section、bottom-cta、footer 组件 |

## 实现规格

### 1. hero.tsx 改造（P0）

**Radial Gradient 背景**

在 `<section>` 外层容器上叠加 radial-gradient 背景（ADR-4）：

```tsx
// 方案 A：在 section 上用 Tailwind arbitrary value（推荐）
<section className="relative ...">
// 背景通过 ::before 或直接内联 style
```

使用 `bg-[radial-gradient(ellipse_at_top,_var(--gradient-primary)_0%,_var(--bg-base)_70%)]`

> ⚠️ **注意**：当前 hero.tsx 无背景，径向渐变需覆盖整个 Hero 区域，确保底部与页面自然衔接。

**徽章标签（Badge）**

Hero 顶部增加产品定位徽章：

```tsx
<span className="mb-4 inline-block rounded-full border border-[var(--border)]/15 bg-[var(--surface-mid)] px-3 py-1 text-xs text-[var(--text-secondary)]">
  AI 视觉风格分析工具
</span>
```

**双 CTA 按钮**

保留"开始创作"主 CTA，增加次要 CTA 引导查看示例：

```tsx
<div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
  <Link href="/workspace" className="btn-glow ...">开始创作</Link>
  <Link href="/#features" className="rounded-xl border border-[var(--border)]/15 px-6 py-3 text-base font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)]/30 hover:text-[var(--text-primary)]">
    查看示例
  </Link>
</div>
```

### 2. value-section.tsx 改造（P0）

**功能卡片 hover 效果**

现有卡片仅 `rounded-xl`，增加 hover 效果（PRD §2.1 P0）：

```tsx
className="... transition-all duration-300 hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-bright)]"
```

**底部装饰区**

在每个功能卡片底部增加装饰条：

```tsx
// 在卡片内容末尾追加
<div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-[var(--border)]/30 to-transparent" />
```

### 3. auth-header.tsx 改造（P1）

**功能链接 + Material Symbols 图标**

在 Logo 和登录按钮之间增加功能链接（PRD §2.1 P1）：

```tsx
<nav className="hidden items-center gap-6 md:flex">
  <Link href="/#features" className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
    功能
  </Link>
  <Link href="/workspace" className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
    工作台
  </Link>
</nav>
```

使用 Material Symbols Rounded 图标（已有的 `@material-symbols` 包），链接左侧可加图标：

```tsx
<Link ...>
  <span className="icon text-base">explore</span>
  功能
</Link>
```

> ⚠️ **注意**：`@tabler/icons-react` 已配置但 Material Symbols 需确认是否已在项目依赖中。优先使用 `@tabler/icons-react` 的等价图标（如 `IconCompass` → `tabler:compass`）。

### 4. stats-section.tsx 新建（P1）

左右布局的数据统计区：

```tsx
// 左侧文案
<h2 className="text-3xl font-bold text-[var(--text-primary)]">
  已帮助 10,000+ 设计师快速提取视觉风格
</h2>

// 右侧数据卡网格
<div className="grid grid-cols-2 gap-4">
  <div className="rounded-xl bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]">
    <p className="text-2xl font-bold text-[var(--accent-primary)]">10,000+</p>
    <p className="text-sm text-[var(--text-secondary)]">已生成图片</p>
  </div>
  ...
</div>
```

### 5. bottom-cta.tsx 新建（P1）

深底浅字反转按钮区域：

```tsx
<section className="bg-[var(--surface-mid)] ...">
  <h2 className="text-3xl font-bold text-[var(--text-primary)]">准备好开始了吗？</h2>
  <Link href="/workspace"
    className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-8 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90">
    开始创作
  </Link>
</section>
```

### 6. footer.tsx 新建（P2）

```tsx
<footer className="border-t border-[var(--border)]/15 py-8 text-center">
  <p className="text-sm text-[var(--text-secondary)]">
    © 2026 Visoryn · 基于 AI 的视觉风格分析工具
  </p>
  <div className="mt-3 flex justify-center gap-6">
    <Link href="#" className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">关于</Link>
    <Link href="#" className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">隐私</Link>
  </div>
</footer>
```

### 7. page.tsx 更新

在 `src/app/page.tsx` 中引入并放置新增组件：

```tsx
import { StatsSection } from "@/components/landing/stats-section";
import { BottomCta } from "@/components/landing/bottom-cta";
import { Footer } from "@/components/landing/footer";
```

页面结构：
```
<AuthHeader />
<Hero />
<ValueSection />
<StatsSection />          {/* 新增 */}
<BottomCta />            {/* 新增 */}
<Footer />               {/* 新增 */}
```

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 改造 `hero.tsx`：radial-gradient 背景 | done | 使用 `--gradient-primary` token |
| 2 | 改造 `hero.tsx`：徽章标签 | done | border/15 微妙 Ghost Border |
| 3 | 改造 `hero.tsx`：双 CTA 按钮 | done | 次要 CTA 使用 Ghost Border 样式 |
| 4 | 改造 `value-section.tsx`：hover 效果 + 底部装饰区 | done | 300ms ease transition |
| 5 | 改造 `auth-header.tsx`：功能链接 + 图标 | done | 确认 Material Symbols 或用 @tabler |
| 6 | 新建 `stats-section.tsx` | done | P1，左右布局 |
| 7 | 新建 `bottom-cta.tsx` | done | P1，深底浅字反转按钮 |
| 8 | 新建 `footer.tsx` | done | P2，版权和链接 |
| 9 | 更新 `page.tsx` 引入新组件 | done | 确保组件顺序正确 |
| 10 | `pnpm type-check` 无错误 | done | 验证新增/修改文件类型正确 |

## 验证命令

```bash
pnpm type-check
pnpm test --run src/components/landing/__tests__/
```

## 预期结果

- Landing Page 包含完整的 Hero + 功能区 + 统计区 + CTA + Footer
- Hero 有 radial-gradient 背景和徽章标签
- 功能卡片有 hover 动画和底部装饰条
- 导航栏有功能链接和图标
- `pnpm type-check` 通过

## 交接上下文

- **架构章节**: §2.1 范围、§5.1 模块职责、§9.2 Phase B
- **相关代码**: `src/app/globals.css`（T01 产物）、`src/app/page.tsx`
- **契约 / 数据对象**: 无
- **消费的上游契约摘要**: T01 的 CSS 令牌（`--gradient-primary`、`.label-tech`）

## 执行指引

- **工具链**: Next.js + Tailwind CSS 4
- **执行顺序**: Task 1-5（P0/P1 已有组件）优先完成；Task 6-9（新建组件）可并行处理
- **提交规范**: 每个改造/新建组件**单独提交**（`git add src/components/.../xxx.tsx`），便于针对性回滚；`globals.css` 改动单独提交
- **阻塞处理**: Material Symbols 不可用时，改用 `@tabler/icons-react` 等价图标
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - `type-check` 报错：检查新增组件的 TypeScript 类型是否正确导入
  - `test` 失败：检查现有测试快照是否因样式变化而需要更新（`pnpm test --update`）
- **允许修改的额外文件**: `src/components/landing/__tests__/` 中的快照文件
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Material Symbols 确认：检查 `package.json` 确认依赖，优先使用 `@tabler/icons-react`
- `stats-section.tsx` 和 `bottom-cta.tsx` 数据内容（"10,000+"等）目前为占位符，待产品确认真实数据

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| Hero gradient 低对比度屏幕 | CSS 自动降级为纯 `bg-[var(--surface-base)]` | done |
| Ghost Border 不可见 | 边框自动降级 | done |
| 功能卡片小屏适配 | 保持 `md:grid-cols-3` 响应式 | done |
| 新组件 TypeScript 类型 | 确保 Props 接口定义完整 | done |
| 新增文本对比度验证 | 抽查主要文本色组合（`--text-primary` on `--surface-base`、`--text-secondary` on `--surface-mid`）满足 WCAG AA 4.5:1，可使用浏览器 axe 插件或 DevTools | done |
