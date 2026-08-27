---
feat_id: "plan-03"
title: "弹层与菜单焦点原语"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# plan-03: 弹层与菜单焦点原语

## 功能概要

- **目标**: 交付架构 ADR-6 的两个共享交互原语——`ModalDialog`（focus trap / Escape / 焦点还原 / 背景隔离 / 可选禁背景关闭）与 `DropdownMenu`（方向键导航 / Escape / 焦点还原），并建立图标按钮与菜单项 ≥ 44×44px 命中面积标准，供 plan-05/06/07 的保存向导、删除确认、复用预检与更多菜单统一使用。
- **完成后可观察结果**: 仅使用键盘时，ModalDialog 打开后 Tab/Shift+Tab 在弹层内循环、背景控件不可达，Escape 或取消关闭后焦点回到触发元素；`destructive` 变体下点击背景不关闭。DropdownMenu 打开后方向键在菜单项间移动，Escape 关闭并还原触发按钮焦点。全部图标按钮命中面积 ≥ 44×44px。本功能无页面接入，通过组件测试验证。
- **依赖**: 无
- **关联验收标准**: [AC-08]
- **涉及架构模块**: ⑥ 复用与工作区集成模块（交互基建部分）
- **前置条件**: 无（可与 plan-01 并行）。
- **不在范围**: 任何业务弹层的迁移接入（plan-05/06/07 各自完成）；样式主题改造（沿用 `docs/design/DESIGN.md` 与既有 `glass-panel` 类）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/hooks/use-focus-trap.ts` | 焦点陷阱 hook（trap / 还原 / 可聚焦元素查询） |
| create | `src/components/ui/modal-dialog.tsx` | 模态弹层原语 |
| create | `src/components/ui/dropdown-menu.tsx` | 键盘可达下拉菜单原语 |
| create | `src/components/ui/__tests__/modal-dialog.test.tsx` | 组件测试 |
| create | `src/components/ui/__tests__/dropdown-menu.test.tsx` | 组件测试 |

## 实现规格

### 前端部分

#### 1. `use-focus-trap.ts`

```ts
interface UseFocusTrapOptions {
  active: boolean;            // 激活时挂载 trap 并记录先前焦点
  onEscape?: () => void;      // Escape 回调（由消费方决定关闭语义）
  initialFocusRef?: React.RefObject<HTMLElement>; // 打开时聚焦目标，缺省聚焦容器首个可聚焦元素
}
function useFocusTrap(options): { containerRef: React.RefObject<HTMLDivElement> };
```

- **trap 算法**：容器 `keydown` 捕获 Tab / Shift+Tab；可聚焦元素查询 `containerRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')` 过滤 `offsetParent !== null`（可见性）；首元素上 Shift+Tab 跳末元素，末元素上 Tab 跳首元素
- **焦点还原**：`active` 从 false→true 时记录 `document.activeElement`；true→false（或 unmount）时焦点还原到该元素
- **背景隔离**：trap 生效期间背景不可被键盘聚焦（Tab 循环天然保证）；不要求实现 `inert`（首版不引入）

#### 2. `modal-dialog.tsx`

```ts
interface ModalDialogProps {
  open: boolean;
  onClose: () => void;            // Escape / 关闭按钮 / （非 destructive 时）背景点击
  label: string;                  // aria-label（或 labelledBy 二选一）
  labelledBy?: string;
  destructive?: boolean;          // true 时禁用背景点击关闭（删除确认等）
  initialFocusRef?: React.RefObject<HTMLElement>;
  closeOnOverlayClick?: boolean;  // 缺省 true；destructive 强制 false
  children: React.ReactNode;
}
```

- 结构：固定遮罩层 + `role="dialog"` + `aria-modal="true"` 容器，样式沿用既有 `glass-panel` 模式与 `fixed inset-0 z-50`（参照 `save-style-memory-dialog.tsx` 现有视觉，抽公共原语）
- 遮罩 `onClick` 在 `closeOnOverlayClick && !destructive` 时才触发 `onClose`；容器 `stopPropagation`
- 图标关闭按钮：`aria-label` 必填、命中面积 ≥ 44×44px（含 padding/最小宽高类）
- **确认导航约定**（导出为 JSDoc 说明，消费方执行）：确认动作触发 `router.push` 后，目标页面需把初始焦点置于首要内容（`useEffect` 聚焦页面主标题或首屏主容器），满足 PRD 键盘旅程第 4 步

#### 3. `dropdown-menu.tsx`

