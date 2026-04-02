---
task_id: T01
title: 设计令牌基础建设
dimension: frontend
phase: 1
status: review
depends_on: []
---

# T01: 设计令牌基础建设（前端）

## 任务概要

- **目标**: 在 `globals.css` 中补充完整的设计令牌体系（ADR-1/2/4），为后续所有组件改造提供样式基础设施
- **依赖**: 无
- **所属模块**: `globals.css`（基础设施层）
- **前置条件**: 无
- **不在范围**: 任何组件文件的样式修改（由 T02/T03 承接）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/globals.css` | 补充 `.label-tech` 工具类、`--gradient-primary` token |

## 实现规格

### 1. `.label-tech` 工具类

在 `globals.css` 中追加 `.label-tech` 工具类定义（ADR-3）：

```css
/* ── Technical Label ── */
.label-tech {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.2em; /* tracking-widest */
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

### 2. `--gradient-primary` token

在 `:root` 中追加 Hero radial-gradient 专用 token（ADR-4）：

```css
--gradient-primary: rgba(186, 158, 255, 0.15); /* brand purple, rgba format for radial-gradient */
```

### 3. 确认已有 token

确认以下 token 已存在且值正确（参考架构文档 §7.1）：

```css
--surface-base: #060e20;
--surface-low: #091328;
--surface-mid: #0f1930;
--surface-bright: #1f2b49;
--text-primary: #dee5ff;
--text-secondary: #8b9cc8;  /* 注意：架构文档定义 #8b9cc8，需与当前值 #a3aac4 核对后统一 */
--accent-primary: #ba9eff;
--accent-secondary: #53ddfc;
--border: #40485d;
```

> ⚠️ **注意**：`--text-secondary` 当前值 `#a3aac4`，架构文档 §7.1 定义为 `#8b9cc8`。需判断是否统一——两者对比度均满足 WCAG AA（4.5:1），但建议以架构文档为准以保持一致性。

### 4. 验证 token 正确性

所有 CSS 变量通过浏览器 DevTools 验证：
- 背景色正确应用 `var(--surface-*)`
- 文字色正确应用 `var(--text-*)`
- 边框正确应用 `border-[var(--border)]`

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 确认 `--text-secondary` 目标值 | todo | 架构文档 #8b9cc8 vs 当前 #a3aac4，选定后更新 |
| 2 | 在 `:root` 中追加 `--gradient-primary` | todo | 值：`rgba(186, 158, 255, 0.15)` |
| 3 | 在 `globals.css` 末尾追加 `.label-tech` 工具类 | todo | 样式：10px/700/uppercase/0.2em/monospace |
| 4 | 验证所有 token 在页面渲染正确 | todo | 用浏览器 DevTools 抽查 Landing Page |
| 5 | `pnpm type-check` 无错误 | todo | 确认 CSS 变量修改未破坏构建 |
| 6 | `pnpm build` 验证 bundle size 基线 | todo | 记录改造前 gzipped size（参考值），确保后续改造不超过 +5KB |

## 验证命令

```bash
pnpm type-check
pnpm build 2>&1 | grep -E "(Route|Page)"   # 记录各页面 gzipped size 基线（参考值，不作硬性断言）
```

> **Bundle Size 约束**（来自架构 §8.1）：视觉改造不使 Bundle Size 增加超过 5KB（gzipped）。T01 记录基线，后续 T02/T03 完成后再次执行 `pnpm build` 对比，确认增量在 5KB 以内。

## 预期结果

- `globals.css` 包含完整的令牌体系（所有 `--surface-*`、`--text-*`、`--accent-*`、`--border`、`--gradient-primary`）
- `.label-tech` 类定义在 `globals.css` 末尾
- `pnpm type-check` 通过

## 交接上下文

- **架构章节**: §7.1 设计令牌定义
- **相关代码**: 所有引用 CSS 变量的组件文件（T02/T03）
- **契约 / 数据对象**: 无（纯样式层）
- **消费的上游契约摘要**: 无

## 执行指引

- **工具链**: CSS 变量编辑器 + 浏览器 DevTools
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: `--text-secondary` 值分歧时，在 TASK 1 中记录决策理由后选定值
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 CSS 变量拼写是否与组件引用一致（注意 `--text-secondary` vs `--text-primary`）
- **允许修改的额外文件**: 无
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- `--text-secondary` 色值分歧：如果保持当前 `#a3aac4`，需在 README 未决策项中记录；如果改为 `#8b9cc8`，需同步更新所有引用该变量的组件

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| token 值与组件现有引用不匹配 | 以架构文档为准更新 token 值 | todo |
| 新增 token 名称与现有变量冲突 | 检查 `:root` 块，确保无重复定义 | todo |
