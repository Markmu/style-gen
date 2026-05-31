---
feat_id: "PLAN-02"
title: "参考图与分析摘要卡片"
dimension: frontend
phase: 2
status: done
depends_on: ["PLAN-01"]
---

# PLAN-02: 参考图与分析摘要卡片

## 功能概要

- **目标**: 实现 ReferenceCard 完整功能（上传、图片展示、分析进度、5 维度分析摘要）和 RecipeCard 完整功能（5 分类模块展示），创建分析摘要和配方分类工具函数。
- **完成后可观察结果**: 用户上传参考图后，ReferenceCard 显示图片并在底部展示 5 个维度的分析摘要（Style/Material/Lighting/Composition/Mood），每个维度含图标、维度名、匹配值和百分比条。RecipeCard 显示 5 个分类模块（Structure/Materials/Lighting/Color Palette/Mood & Atmosphere），每个含图标、分类名和描述。分析过程中 ReferenceCard 显示加载态、RecipeCard 显示骨架屏。分析失败时 ReferenceCard 显示错误信息和重试按钮。
- **依赖**: PLAN-01（三列骨架和模式切换）
- **关联验收标准**: [AC-02, AC-03]
- **涉及架构模块**: ReferenceCard, RecipeCard, analysis-summary.ts, recipe-categories.ts
- **前置条件**: 三列布局已就绪，ReferenceCard 和 RecipeCard 基础壳已渲染
- **不在范围**: PromptCard 编辑器集成、FloatingGenerateButton、HistoryStrip、HistoryDetailDialog

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/reference-card.tsx` | 完整实现：有图态 + 5 维度分析摘要 + 错误态 |
| modify | `src/components/workspace/recipe-card.tsx` | 完整实现：5 分类模块展示 + "复制到提示词"按钮预留 |
| create | `src/lib/analysis-summary.ts` | extractAnalysisSummary 工具函数 |
| create | `src/lib/recipe-categories.ts` | extractRecipeCategories 工具函数 |
| modify | `src/app/workspace/page.tsx` | 接入分析摘要和配方分类数据到卡片 props |
| create | `src/lib/__tests__/analysis-summary.test.ts` | 分析摘要工具函数测试 |
| create | `src/lib/__tests__/recipe-categories.test.ts` | 配方分类工具函数测试 |

## 实现规格

### 前端部分

#### 1. extractAnalysisSummary 工具函数

从 VisualRecipe 提取 5 维度分析摘要（ADR-3：前端提取，不扩展 API）。

- 输入：`recipe: VisualRecipe | null`
- 输出：`DimensionScore[]`（5 项）
- 5 个维度：Style / Material / Lighting / Composition / Mood
- 每个维度包含：`dimension`、`label`、`value`（从 recipe 字段提取的描述文本）、`percentage`（0-100）、`iconColor`
- 启发式算法：对 recipe 各字段文本长度归一化为百分比，使用确定性规则（字段长度比 + 关键词计数），不做 AI 二次调用
- recipe 为 null 时返回空数组

#### 2. extractRecipeCategories 工具函数

从 VisualRecipe 提取 5 分类模块数据。

- 输入：`recipe: VisualRecipe | null`
- 输出：`RecipeCategory[]`（5 项）
- 5 个分类：Structure / Materials / Lighting / Color Palette / Mood & Atmosphere
- 每个分类包含：`category`、`label`、`description`（从 recipe 对应字段提取）、`iconColor`
- recipe 为 null 时返回空数组

#### 3. ReferenceCard 完整实现

在基础壳上增加完整功能。

- 有图态：卡片头部（标题"Reference" + 帮助图标 + "更换图片"按钮 + 更多选项三态点）→ 参考图全宽展示 → 分析摘要区（5 维度评分行：图标 + 维度名 + 匹配值 + 百分比条）→ "查看完整分析"链接
- 分析中：图片下方显示分析加载态（pulse 动画）
- 分析失败：图片下方显示错误信息 + "重新分析"按钮
- 新增 props：`recipe: VisualRecipe | null`、`error`、`degradation`、`onRetry`
- 使用 `extractAnalysisSummary(recipe)` 计算 5 维度摘要

#### 4. RecipeCard 完整实现

在基础壳上增加 5 分类展示。

- 有数据态：卡片头部（标题"Visual Recipe" + 帮助图标 + 编辑按钮（P2 预留，回调为空））→ 5 个分类折叠模块（图标 + 分类名 + 描述）→ 底部"复制配方到提示词"按钮（P2 预留）
- 分类数据使用 `extractRecipeCategories(recipe)` 计算
- 5 个分类用 map 渲染，不拆分为独立组件文件（架构 §4.3）

#### 5. page.tsx 接线

在 page.tsx 中接入分析摘要和配方分类数据。

- ReferenceCard 新增 props：`recipe`、`error`、`degradation`、`onRetry`
- RecipeCard 新增 props：`recipe`（透传 ws.recipe）
- 传入 `handleRetry` 给 ReferenceCard

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 analysis-summary 和 recipe-categories 单元测试 | frontend | done | 覆盖 5 维度提取、5 分类提取、空值处理、百分比计算 |
| 2 | 实现 extractAnalysisSummary 工具函数 | frontend | done | 从 VisualRecipe 提取 DimensionScore[] |
| 3 | 实现 extractRecipeCategories 工具函数 | frontend | done | 从 VisualRecipe 提取 RecipeCategory[] |
| 4 | 完善 ReferenceCard 有图态 + 分析摘要 + 错误态 | frontend | done | 卡片头部 + 5 维度评分行 + "重新分析"按钮 |
| 5 | 完善 RecipeCard 5 分类展示 | frontend | done | 分类模块 + "复制到提示词"按钮预留 |
| 6 | 改造 page.tsx 接入分析数据 | frontend | done | 传入 recipe/error/degradation/onRetry 给卡片 |
| 7 | 单元测试和构建验证 | frontend | done | pnpm test + pnpm type-check + pnpm build |

## 验收标准

### 功能验收

- [x] AC-02 上传参考图后，ReferenceCard 显示图片并在底部展示 5 维度分析摘要（Style/Material/Lighting/Composition/Mood）
- [x] AC-02 分析完成后，RecipeCard 显示 5 个分类模块（Structure/Materials/Lighting/Color Palette/Mood & Atmosphere）
- [x] AC-02 分析中，ReferenceCard 显示加载态（pulse 动画），RecipeCard 显示骨架屏
- [x] AC-02 分析失败，ReferenceCard 显示错误信息 + "重新分析"按钮
- [x] AC-03 5 个分类均显示图标和描述文本
- [x] AC-03 "复制配方到提示词"按钮可见但功能预留（P2）
- [x] E2E-TDD：上传参考图 → 分析完成 → ReferenceCard 展示摘要 + RecipeCard 展示分类（`e2e/workspace-reference-recipe.spec.ts`，red 先失败，green 后通过）

### 性能验收（架构 §8.1 目标）

- [x] 分析摘要评分计算为纯前端同步计算，不触发额外网络请求

## 验证命令

```bash
pnpm vitest --run src/lib/__tests__/analysis-summary.test.ts src/lib/__tests__/recipe-categories.test.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §4.2（ReferenceCard, RecipeCard）, §5 ADR-3, §6.2, §6.3, §7.2（DimensionScore, RecipeCategory）, §8.6（评分精度风险）
- **相关代码**: `src/components/workspace/reference-card.tsx`、`src/components/workspace/recipe-card.tsx`、`src/types/models.ts`（VisualRecipe 类型）
- **契约 / 数据对象**: `DimensionScore`、`RecipeCategory`、`VisualRecipe`
- **下游消费方**: PLAN-03 使用 ReferenceCard 的分析结果；PLAN-04 的历史恢复会触发三列卡片数据更新

## 风险与边界

- **执行顺序**: 先写工具函数和测试（Task 1-3），再完善卡片组件（Task 4-5），最后改 page.tsx（Task 6）
- **验证失败排查方向**: 检查 VisualRecipe 字段名映射、百分比计算逻辑、recipe 为 null 时的降级处理、ReferenceCard 卡片头部布局
- **允许修改的额外文件**: 无
- **暂停条件**: 如果需要新增后端 API 或修改分析接口返回数据，停止并请求确认
- **E2E 不适用说明**: 不适用，本功能有用户可观察行为
- **风险备注**: 分析摘要 5 维度评分使用启发式算法，精度有限；标注为可替换（架构 §8.6）

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| recipe 为 null | 工具函数返回空数组，卡片显示空态引导 | done |
| recipe 字段缺失 | 启发式算法对缺失字段返回 0% 或默认值 | done |
| 分析失败 | ReferenceCard 显示错误态 + "重新分析"按钮，RecipeCard 保持空态 | done |
| 更换图片 | 触发 ws.reset()，三列内容全部更新 | done |
| 上传失败 | ReferenceCard 显示错误 + "重新上传"，其他卡片保持空态 | done |
