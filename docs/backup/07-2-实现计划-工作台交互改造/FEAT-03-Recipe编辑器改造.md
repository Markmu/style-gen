---
feat_id: "FEAT-03"
title: "Recipe 编辑器改造"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# FEAT-03: Recipe 编辑器改造（前端）

## 功能概要

- **目标**: 新建 RecipeEditor 组件替代现有 RecipeStep，实现 4 行可编辑摘要模式（Subject/Style/Lighting/Composition），每行支持内联编辑，同时保留展开完整配方查看能力。编辑 Recipe 不自动重新生成 Prompt。
- **依赖**: 无
- **涉及架构模块**: RecipeEditor (ui)
- **前置条件**: 无
- **不在范围**: Recipe 编辑持久化到后端（ADR-9: V1 为本地状态）、Recipe Schema 变更、批量编辑

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/constants/recipe-row-mapping.ts` | Recipe 4 行映射常量定义 |
| create | `src/components/workspace/recipe-editor.tsx` | Recipe 4 行编辑器组件（替代 RecipeStep） |
| modify | `src/app/workspace/page.tsx` | 替换 RecipeStep → RecipeEditor（import + props 接线） |

> 注意：workspace page.tsx 的布局改造已在 FEAT-01 中完成，本功能仅替换其中的 RecipeStep 引用。

## 实现规格

### 1. Recipe 4 行映射常量（`src/lib/constants/recipe-row-mapping.ts`）

```typescript
export const RECIPE_ROW_MAPPING = [
  { key: 'subject',     label: 'Subject',     fields: ['subject', 'scene'] },
  { key: 'style',       label: 'Style',       fields: ['styleTags', 'mood', 'texture'] },
  { key: 'lighting',    label: 'Lighting',    fields: ['lighting', 'color'] },
  { key: 'composition', label: 'Composition', fields: ['composition', 'cameraLanguage'] },
] as const

export const RECIPE_EXTRA_FIELDS = [
  'imageSummary', 'visualKeywords', 'mustKeep', 'replaceable'
] as const

export type RecipeRowKey = typeof RECIPE_ROW_MAPPING[number]['key']
```

**设计依据**: ADR-10 — 映射关系是纯前端 UI 层决策，硬编码常量避免分散在组件中。

### 2. RecipeEditor 组件（`src/components/workspace/recipe-editor.tsx`）

新建客户端组件，替代 `RecipeStep`（325 行）。

**Props**:
```typescript
interface RecipeEditorProps {
  recipe: VisualRecipe | null
  onChange?: (recipe: VisualRecipe) => void  // 编辑后的回调
  degraded?: boolean                        // 降级标记（延续现有逻辑）
}
```

**UI 结构**：
```
┌──────────────────────────────────────┐
│  📋 风格拆解                          │  ← 标题
│                                      │
│  Subject   场景描述文本...     ✏️     │  ← 第1行：截断 ~60字符 + 编辑图标
│  Style     现代/极简/温暖...   ✏️     │  ← 第2行
│  Lighting  自然光/暖色调...    ✏️     │  ← 第3行
│  Composition 低角度/广角...    ✏️     │  ← 第4行
│                                      │
│  [查看完整配方 ▼]                     │  ← 展开/收起按钮
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ← 展开后的只读区域
│  Image Summary: ...                   │
│  Visual Keywords: tag1, tag2, ...     │
│  Must Keep: ...                       │
│  Replaceable: ...                     │
└──────────────────────────────────────┘
```

**交互规则**：
- 每行默认显示截断文本（~60 字符）+ 右侧编辑图标
- 点击编辑图标 → 该行就地展开为子字段编辑区（每个 field 一个 input/textarea）
- 同时只能展开一行编辑（`expandedRow` state）：点击另一行时自动收起当前行
- 编辑完成后（blur 或 Enter）更新本地 VisualRecipe 对象，调用 `onChange` 回调
- 底部"查看完整配方"按钮 toggle 展示剩余只读维度（RECIPE_EXTRA_FIELDS）
- **编辑 Recipe 不自动重新生成 Prompt**（ADR-10 核心约束）
- 降级提示逻辑延续 RecipeStep 的 L1/L3/L4 处理

**展开编辑区示例**（以 Style 行为例）：
```
Style
  Style Tags:  [现代, 极简, 温暖    ]  ← tags input
  Mood:       [舒适                ]  ← text input
  Texture:    [光滑                ]  ← text input
                                    [✓ 完成]
