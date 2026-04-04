---
task_id: T03
title: Workspace 组件视觉改造
dimension: frontend
phase: 3
status: in-progress
depends_on: [T01]
---

# T03: Workspace 组件视觉改造（前端）

## 任务概要

- **目标**: 按 PRD 视觉规范改造 Workspace 的 Recipe Card、Generate Panel、Upload Zone，包括技术标签样式统一、Ghost Border 全站一致性
- **依赖**: T01（设计令牌基础建设）必须先完成
- **所属模块**: `src/components/workspace/`
- **前置条件**: T01 已完成且 `globals.css` 包含 `.label-tech` 和完整令牌
- **不在范围**: Landing Page 组件（由 T02 承接）、后端逻辑

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/recipe-card.tsx` | 技术标签样式（.label-tech）、字段图标 |
| modify | `src/components/workspace/generate-panel.tsx` | Aspect Ratio 可视化（待 P1 确认）、Ghost Border 统一 |
| modify | `src/components/workspace/upload-zone.tsx` | 宽屏比例优化、hover 边框效果 |

## 实现规格

### 1. recipe-card.tsx 改造（P0）

**技术标签样式（ADR-3）**

Recipe Card 中所有字段标签应用 `.label-tech` 工具类（ADR-3），统一专业标签风格：

```tsx
// FieldValue 组件改造
function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 label-tech text-[var(--text-secondary)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
```

将 `text-sm` 从标签移到值侧，标签侧使用 `.label-tech`：
- 字号：10px（ADR-3）
- 字重：700 bold
- 大写：uppercase
- 字间距：tracking-widest（0.2em）
- 等宽字体：font-mono

**Section 标题样式**

`RecipeSection` 组件的 `title` 使用 `.label-tech` 样式：

```tsx
function RecipeSection({ title, children }: RecipeSectionProps) {
  return (
    <div className="space-y-2">
      <h4 className="label-tech text-[var(--text-secondary)]">{title}</h4>
      {children}
    </div>
  );
}
```

**保留/可替换标签**

`保留:` 和 `可替换:` 标签同样应用 `.label-tech`：

```tsx
<span className="label-tech text-emerald-400">保留:</span>
<span className="label-tech text-amber-400">可替换:</span>
```

**字段图标（可选增强）**

在关键字段前增加 Material Symbols 图标（使用 `@tabler/icons-react`）：

```tsx
// 示例：subject 字段
<span className="icon mr-1 text-[var(--accent-secondary)]">person</span>
<span className="shrink-0 label-tech text-[var(--text-secondary)]">主体</span>
```

> ⚠️ **注意**：字段图标为可选增强（P0 优先确保 `.label-tech` 样式，P1 再考虑图标）

### 2. generate-panel.tsx 改造（P1）

**Ghost Border 统一（ADR-2）**

将面板边框透明度统一为 15%（默认）：

```tsx
// 现有
className="... ring-1 ring-[var(--border)]"

// 改为（ADR-2：默认 15%）
className="... rounded-lg bg-[var(--surface-mid)] p-4 ring-1 ring-[var(--border)]/15"
```

**Aspect Ratio 可视化（待 P1 确认）**

在 Aspect Ratio 选择按钮旁增加当前比例的可视化预览框：

```tsx
// 在宽高比选择器上方增加预览
<div className="mb-3 flex items-center justify-center">
  <div
    className="bg-[var(--accent-primary)]/20 ring-1 ring-[var(--accent-primary)]/30"
    style={{
      width: "48px",
      aspectRatio: aspectRatio.replace(":", "/"),
    }}
  />
</div>
```

> ⚠️ **注意**：此功能为 P1 待确认，需判断是否在本期内实现。如不实现，跳过此 Task。

### 3. upload-zone.tsx 改造（P0）

**宽屏比例优化**

将上传区容器的 `p-10` 调整为更宽屏的比例（PRD P0）：

```tsx
className={`... p-8 md:p-12 text-center transition-colors ${...}`}
```

**hover 边框效果（ADR-2）**

将上传区边框从 `border-dashed border-[var(--border)]` 改为动态 border：

```tsx
// 默认状态
className={`... border-dashed border-[var(--border)]/15 ... ${...}`}

// hover 状态（已有）
hover:border-[var(--accent-primary)]/30

// drag-over 状态（已有）
border-[var(--accent-primary)] bg-[var(--accent-primary)]/10
```

**预览区 Ghost Border**

上传完成后的图片预览区边框同样应用 ADR-2：

```tsx
className="... rounded-xl overflow-hidden ring-1 ring-[var(--border)]/15"
```

**替换按钮 Ghost Border**

```tsx
className="... ring-1 ring-[var(--border)]/15 transition-colors hover:bg-[var(--surface-bright)]"
```

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 改造 `recipe-card.tsx`：所有字段标签应用 `.label-tech` | done | ADR-3 核心改造 |
| 2 | 改造 `recipe-card.tsx`：Section 标题应用 `.label-tech` | done | 标题同样使用工具类 |
| 3 | 改造 `recipe-card.tsx`：保留/可替换标签应用 `.label-tech` | done | 颜色保持不变 |
| 4 | 改造 `generate-panel.tsx`：面板边框统一 `/15` | done | ADR-2 Ghost Border 统一 |
| 5 | 改造 `generate-panel.tsx`：Aspect Ratio 可视化预览框 | waived | P1 待确认 |
| 6 | 改造 `upload-zone.tsx`：默认 border 透明度 `/15` | done | ADR-2 |
| 7 | 改造 `upload-zone.tsx`：预览区 border 透明度 `/15` | done | ADR-2 |
| 8 | 改造 `upload-zone.tsx`：替换按钮 border 透明度 `/15` | done | ADR-2 |
| 9 | `pnpm type-check` 无错误 | done | 验证修改后类型正确 |
| 10 | `pnpm test --run src/components/workspace/__tests__/` 无回归 | done | 验证现有测试通过 |

## 验证命令

```bash
pnpm type-check
pnpm test --run src/components/workspace/__tests__/
```

## 预期结果

- Recipe Card 所有标签使用 `.label-tech` 样式（10px/700/uppercase/tracking-widest/font-mono）
- Generate Panel 和 Upload Zone 全站 Ghost Border 透明度统一为 `/15`
- `pnpm type-check` 通过
- `pnpm test` 无回归

## 交接上下文

- **架构章节**: §2.1 P0 范围、§5.1 模块职责、§7.1 ADR-2/3、§9.2 Phase C
- **相关代码**: `src/app/globals.css`（T01 产物）
- **契约 / 数据对象**: 无
- **消费的上游契约摘要**: T01 的 `.label-tech` 工具类和 `--border` token

## 执行指引

- **工具链**: Next.js + Tailwind CSS 4
- **执行顺序**: Task 1-3（recipe-card）优先完成；Task 4-8（Ghost Border 改造）可与 recipe-card 并行处理
- **提交规范**: 每个改造组件**单独提交**（`git add src/components/workspace/xxx.tsx`），便于针对性回滚；`globals.css` 改动已在 T01 提交
- **阻塞处理**: Aspect Ratio 可视化如 P1 不确认，将 Task 5 标记为 `waived` 并写明原因，继续后续任务
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - `type-check` 报错：检查 `.label-tech` 类名拼写
  - `test` 失败：snapshot 需更新（`pnpm test --update`）或检查回归
- **允许修改的额外文件**: `src/components/workspace/__tests__/` 中的快照文件
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- `.label-tech` 类未在 globals.css 中定义时，T01 未完成；需先确认 T01 状态
- Aspect Ratio 可视化为 P1 待确认，实现前需向产品确认

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| `.label-tech` 在小屏溢出 | 添加 `overflow-hidden` 或 `whitespace-nowrap` | todo |
| Recipe Card 空字段处理 | `FieldValue` 组件已有空值处理逻辑，不需改动 | todo |
| Ghost Border 低对比度 | 边框自动降级为更透明 | todo |
| 生成按钮 disabled 状态 | 保持原有 disabled 样式不变 | todo |
| 新增文本对比度验证 | 抽查主要文本色组合（`--text-primary` on `--surface-base`、`--text-secondary` on `--surface-mid`）满足 WCAG AA 4.5:1，可使用浏览器 axe 插件或 DevTools | todo |