```ts
interface DropdownMenuProps {
  trigger: { icon?: LucideIcon; label: string };  // label 为可理解名称（aria-label + 可见文本之一）
  items: Array<{
    key: string;
    label: string;
    onSelect: () => void;
    danger?: boolean;           // 删除等危险项的视觉提示（不只依赖颜色，附图标/文字）
  }>;
}
```

- 触发按钮 `aria-haspopup="menu"` + `aria-expanded`；菜单 `role="menu"`，项 `role="menuitem"`
- 键盘：打开后聚焦首项；ArrowDown/ArrowUp 在项间循环；Escape 关闭并把焦点还原到触发按钮；Enter/Space 触发 `onSelect` 后关闭并还原焦点
- 触发按钮与菜单项命中面积 ≥ 44×44px

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | use-focus-trap hook | frontend | done | trap/还原/initialFocus |
| 2 | ModalDialog 原语 | frontend | done | destructive 变体 + 命中面积 |
| 3 | DropdownMenu 原语 | frontend | done | 方向键/Escape/还原 + danger 项 |
| 4 | 组件测试（两个原语） | frontend | done | 覆盖下方验收清单 |

## 验收标准

### 组件验收

- [x] AC-08 ModalDialog 打开后 Tab/Shift+Tab 在弹层内循环，背景按钮不可达（userEvent.tab 断言）
- [x] AC-08 Escape 与关闭按钮触发 `onClose`；关闭后焦点还原到打开前 `activeElement`
- [x] AC-08 `destructive` 变体：点击遮罩不触发 `onClose`；默认变体：点击遮罩触发 `onClose`
- [x] AC-08 DropdownMenu：ArrowDown/ArrowUp 循环导航、Escape 还原触发按钮焦点、Enter 触发 onSelect 后关闭
- [x] AC-08 关闭图标按钮与菜单项 `getBoundingClientRect()` 宽高均 ≥ 44px；全部图标按钮有可理解 `aria-label`
- [x] danger 菜单项同时有视觉标识与文字（不只依赖颜色）
- [x] `pnpm vitest --run src/components/ui/__tests__/modal-dialog.test.tsx src/components/ui/__tests__/dropdown-menu.test.tsx` 通过；`pnpm verify:fast` 通过

## 验证命令

```bash
pnpm vitest --run src/components/ui/__tests__/modal-dialog.test.tsx src/components/ui/__tests__/dropdown-menu.test.tsx
pnpm type-check
pnpm verify:fast
```

## 交接上下文

- **架构章节**: ADR-6（自建原语/零 Radix/命中面积/确认后初始焦点）、§4.2 交互链路（弹层触发→回调→焦点）、§8.6 焦点回归风险
- **相关代码**: `src/components/iterations/save-style-memory-dialog.tsx`（现有手写弹层视觉参照：glass-panel、遮罩、Escape 处理——本功能抽公共原语，迁移由 plan-05/06 执行）
- **契约 / 数据对象**: `ModalDialogProps` / `DropdownMenuProps` / `useFocusTrapOptions`
- **下游消费方**: plan-05（删除确认、更多菜单、代表结果选择器）、plan-06（保存向导）、plan-07（复用预检）

## 风险与边界

- **执行顺序**: 按 Task 列表顺序执行。
- **验证失败排查方向**: jsdom 下 `offsetParent` 恒为 null（可见性过滤需在测试环境退化为 `getClientRects` 判定或测试专用 mock，参照 `@testing-library/user-event` 常规做法）；焦点断言用 `expect(element).toHaveFocus()`。
- **允许修改的额外文件**: 无。
- **暂停条件**: 需要引入第三方焦点管理依赖才能满足验收时（与 ADR-6 冲突，须回架构确认）。
- **E2E 不适用说明**: 纯原语无路由级用户旅程；键盘行为由 plan-05/06/07 的 AC-08 e2e 键盘断言端到端覆盖，本功能以组件测试为质量门。
- **风险备注**: 现有 4 个业务弹层（保存向导、删除确认、预检、更多菜单）的手写 focus 逻辑在 plan-05/06/07 迁移前仍并存，属预期中间态。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 弹层内动态增删可聚焦元素 | trap 每次按键实时查询可聚焦列表 | done |
| 打开时 `initialFocusRef` 指向不可见元素 | 回退聚焦容器本身（tabindex=-1） | done |
| 嵌套弹层（菜单中打开确认层） | 后打开的 trap 接管，关闭后还原到菜单内触发元素 | done |
| prefers-reduced-motion | 遮罩过渡遵循既有 motion-reduce 类约定 | done |
