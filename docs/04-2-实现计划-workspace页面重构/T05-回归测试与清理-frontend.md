---
task_id: "T05"
title: "回归测试与清理"
dimension: frontend
phase: 4
status: done
depends_on: ["T04"]
---

# T05: 回归测试与清理（前端）

## 任务概要

- **目标**: 迁移现有组件测试到新组件，修复因重构导致的测试失败，清理废弃的旧布局代码和不再使用的组件
- **依赖**: T04（所有新组件和降级迁移完成）
- **所属模块**: 测试 / 清理
- **前置条件**: T01-T04 全部完成，Workspace 页面已完整切换到新两段式布局
- **不在范围**: E2E 测试（在 T05-integration 中处理）、新功能开发

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/__tests__/status-bar.test.tsx` | StatusBar 单元测试 |
| create | `src/components/workspace/__tests__/recipe-step.test.tsx` | RecipeStep 单元测试 |
| create | `src/components/workspace/__tests__/output-settings.test.tsx` | OutputSettings 单元测试 |
| create | `src/components/workspace/__tests__/workspace-canvas.test.tsx` | WorkspaceCanvas 单元测试 |
| create | `src/components/workspace/__tests__/canvas-toolbar.test.tsx` | CanvasToolbar 单元测试 |
| create | `src/components/workspace/__tests__/style-tag-bar.test.tsx` | StyleTagBar 单元测试 |
| modify | `src/components/workspace/__tests__/recipe-card.test.tsx` | 迁移/调整测试到 recipe-step.test.tsx，或标记为废弃 |
| modify | `src/components/workspace/__tests__/generate-panel.test.tsx` | 迁移/调整测试到 output-settings.test.tsx，或标记为废弃 |

## 实现规格

### 1. 新组件单元测试

为 T01-T04 创建的每个新组件编写单元测试：

**StatusBar 测试**:
- 各 WorkspaceState 下状态标签文案正确
- `showReplaceButton` 条件正确（idle/uploading 不显示，analysis_ready 及之后显示）
- 点击"更换参考图"按钮触发 onReplace 回调

**RecipeStep 测试**:
- 默认展示 5 字段核心摘要（subject/scene/lighting/color/mood）
- 点击展开按钮后展示完整配方
- L3/L4 降级提示正确渲染
- 分析错误 ErrorDisplay 正确渲染
- generation_ready 状态下标题变为"本次生成参数"

**OutputSettings 测试**:
- 按钮文案随状态变化："生成首版" / "正在生成..." / "重新生成"
- generationUnavailable 时按钮 disabled
- L2 降级提示正确渲染
- 宽高比/画质选择器工作正常
- 点击生成按钮触发 onGenerate 回调（含 aspectRatio + quality 参数）

**WorkspaceCanvas 测试**:
- canvasView 派生逻辑正确：无图→upload，有参考图→reference，有结果图→result
- 各视图切换正确渲染对应子组件
- UploadZone 在 upload 视图下正确渲染

**CanvasToolbar 测试**:
- 三个操作按钮正确渲染
- 点击"对比查看"切换 activeView
- 下载按钮 href 正确

**StyleTagBar 测试**:
- extractStyleTags 逻辑正确：优先 styleTags 前 5 个，不足时补充
- 标签以 pill 样式渲染

### 2. 现有测试迁移

- `recipe-card.test.tsx`：核心测试迁移到 `recipe-step.test.tsx`（展开/收起、字段展示等）
- `generate-panel.test.tsx`：核心测试迁移到 `output-settings.test.tsx`（参数选择、按钮状态等）
- `comparison-view.test.tsx`：对比逻辑测试迁移到 `workspace-canvas.test.tsx` 或 `canvas-toolbar.test.tsx`
- `result-display.test.tsx`：下载/放大测试迁移到 `workspace-canvas.test.tsx` 或 `canvas-toolbar.test.tsx`

### 3. 废弃代码清理

确认以下组件不再被任何文件 import 后删除：
- `src/components/workspace/empty-analysis.tsx`（功能已合并到 DecisionPanel 空态预览）
- 旧组件文件**不删除**（RecipeCard / GeneratePanel / ComparisonView / ResultDisplay），仅确认它们不再被 page.tsx import。清理旧文件在确认全链路回归通过后再单独处理，避免回滚困难

在 page.tsx 中清理：
- 移除不再使用的 import 语句
- 移除不再使用的布尔条件计算变量

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 编写 StatusBar 测试 | done | 状态标签、替换按钮 |
| 2 | 编写 RecipeStep 测试 | done | 摘要/展开/降级/错误 |
| 3 | 编写 OutputSettings 测试 | done | 按钮文案/参数选择/降级 |
| 4 | 编写 WorkspaceCanvas 测试 | done | canvasView 派生/视图切换 |
| 5 | 编写 CanvasToolbar + StyleTagBar 测试 | done | 操作按钮/标签提取 |
| 6 | 迁移现有测试 | done | RecipeCard→RecipeStep、GeneratePanel→OutputSettings |
| 7 | 清理废弃 import 和组件 | done | page.tsx import 清理、EmptyAnalysis 删除 |
| 8 | 验证全量测试通过 | done | `pnpm test` 全部通过 |

## 验证命令

```bash
pnpm type-check && pnpm lint && pnpm build && pnpm test
```

## 预期结果

1. 所有新组件测试通过
2. 迁移后的测试通过
3. 现有未修改组件的测试仍然通过
4. `pnpm build` 无错误
5. page.tsx 中无未使用的 import

## 交接上下文

- **架构章节**: §9.2 Phase E（回归测试与收尾）
- **相关代码**: `src/components/workspace/__tests__/` 下所有现有测试文件
- **契约 / 数据对象**: 所有 T01-T04 创建的组件 Props 接口
- **提供给下游的契约摘要**: T05 完成后所有单元测试通过，可以进入 T05-integration 的 E2E 测试

## 执行指引

- **工具链**: pnpm, Vitest, React Testing Library
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查测试中的 mock 是否匹配新组件的 props 接口、检查 import 路径是否正确、检查 Vitest 配置的路径别名
- **允许修改的额外文件**: 任何 `src/components/workspace/__tests__/` 下的测试文件
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 测试迁移时需注意新旧组件的 props 差异
- 旧组件文件暂不删除，避免影响回滚能力
- 如果现有测试使用了 page.tsx 的内部实现细节（如直接 import 布尔变量），需要调整测试策略

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 测试中 sessionStorage mock | useWorkspaceState 测试已有 sessionStorage mock，确认新增 isRecipeExpanded 不影响 | done |
| localStorage mock | OutputSettings 的 localStorage 持久化测试需要 mock | done |
| next/image 在测试中的处理 | Vitest 中 next/image 需要 mock，确认 WorkspaceCanvas 测试正确 mock | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
