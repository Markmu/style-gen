---
feat_id: "FEAT-01"
title: "体验基础层与状态契约"
dimension: frontend
phase: 1
status: review
depends_on: []
---

# FEAT-01: 体验基础层与状态契约

## 功能概要

- **目标**: 将全站基础视觉从深色工具基调迁移到 Precision Glass，并建立可复用的交互状态 class、状态文案映射和 StatePresenter 基础组件。
- **完成后可观察结果**: 页面背景、表面、文字、焦点、按钮、输入、卡片和浮层拥有统一 token；状态文案集中描述“正在发生什么”和“还能做什么”；后续首页、工作台、模板库可以消费同一套状态和表面规则。
- **依赖**: 无
- **关联验收标准**: [AC-02, AC-03, AC-06, AC-08]
- **涉及架构模块**: DesignTokenLayer, SharedInteractionPrimitives, StatePresenter
- **前置条件**: 阅读 `docs/design/DESIGN.md`；保留现有 Tailwind CSS 4 和 CSS variable 消费方式。
- **不在范围**: 重绘具体页面、引入完整 UI 组件库、引入 Storybook、改动业务 hooks 或 API。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/globals.css` | 替换深色 token 为 Precision Glass token，补充玻璃表面、焦点、状态、按钮/输入/卡片 utility |
| create | `src/lib/ui/status-copy.ts` | 定义 `ProductStatus`、`StatusCopy` 和统一状态文案映射 |
| create | `src/lib/ui/__tests__/status-copy.test.ts` | 覆盖状态文案完整性、失败恢复动作、tone 合法性 |
| create | `src/components/ui/state-presenter.tsx` | 渲染统一状态标题、说明、主行动、次行动和 tone |
| create | `src/components/ui/__tests__/state-presenter.test.tsx` | 覆盖空态、处理中、失败、未登录、无结果渲染 |

## 实现规格

### 前端部分

#### 1. Precision Glass token

在 `src/app/globals.css` 中定义明亮表面和语义 token，至少覆盖：

- `--surface-base`、`--surface-low`、`--surface-mid`、`--surface-bright`、`--surface-hover`
- `--surface-page`、`--surface-panel`、`--surface-floating`、`--surface-control`、`--surface-media`
- `--text-primary`、`--text-secondary`、`--text-muted`
- `--accent-primary`、`--accent-primary-dim`、`--accent-primary-soft`
- `--border`、`--border-static`、`--border-interactive`
- `--color-error`、`--color-warning`、`--color-success`

实现时保持既有 token 名兼容，避免一次性改坏所有使用 `var(--surface-*)` 的组件。

#### 2. 共享 utility class

补充小而稳定的 utility：

- `.glass-panel`：10-20% 白色填充、>=30px backdrop blur、ghost border、轻微 ambient shadow。
- `.surface-panel`：普通页面区域表面，不使用硬分割。
- `.interactive-lift`：hover/focus 轻微抬升、亮度变化和 focus-visible ring。
- `.media-lens`：图片承载的 aspect-ratio、内发光和轻边界。
- `.btn-primary` / `.btn-secondary`：保留现有类名，但迁移到 Precision Glass 的主/次按钮规则。
- `.input-precision`：底部 hairline、active accent、错误状态。

#### 3. 状态文案契约

在 `src/lib/ui/status-copy.ts` 中实现架构建议的最小 Schema：

```ts
export type ProductStatus =
  | "empty"
  | "loading"
  | "queued"
  | "processing"
  | "success"
  | "failedRecoverable"
  | "restored"
  | "authRequired"
  | "noResults";