```

**与 RecipeStep 的差异对照**:

| 能力 | RecipeStep（旧） | RecipeEditor（新） |
| --- | --- | --- |
| 展示模式 | 5 字段平铺 + 展开详情 | 4 行摘要 + 内联编辑 |
| 编辑能力 | 只读展示 | 每行可内联编辑子字段 |
| 交互模型 | 展开/收起详情区 | 摘要行 + 单行展开编辑 + 完整配方展开 |
| 数据流向 | 只读 | 本地编辑 → onChange 回调 |
| 降级处理 | L1/L3/L4 提示 | 保持一致 |

### 3. Workspace Page 接线（修改 `workspace/page.tsx`）

在 FEAT-01 布局改造的基础上，最小化改动：

- import 从 `@/components/workspace/recipe-step` 改为 `@/components/workspace/recipe-editor`
- 传入 `recipe` 和 `onChange` prop
- `onChange` 回调更新本地 recipe state（用于传递给 Prompt 编辑器的上下文）
- 不改变页面布局结构（FEAT-01 已处理）

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 创建 `recipe-row-mapping.ts` 常量 | frontend | done | 4 行映射 + extra fields 定义 |
| 2 | 创建 `recipe-editor.tsx` 组件 | frontend | done | 4 行摘要 + 内联编辑 + 完整配方展开 + 降级处理 |
| 3 | 改造 `workspace/page.tsx` 接线 | frontend | done | 替换 import RecipeStep → RecipeEditor + props 接线 |
| 4 | 降级逻辑迁移验证 | frontend | done | 确认 L1/L3/L4 降级提示从 RecipeStep 完整迁移 |
| 5 | 视觉验证 | frontend | done | 浏览器验证：分析完成后 RecipeEditor 正确显示 4 行 + 编辑交互 |

## 验收标准

### 前端验收

- [ ] RecipeEditor 正确渲染 4 行摘要，每行显示截断文本 + 编辑图标
- [ ] 每行点击编辑图标后该行就地展开为子字段编辑区
- [ ] 同时只能展开一行编辑（点击另一行自动收起当前行）
- [ ] 编辑完成后（blur/Enter）更新本地 VisualRecipe，触发 onChange 回调
- [ ] "查看完整配方"展开后显示剩余只读字段（imageSummary, visualKeywords, mustKeep, replaceable）
- [ ] 编辑 Recipe 不触发 Prompt 重新生成
- [ ] 降级提示（L1/L3/L4）与原 RecipeStep 行为一致
- [ ] recipe 为 null 时显示空态提示"上传参考图开始分析"
- [ ] `pnpm type-check && pnpm lint && pnpm build` 通过

## 验证命令

```bash
pnpm type-check
pnpm lint
pnpm build
```

## 预期结果

功能完成后，分析完成后的决策面板中原有的 RecipeStep 组件被 RecipeEditor 替代。RecipeEditor 以 4 行可编辑摘要形式展示 VisualRecipe：Subject/Style/Lighting/Composition 每行显示截断文本（~60 字符）和编辑图标，点击任一行的编辑图标后该行就地展开为子字段编辑区（同时只展开一行），用户可逐字段修改 Recipe 内容。修改后通过 onChange 回调更新父组件的本地 VisualRecipe 状态，**不自动触发 Prompt 重新生成**。底部"查看完整配方"按钮可展开剩余只读维度（imageSummary、visualKeywords 等）。当 VisualRecipe 为 null（尚未分析）时显示空态提示。降级场景（L1 排队/L3 风格拆解失败/L4 分析不可用）的提示行为与原 RecipeStep 完全一致。

## 交接上下文

- **架构章节**: §4.2 RecipeEditor 模块职责, §5 ADR-10, §9 Phase B 前端部分
- **相关代码**:
  - `src/components/workspace/recipe-step.tsx`（被替代的组件，325 行，需参考其降级处理逻辑）
  - `src/app/workspace/page.tsx`（接线目标，FEAT-01 已改造过布局）
  - `src/types/models.ts`（VisualRecipe 类型定义）
- **下游消费方**: FEAT-02（history_restored 时加载 recipe 到 RecipeEditor）

## 执行指引

- **工具链**: React 19, TypeScript, Tailwind CSS 4
- **执行顺序**: Task 1 → 2 → 3 → 4 → 5
- **阻塞处理**: 如果 RecipeStep 的降级逻辑复杂度高，优先保证只读展示和编辑功能正确，降级处理可在后续迭代完善
- **完成信号**: 浏览器验证通过 + 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 RECIPE_ROW_MAPPING 字段名是否与 VisualRecipe 类型一致、expandedRow 状态管理是否正确、onChange 回调是否正确触发
- **允许修改的额外文件**: `src/types/models.ts`（补充 VisualRecipe 相关类型别名）、`src/lib/ai/prompts.ts`（如需参考 recipe 字段名）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- RecipeStep 有 325 行且包含完整的降级逻辑，需确保降级处理完整迁移到 RecipeEditor
- 本功能可与 FEAT-01 并行开发（均为纯前端，互不依赖），但 workspace page.tsx 的改动会冲突——建议 FEAT-01 先合并或协调 page.tsx 的改动顺序
- 映射常量是纯前端逻辑，但需与 PRD 中的 4 行定义严格一致

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| recipe 为 null（尚未分析） | 显示空态提示"上传参考图开始分析" | done |
| 某行所有子字段为空/null | 该行显示"—"占位，编辑图标保留 | done |
| 用户快速连续点击多行编辑 | 只有最后一行的编辑区展开 | done |
| 编辑后未点"完成"就点击其他行 | 当前行 blur 自动保存，新行展开 | done（通过 expandedRow 切换 + 完成按钮） |
| VisualRecipe 缺少某映射字段 | 该字段显示为空，不 crash | done（通过 unknown 断言安全访问） |
| onChange 未传入（父组件不需要编辑） | 编辑功能禁用（隐藏编辑图标），退化为只读模式 | done（isEditable 检查） |
| 超长文本截断 | 截断 ~60 字符 + 省略号，tooltip 显示完整文本 | done（truncate 函数 + title 属性） |
