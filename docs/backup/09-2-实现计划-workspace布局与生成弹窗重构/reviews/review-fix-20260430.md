---
date: 2026-04-30
source_reviews:
  - FEAT-01-review-20260430.md
  - FEAT-02-review-20260430.md
  - FEAT-03-review-20260430.md
---

# 09 审核问题修复记录

## 修复项

| 来源 | 审核问题 | 修复结果 |
| --- | --- | --- |
| FEAT-01 | 文件清单中的既有组件无 diff / 无豁免说明 | 已在 FEAT-01 增加文件清单偏差说明，解释 `layout.tsx`、`workspace-canvas.tsx`、`recipe-editor.tsx`、`analysis-progress.tsx`、`error-display.tsx` 的复用或 legacy 保留原因。 |
| FEAT-02 | 缺少 `unified-prompt-editor.test.tsx` | 已新增组件测试，覆盖文本模式、模板变量、草稿保留和外部 prompt 更新。 |
| FEAT-02 | `PromptEditor` / `TemplateWizard` 无 diff / 无豁免说明 | 已在 FEAT-02 增加文件清单偏差说明，明确旧组件作为 legacy 保留，工作台不再使用它们渲染 09 编辑流。 |
| FEAT-02 | 外部 prompt 更新后文本草稿可能不刷新 | 已修复 `UnifiedPromptEditor` 的外部 `initialPromptText` 同步逻辑，避免历史恢复或外部上下文替换失效，同时避免组件自身 resolved prompt 反向覆盖模板草稿。 |
| FEAT-03 | 缺少 `light-generate-panel.test.tsx` / `generation-dialog.test.tsx` | 已新增两个组件测试，覆盖参数选择、不可用原因、生成回调、弹窗进度、结果、失败和关闭。 |
| FEAT-03 | 多个既有文件无 diff / 无豁免说明 | 已在 FEAT-03 增加文件清单偏差说明，明确 `OutputSettings`、`GenerationProgress`、`ResultDisplay`、`useWorkspaceState` 及相关测试的复用或 legacy 保留原因。 |
| FEAT-03 | 重新生成没有复用当前输出设置 | 已将输出参数提升到 `WorkspacePage`，`LightGeneratePanel` 和 `GenerationDialog` 共享当前 `aspectRatio` / `quality`。 |
| 全局 | `pnpm test` 失败 | 已修复 generation detail route 测试 mock 的 `findByIdWithRecipe` 缺失，`pnpm test` 通过。 |

## 复验命令

| 命令 | 结果 |
| --- | --- |
| `pnpm vitest --run src/components/workspace/__tests__/unified-prompt-editor.test.tsx src/components/workspace/__tests__/light-generate-panel.test.tsx src/components/workspace/__tests__/generation-dialog.test.tsx 'src/app/api/generation/[id]/__tests__/route.test.ts'` | 4 files / 21 tests passed |
| `pnpm test` | 58 files / 495 tests passed |
| `pnpm type-check` | passed |
| `pnpm exec playwright test --workers=1 e2e/workspace-two-pane.spec.ts e2e/workspace-unified-editor.spec.ts e2e/workspace-generation-dialog.spec.ts` | 11 passed |
| `pnpm lint` | passed，仍有既有 warning |
| `pnpm build` | passed，仍有既有 warning |
