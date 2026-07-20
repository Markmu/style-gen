---
workflow_type: 'new-feature'
spec_id: 'FEAT-0006'
title: '精简 Prompt + Render 的 Recipe JSON 输出'
type: 'refactor'
created: '2026-07-21'
status: 'done'
context:
  - 'docs/FEAT-0004-structured-style-extraction.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** Prompt + Render 的 V2 JSON mode 当前复制完整 Recipe、workspace 状态和派生 Prompt，包含大量重复描述及内部元数据。

**方案：** 将 JSON mode 改为只读的原始描述投影，仅输出非空的内容描述、各风格维度的 `value` 字符串和排除项。

## 边界

**必须：** 保留 `contentDescription` 的非空描述字段、`styleProfile` 的非空维度和值，以及非空 `negativeConstraints`；输出不得受变量、锚点、modifier 或自定义 Prompt 修改影响。

**先问：** 后续若要让 JSON 反映当前编辑状态，必须重新确认契约。

**禁止：** 不修改持久化 V2 Recipe、分析 API、生图请求、Style Intelligence 证据展示和旧版非 V2 Prompt JSON 契约。

## 需求变更

### 修改

- **REQ-1**: [JSON mode 输出 `recipe/workspace/prompt` 完整包] → [直接输出 `contentDescription/styleProfile/negativeConstraints` 描述投影，无 `recipe` 外层包装]。
- **REQ-2**: [每个 Style observation 输出 `id/value/evidence/confidence`] → [每个风格维度只输出非空 `value` 字符串数组，并省略空维度]。
- **REQ-3**: [JSON 包含诊断、派生和编辑状态] → [省略 schema/status/reasons、invariants、variables、modifiers、fingerprint、promptOutputs、workspace、prompt、空数组及空可选字段]。

</frozen-after-approval>

## 代码地图

- `src/lib/visual-recipe.ts` -- 增加 V2 Recipe 到纯描述 JSON 的确定性投影。
- `src/components/workspace/structured-prompt-editor.tsx` -- 使用描述投影生成 JSON mode 文本。
- `src/lib/__tests__/visual-recipe-v2.test.ts` -- 验证字段保留、元数据移除和空字段省略。
- `src/components/workspace/__tests__/structured-prompt-editor.test.tsx` -- 验证 UI 展示/复制精简 JSON，且不随自定义 Prompt 改写。
- `e2e/analysis-structured-style-extraction.spec.ts` -- 更新 JSON mode 对编辑草稿隔离的断言。

## 任务清单

- [x] `src/lib/visual-recipe.ts` -- 实现描述型 JSON 投影函数和返回类型。
- [x] `src/components/workspace/structured-prompt-editor.tsx` -- 用投影结果替换完整运行时包。
- [x] `src/lib/__tests__/visual-recipe-v2.test.ts`、`src/components/workspace/__tests__/structured-prompt-editor.test.tsx`、`e2e/analysis-structured-style-extraction.spec.ts` -- 补齐单元、组件与链路断言。

## 验证命令

- `pnpm vitest --run src/lib/__tests__/visual-recipe-v2.test.ts src/components/workspace/__tests__/structured-prompt-editor.test.tsx` -- 验证投影逻辑与组件输出。
- `pnpm type-check` -- 验证 TypeScript 类型。
- `pnpm e2e -- e2e/analysis-structured-style-extraction.spec.ts` -- 验证完整 JSON mode 交互。

## 验收标准

- [x] Given 一份 V2 Recipe, when 打开 JSON mode, then 顶层只包含非空的 `contentDescription`、`styleProfile` 和 `negativeConstraints`。
- [x] Given Style observations 含 ID、证据和置信度, when 生成 JSON, then 对应维度只包含原顺序的 `value` 字符串且空维度不出现。
- [x] Given 内容字段或排除项为空, when 生成 JSON, then 空字段或空数组不出现在输出中。
- [x] Given 用户修改变量、锚点、modifier 或自定义 Prompt, when 查看 JSON mode, then JSON 仍保持原始分析描述且不包含任何 workspace 或 prompt 状态。
- [x] Given 用户复制 JSON, when 剪贴板写入成功, then 复制内容与页面显示的精简 JSON 完全一致。

## 验证记录

- Red: `pnpm vitest --run src/lib/__tests__/visual-recipe-v2.test.ts src/components/workspace/__tests__/structured-prompt-editor.test.tsx` — 预期失败；投影函数尚未实现，组件仍输出 `recipe/workspace/prompt` 完整包（3 failed，11 passed）。
- Green: `pnpm vitest --run src/lib/__tests__/visual-recipe-v2.test.ts src/components/workspace/__tests__/structured-prompt-editor.test.tsx` — 通过（2 files，14 tests）。
- Green: `pnpm type-check` — 通过。
- Regression: `pnpm e2e -- e2e/analysis-structured-style-extraction.spec.ts` — 通过（3 tests）。
- Regression: `pnpm lint` — 通过；仅有仓库既有 warnings。
- Regression: `git diff --check` — 通过。
