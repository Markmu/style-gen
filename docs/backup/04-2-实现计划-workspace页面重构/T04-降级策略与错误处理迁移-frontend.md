---
task_id: "T04"
title: "降级策略与错误处理迁移"
dimension: frontend
phase: 3
status: done
depends_on: ["T02", "T03"]
---

# T04: 降级策略与错误处理迁移（前端）

## 任务概要

- **目标**: 将 L1-L4 降级提示和 ErrorDisplay 从 page.tsx 内联代码迁移到对应的 Step 区域（DecisionPanel / RecipeStep / OutputSettings），确保所有降级场景在新两段式布局中正确展示且不影响其他功能
- **依赖**: T02（DecisionPanel / RecipeStep / OutputSettings 就位）、T03（WorkspaceCanvas 就位）
- **所属模块**: RecipeStep / OutputSettings / DecisionPanel / WorkspaceCanvas
- **前置条件**: T02 和 T03 完成，右侧面板和左侧画布均可正常渲染
- **不在范围**: 测试迁移（T05）、新增降级级别

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/recipe-step.tsx` | 增加 L1/L3/L4 降级提示 slot 和分析错误 ErrorDisplay |
| modify | `src/components/workspace/output-settings.tsx` | 增加 L2 降级提示和生成错误 ErrorDisplay |
| modify | `src/components/workspace/decision-panel.tsx` | 增加降级/错误相关 props 透传，增加 L1 生成排队提示 |
| modify | `src/app/workspace/page.tsx` | 移除 page.tsx 中残留的降级/错误内联渲染，透传新 props |

## 实现规格

### 1. 降级提示嵌入位置（ADR-7）

| 级别 | 触发条件 | 嵌入位置 | 样式 |
|------|---------|---------|------|
| L1 分析排队 | `ws.state === "analyzing" && ws.degradation.analysisQueueing` | RecipeStep 内部顶部 | amber 排队提示卡 + spinner |
| L1 生成排队 | `ws.state === "generating" && ws.degradation.generationQueueing` | OutputSettings 内部顶部 | amber 排队提示卡 + spinner |
| L2 生成不可用 | `ws.degradation.generationUnavailable` | OutputSettings 内部顶部 | amber 降级提示卡 |
| L3 LLM 失败 | `ws.state === "analysis_ready" && !ws.recipe && !!ws.promptText` | RecipeStep 内部顶部 + Step 2 预填提示 | amber 降级提示卡 |
| L4 分析不可用 | `ws.degradation.analysisUnavailable` | RecipeStep 内部顶部 | amber 降级提示卡 |

### 2. RecipeStep 降级扩展

新增 props：

```typescript
interface RecipeStepProps {
  recipe: VisualRecipe | null;
  isExpanded: boolean;
  state: WorkspaceState;
  onToggleExpanded: () => void;
  // 新增降级/错误相关
  degradation: DegradationState;
  error: WorkspaceError | null;
  onRetry: () => void;
  onReplace: () => void;
}
```

实现要点：

- **L4 分析不可用**：在 Step 区域顶部渲染 amber 降级提示卡：
  ```
  分析服务暂时不可用，请稍后重试
  已有分析结果仍可查看和编辑
  ```
  Recipe 区域置灰（`opacity-50 pointer-events-none`）

- **L1 分析排队**：当 `state === "analyzing"` 且 `degradation.analysisQueueing` 时，渲染排队提示卡替代普通进度条：
  ```
  分析排队中，请耐心等待
  当前请求较多，处理可能需要更长时间
  ```
  含 spinner 动画

- **L3 LLM 失败**：当 `state === "analysis_ready"` 且 `!recipe` 且 `!!promptText` 时，渲染降级提示卡：
  ```
  AI 结构化处理失败，已降级为原始分析结果
  您可以基于以下原始分析结果手动编写或调整 Prompt
  ```

- **分析错误 ErrorDisplay**：当 error 存在且 `error.stage !== "generation"` 时：
  - 有 `error.code`：渲染 `ErrorDisplay` 组件（复用现有，含 code/message/retryable）
  - 无 `error.code`：渲染 `AnalysisProgress`（error 模式）
  - 两种情况均提供 `onRetry` 和 `onReplace` 回调

- 降级提示统一使用 amber 色系：`border-amber-500/30 bg-amber-500/10 text-amber-400`

### 3. OutputSettings 降级扩展

新增 props：

```typescript
interface OutputSettingsProps {
  state: WorkspaceState;
  generationUnavailable: boolean;
  onGenerate: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  // 新增
  generationQueueing: boolean;
  error: WorkspaceError | null;
  onRetry: () => void;
}
```

实现要点：

- **L2 生成不可用**：`generationUnavailable` 时在 Step 区域顶部渲染 amber 降级提示卡：
  ```
  图片生成服务暂时不可用
  分析结果和 Prompt 编辑功能仍可使用
  ```
  生成按钮 disabled

- **L1 生成排队**：`state === "generating"` 且 `generationQueueing` 时，渲染排队提示卡（替代 GenerationProgress）：
  ```
  生成排队中，请耐心等待
  当前请求较多，生成可能需要更长时间
  ```

- **生成错误 ErrorDisplay**：当 `state === "generation_ready"` 且 `error?.stage === "generation"` 时：
  - 有 `error.code`：渲染 `ErrorDisplay`
  - 无 `error.code`：渲染红色错误卡 + RetryButton
  - 提供 `onRetry` 回调

### 4. DecisionPanel props 扩展

增加降级/错误相关 props 的透传：

```typescript
interface DecisionPanelProps {
  // ...existing props from T02...
  // 新增
  onRetry: () => void;
  onReplace: () => void;
  onGenerateRetry: () => void;
}
```

### 5. page.tsx 清理

- 移除 page.tsx 中所有降级/错误相关的内联 JSX（L1-L4 提示、ErrorDisplay、AnalysisProgress 错误态等）
- 移除 `showAnalysisError` / `showGenerationError` / `isL3Degraded` 等布尔计算
- 将 `handleRetry` / `handleReplace` / `handleGenerateRetry` 回调透传给 DecisionPanel
- 移除 page.tsx 中 `AnalysisProgress`、`GenerationProgress` 的直接渲染（已下沉到 DecisionPanel / OutputSettings）
- 目标：page.tsx 的 return 语句仅包含 StatusBar + WorkspaceCanvas + DecisionPanel

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 扩展 RecipeStep 降级/错误 | done | L1/L3/L4 降级提示 + 分析错误 ErrorDisplay |
| 2 | 扩展 OutputSettings 降级/错误 | done | L1/L2 降级提示 + 生成错误 ErrorDisplay |
| 3 | 更新 DecisionPanel props | done | 新增 onRetry/onReplace/onGenerateRetry 透传 |
| 4 | 清理 page.tsx | done | 移除所有残留的降级/错误内联渲染和布尔计算 |
| 5 | 逐一验证降级场景 | done | 确认 L1-L4 每种降级在正确位置展示 |
| 6 | 验证编译和类型检查 | done | `pnpm type-check && pnpm build` 通过 |

## 验证命令

```bash
pnpm type-check && pnpm lint && pnpm build
```

## 预期结果

1. L1 分析排队提示在 RecipeStep 区域内展示
2. L1 生成排队提示在 OutputSettings 区域内展示
3. L2 生成不可用提示在 OutputSettings 区域内展示，按钮 disabled
4. L3 LLM 降级提示在 RecipeStep 区域内展示
5. L4 分析不可用提示在 RecipeStep 区域内展示，Recipe 置灰
6. 分析错误 ErrorDisplay 在 RecipeStep 区域内展示，含重试和更换参考图出口
7. 生成错误 ErrorDisplay 在 OutputSettings 区域内展示，含重试出口
8. page.tsx 不再包含任何降级/错误的内联 JSX
9. 降级时其他可用功能（如 Prompt 编辑）保持正常工作

## 交接上下文

- **架构章节**: ADR-7（降级/错误嵌入 Step 区域）、§4.2（关键分支）、§8.2（降级链）
- **相关代码**: `src/components/workspace/error-display.tsx`（直接复用）、`src/components/workspace/retry-button.tsx`（直接复用）、`src/components/workspace/analysis-progress.tsx`（错误模式复用）、`src/components/workspace/generation-progress.tsx`
- **契约 / 数据对象**: `DegradationState`、`WorkspaceError`、`ApiErrorCode`
- **提供给下游的契约摘要**: T04 完成后，page.tsx 应为最终形态（薄编排层），后续 T05 不再修改 page.tsx 的渲染逻辑

## 执行指引

- **工具链**: pnpm, React 19, Tailwind CSS 4
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 ErrorDisplay 的 import 路径、检查 DegradationState 各字段的条件判断逻辑、确认 error.stage 值的正确性
- **允许修改的额外文件**: `src/components/workspace/analysis-progress.tsx`（仅在 props 接口不兼容时最小调整）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 降级提示从 page.tsx 迁移到子组件时，需确保 L1 计时器 effect 仍然正确工作（计时器仍在 page.tsx 中）
- ErrorDisplay 使用紧凑模式（减少 padding），避免挤压 Step 区域正常内容
- 降级提示和错误提示在同一 Step 区域可能同时出现（如 L4 + 分析错误），需确保不冲突

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 降级提示和错误提示同时出现 | 按优先级展示：error 优先于 degradation 提示 | done |
| L3 降级下 Prompt 编辑可用性 | Prompt 编辑器保持可用，预填原始分析文本 | done |
| 重试后降级标志清除 | handleRetry 中调用 setAnalysisUnavailable(false) 等清除操作 | done |
| 生成失败后 Prompt 和参数保留 | error 不清除 promptText / negativePromptText / 参数选择 | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