export interface StatusCopy {
  status: ProductStatus;
  title: string;
  description: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
}
```

导出 `getStatusCopy(status, overrides?)` 或稳定映射对象。失败类状态必须带恢复 action label。

#### 4. StatePresenter 基础组件

`StatePresenter` 只负责展示，不持有业务状态。建议 props：

```ts
interface StatePresenterProps {
  status: ProductStatus;
  title?: string;
  description?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  compact?: boolean;
}
```

组件需支持页面区域内嵌，不默认创建阻断式 modal。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 迁移 `globals.css` token | frontend | done | 保持既有 token 名兼容，新增 Precision Glass 语义 token |
| 2 | 添加共享表面与交互 utility | frontend | done | glass、surface、interactive、media、button、input |
| 3 | 创建 `status-copy.ts` | frontend | done | 覆盖 ProductStatus 和统一文案 |
| 4 | 创建 `StatePresenter` | frontend | done | 支持内嵌状态、主/次行动和 tone |
| 5 | 编写状态文案单元测试 | frontend | done | 失败状态必须含恢复入口 |
| 6 | 编写 StatePresenter 组件测试 | frontend | done | 覆盖空态、处理中、失败、未登录、无结果 |
| 7 | 运行类型检查和构建 | frontend | done | 确认基础层不会破坏现有页面 |

## 验收标准

### 前端验收

- [ ] AC-02 `globals.css` 中全站 token 已迁移到 Precision Glass 明亮表面，保留现有变量名兼容。
- [ ] AC-03 按钮、输入、卡片、缩略图、浮层具备统一 default / hover / pressed / selected / focus-visible / disabled / processing / error / success 样式入口。
- [ ] AC-06 `failedRecoverable` 文案必须包含可恢复行动，不只报错。
- [ ] AC-08 `empty`、`loading`、`queued`、`processing`、`success`、`failedRecoverable`、`restored`、`authRequired`、`noResults` 均有简洁、确定、可行动文案。
- [ ] `StatePresenter` 不创建全局阻断弹窗，可被页面内局部区域复用。

### 性能验收

- [ ] 不新增大型 UI、动画或远程装饰资源依赖。
- [ ] token 和 utility 改动不引入额外运行时 JS。

### 降级回归验收

- [ ] 若某页面尚未消费 `StatePresenter`，基础层仍不破坏现有错误显示。
- [ ] token 迁移后已有页面不会出现文字不可读或主体背景透明到不可辨认。

## 验证命令

```bash
pnpm vitest --run src/lib/ui/__tests__/status-copy.test.ts src/components/ui/__tests__/state-presenter.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.1、§4.2、§5 ADR-2/ADR-4/ADR-6、§7.1、§7.2、§8.1、§8.2
- **相关代码**: `src/app/globals.css`、`src/app/layout.tsx`
- **契约 / 数据对象**: `ProductStatus`、`StatusCopy`、`InteractiveState`、`SurfaceRole`
- **下游消费方**: FEAT-02、FEAT-03、FEAT-04、FEAT-05

## 风险与边界

- **执行顺序**: 按 Task 列表顺序执行。
- **验证失败排查方向**: 优先检查 CSS 变量名是否破坏现有组件、测试路径是否纳入 Vitest 配置、StatePresenter 是否错误使用浏览器 API。
- **允许修改的额外文件**: `src/app/__tests__/page.test.tsx` 或现有基础页面测试，仅限适配 token 文案导致的稳定断言。
- **暂停条件**: 如果 token 迁移导致大量现有组件不可读且无法通过兼容变量修复，暂停并报告影响面。
- **E2E 不适用说明**: 本功能是内部体验基础层，不直接交付独立用户旅程；以组件测试、类型检查和后续页面 E2E 承接。
- **风险备注**: token 语义变化会影响全站，需要后续页面 FEAT 逐页校验。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 旧组件仍引用 `--surface-mid` | 保留兼容 token，映射到 Precision Glass 表面 | done |
| disabled 状态只降低透明度 | 共享 class 补充 cursor、文字和原因展示入口 | done |
| 状态文案缺恢复动作 | 单测阻断 `failedRecoverable` 无 action label 的情况 | done |
| focus-visible 不明显 | 使用 accent ring 或底部 hairline 变化，满足键盘可见 | done |
