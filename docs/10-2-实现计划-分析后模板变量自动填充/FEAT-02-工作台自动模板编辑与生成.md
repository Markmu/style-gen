---
feat_id: "FEAT-02"
title: "工作台自动模板编辑与生成"
dimension: frontend
phase: 2
status: done
depends_on: ["FEAT-01"]
---

# FEAT-02: 工作台自动模板编辑与生成

## 功能概要

- **目标**: 工作台消费分析任务返回的自动模板产物，分析完成后默认进入模板模式，展示预填默认值变量，并保证直接生成、变量编辑、文本模式保护、fallback 和重新分析覆盖都正确。
- **完成后可观察结果**: 用户上传参考图并分析成功后，右侧编辑区会自动展示模板模式，变量输入框已经填入参考图内容。用户不改变量即可点击生成，生成请求使用完整替换后的提示；用户修改任意变量后，完整提示和生成请求会同步使用新值。切到文本模式并手动编辑后，文本草稿成为生成来源，不会被变量默认值静默覆盖；如果分析只能 fallback，右侧显示完整提示和轻量说明，不展示空变量列表。用户更换参考图并重新分析成功时，新模板和默认值覆盖旧模板，旧图变量不会混入新结果。
- **依赖**: FEAT-01
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08]
- **涉及架构模块**: Workspace State, WorkspacePage, EditingPane, UnifiedPromptEditor, TemplateVariablePanel, LightGeneratePanel
- **前置条件**: FEAT-01 已提供自动模板 API 字段；`docs/design/DESIGN.md` 已阅读，UI 调整保持现有工作台设计系统；现有 09 期左右双区和生成弹窗仍保留。
- **不在范围**: 保存模板默认值的后端持久化（FEAT-03）、新增模板库页面、生成 API 改造、自动保存每次分析模板。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/hooks/use-workspace-state.ts` | 增加自动模板字段、持久化结构版本和 `completeAnalysis` 参数；新分析成功覆盖旧模板 |
| modify | `src/hooks/__tests__/use-workspace-state.test.tsx` | 覆盖模板字段写入、fallback、重新分析覆盖、历史恢复不误标新模板 |
| modify | `src/app/workspace/page.tsx` | 将 `analysisTemplate*` 字段从轮询结果传入编辑区；fallback 时传 null；生成前校验未替换变量 |
| modify | `src/components/workspace/editing-pane.tsx` | 增加初始模板变量、模板状态、fallback reason 和当前变量变更回调 |
| modify | `src/components/workspace/unified-prompt-editor.tsx` | 接收初始变量默认值和状态；实现默认值合并、textTouched 保护、新模板重置逻辑 |
| modify | `src/components/workspace/template-mode-editor.tsx` | 支持 fallback/partial 说明、完整提示预览和变量元信息展示 |
| modify | `src/components/workspace/template-variable-panel.tsx` | 展示 label/sourceField/defaultValue，空变量时按 fallback 原因展示说明 |
| modify | `src/components/workspace/light-generate-panel.tsx` | 完整提示为空或含未替换变量时禁用生成并显示短原因 |
| modify | `src/components/workspace/__tests__/unified-prompt-editor.test.tsx` | 覆盖默认值预填、修改变量同步、文本模式保护、新模板覆盖 |
| create | `src/components/workspace/__tests__/template-variable-panel.test.tsx` | 新建变量面板组件测试，覆盖 label/defaultValue/fallback 空态 |
| modify | `src/components/workspace/__tests__/light-generate-panel.test.tsx` | 覆盖未替换变量不可提交 |
| modify | `e2e/helpers/mock-api.ts` | 增加自动模板 ready/partial/fallback 的分析响应 mock |
| create | `e2e/analysis-template-autofill.spec.ts` | 分析后模板预填、直接生成、变量编辑、文本保护、fallback 和重新分析 E2E |

## 实现规格

### 前端部分

#### 1. Workspace State 契约

- 在 `WorkspaceContext` 增加：
  - `analysisTemplateContent: string | null`
  - `analysisTemplateVariables: TemplateVariable[]`
  - `analysisTemplateStatus: AnalysisTemplateStatus | null`
  - `analysisTemplateReason: string | null`
- `WorkspacePersistedState` 版本从 1 升级到 2；持久化当前分析模板字段，旧版本自动清理或迁移为空模板字段。
- `completeAnalysis` 签名扩展为接收自动模板字段对象，调用方必须显式传入。
- `completeAnalysis` 规则：
  - ready/partial：写入模板正文、变量、状态、原因，同时写入渲染后的 `promptText`。
  - fallback：清空模板正文和变量，保留 `promptText`，写入 fallback 状态和 reason。
  - 新 analysisTaskId completed 时覆盖旧模板字段；分析失败时保留旧编辑内容但不能把旧变量标记为新分析产物。
- `enterHistoryRestored` 首版只恢复完整提示，不强制恢复自动模板草稿；需清空 `analysisTemplateContent` 和变量，避免误导用户。

#### 2. WorkspacePage 接线

- `useAnalysis` 轮询 completed 且 `analysisData.id === ws.analysisTaskId` 时，把 FEAT-01 返回的 `analysisTemplate*` 字段传入 `ws.completeAnalysis`。
- `templateContent` 局部 state 需要区分“用户加载模板库模板”和“分析自动模板”：
  - 分析 ready/partial：用分析模板初始化 `EditingPane`，并清空旧的模板库加载内容。
  - 分析 fallback：传 `null` 给 `EditingPane`，让编辑器进入文本模式。
  - templateId 加载：仍可进入模板模式，但变量默认值来自已保存模板。
- `handleGenerate` 提交前检查 `resolvedPromptText`：
  - trim 后非空。
  - 不包含合法 `{{name}}` 标记。
  - 否则不发起 `/api/generation`，在轻量生成区显示可修复原因。
- 生成请求仍保持 `negativePromptText: ""`，不新增 API 字段。

#### 3. UnifiedPromptEditor 初始化和保护

- props 增加：
  - `initialTemplateVariables?: TemplateVariable[]`
  - `templateStatus?: AnalysisTemplateStatus | null`
  - `templateReason?: string | null`
  - `onTemplateVariablesChange?: (variables: TemplateVariable[]) => void`
- 初始化规则：
  - `initialTemplateContent` 存在且 status 为 ready/partial：默认 `mode = "template"`。
  - fallback 或无模板内容：默认 `mode = "text"`。
  - `variableValues` 从 `initialTemplateVariables.defaultValue` 初始化，不再全部为空。
  - 同名变量以模板正文首次出现顺序为准，保留变量元信息。
- 模板正文变化时：
  - 重新提取正文变量名。
  - 仍存在的变量保留用户当前输入值。
  - 新变量 defaultValue 为空。
  - 已删除变量从面板移除。
  - 变量元信息 label/sourceField 仅对仍存在变量保留。
- 文本模式保护：
  - 模板 -> 文本：如果文本未触碰，用当前 resolved prompt 初始化。
  - 文本被用户触碰后，变量变化不再自动覆盖文本草稿。
  - 返回模板模式不反向解析文本，保留模板草稿和变量值。
- 当 `initialTemplateContent` 对应新的 analysisTaskId 或新模板加载内容变化时，重置 `textTouched`，用新模板默认值接管编辑器。

#### 4. 变量面板和 fallback 呈现

- `TemplateVariablePanel` 展示：
  - label 优先，其次变量名。
  - sourceField 可作为短辅助标签，使用现有小号 muted 文案。
  - 输入框 value 来自当前 `variableValues[name]`。
- 变量为空时：
  - fallback：展示“本次没有识别到足够稳定的可替换变量”及 `analysisTemplateReason` 的短说明，显示文本模式可编辑。
  - 普通手写模板无变量：保留现有“当前模板没有变量”空态。
- partial 状态：展示轻量提示“只展示已识别的可信变量”，不阻断生成。
- 不新增独立页面或大弹窗，说明信息留在右侧编辑区。

#### 5. E2E red spec

- 新建 `e2e/analysis-template-autofill.spec.ts`，先 red，再实现到 green。
- 场景至少覆盖：
  - 分析 completed ready 后默认进入模板模式，变量列表预填 subject/scene/visual_style/lighting_color。
  - 不修改变量直接生成，请求 `promptText` 不含 `{{...}}`，包含默认值。
  - 修改 `subject` 后，生成请求使用新主体值。
  - 切到文本模式并手动编辑后，变量变化不覆盖文本草稿，生成请求使用文本草稿。
  - fallback 分析响应进入文本模式，不展示空变量列表，仍可生成。
  - 重新分析新 task completed 后，变量默认值来自新响应，不沿用旧变量。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `analysis-template-autofill` E2E red spec | frontend | done | 覆盖 AC-01/02/03/04/05/07/08 |
| 2 | 扩展 `use-workspace-state` 类型、持久化和测试 | frontend | done | 自动模板字段和新分析覆盖规则 |
| 3 | 改造 `WorkspacePage` 分析 completed 接线 | frontend | done | 传递 `analysisTemplate*`，fallback 进入文本模式 |
| 4 | 改造 `EditingPane` / `UnifiedPromptEditor` props | frontend | done | 初始变量默认值、状态和 reason |
| 5 | 实现变量元信息合并和文本模式保护 | frontend | done | 默认值预填、同名保留、新模板重置 |
| 6 | 改造变量面板 ready/partial/fallback 呈现 | frontend | done | label/sourceField/fallback 说明 |
| 7 | 改造生成前校验和轻量生成区原因展示 | frontend | done | 空提示或未替换变量不提交 |
| 8 | 补组件/hook 测试并跑 E2E green | frontend | done | red/green 证据已记录 |

## 验收标准

### 前端验收

- [x] AC-01 分析 completed 且模板 ready/partial 时，右侧默认进入模板模式，并展示带变量的模板正文和变量输入列表。
- [x] AC-02 变量输入框默认值来自分析响应中的 `analysisTemplateVariables.defaultValue`，不是空值或泛化占位。
- [x] AC-03 用户不修改变量直接生成时，生成入口可用，请求中的 `promptText` 不含未替换 `{{name}}`，并包含默认值。
- [x] AC-04 修改任一变量值后，resolved prompt 和生成请求同步使用新值。
- [x] AC-05 切到文本模式并手动编辑后，变量变化或模式切换不会静默覆盖用户文本草稿。
- [x] AC-07 fallback 响应进入文本模式，展示完整提示和轻量说明，不展示空变量表单，仍可编辑、保存和生成。
- [x] AC-08 新 analysisTaskId completed 后，模板正文和变量默认值使用新分析结果，旧图变量不会自动混入。
- [x] templateId 加载模板的既有流程不回退；已保存模板仍可进入模板模式。
- [x] E2E-TDD：`e2e/analysis-template-autofill.spec.ts` 先 red 后 green。
- [x] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-02-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-02-e2e-green-{date}.md`。

### 性能验收

- [x] 模板渲染和变量合并均为本地同步操作，不发起额外网络请求。（架构 §8.1）
- [x] 单次变量输入保持即时响应；变量列表建议上限 8 个，百级变量边界由单元测试保护。（架构 §8.1）

### 降级回归验收

- [x] L1 partial 只展示可信变量，完整提示仍可生成。（架构 §8.2）
- [x] L2 fallback 展示完整提示和说明，合一编辑区继续可用。（架构 §8.2）
- [x] L3 structurer 降级后的 `recipe = null` 场景仍可在文本模式编辑生成。（架构 §8.2）

### 全流程验收（US 覆盖矩阵）

> 架构文档 §2.3 定义的成功标准：自动模板、直接生成、变量编辑、保存承接、降级可用和响应成本均可验证。PRD 用户故事 US-01 ~ US-08 由本功能和 FEAT-03 共同覆盖。

| US 编号 | 用户故事简述 | 承接功能 | 验证方式 |
| --- | --- | --- | --- |
| US-01 | 分析完成后自动看到可替换变量 | FEAT-02 | `e2e/analysis-template-autofill.spec.ts` 模板默认展示 |
| US-02 | 变量默认值来自参考图内容 | FEAT-01, FEAT-02 | FEAT-01 structurer 测试 + FEAT-02 变量预填断言 |
| US-03 | 快速修改主体、场景或风格变量 | FEAT-02 | 组件测试 + E2E 修改变量 |
| US-04 | 完整生成提示随变量变化同步更新 | FEAT-02 | 组件测试 + 生成请求断言 |
| US-05 | 分析后变量模板可保存复用 | FEAT-03 | `e2e/template-default-values.spec.ts` |
| US-06 | 可切换完整文本直接编辑 | FEAT-02 | 文本模式保护测试 |
| US-07 | 不清晰参考图不硬凑变量 | FEAT-01, FEAT-02 | fallback 后端测试 + 前端 E2E |
| US-08 | 更换参考图后变量自动更新 | FEAT-02 | 新 analysisTaskId E2E |

- [x] US-01 ~ US-04、US-06 ~ US-08 可在当前工作台布局下正常走通；US-05 由 FEAT-03 完成最终保存回归。

## 验证命令

```bash
pnpm e2e -- e2e/analysis-template-autofill.spec.ts
pnpm vitest --run src/hooks/__tests__/use-workspace-state.test.tsx src/components/workspace/__tests__/unified-prompt-editor.test.tsx src/components/workspace/__tests__/template-variable-panel.test.tsx src/components/workspace/__tests__/light-generate-panel.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-01/02/03/04/05/07/08，§3.1，§3.2，§3.3，§4.2，§6.2，§6.3，§6.4，§6.6，§7.2，§8.1，§8.2
- **相关代码**: `src/hooks/use-workspace-state.ts`、`src/app/workspace/page.tsx`、`src/components/workspace/editing-pane.tsx`、`src/components/workspace/unified-prompt-editor.tsx`、`src/components/workspace/template-mode-editor.tsx`、`src/components/workspace/template-variable-panel.tsx`、`src/components/workspace/light-generate-panel.tsx`
- **契约 / 数据对象**: `AnalysisTemplateStatus`、`TemplateVariable`、`WorkspaceTemplateDraft`、`ResolvedGenerationInput`
- **下游消费方**: FEAT-03 需要本功能暴露当前模板正文和当前变量值，用于保存模板默认值。

## 风险与边界

- **执行顺序**: 先 E2E red，再 state/hook，再编辑器，再生成校验，最后组件测试和 green。
- **验证失败排查方向**: 优先检查 analysis stale guard、`initialTemplateContent` 重置条件、`textTouched` 保护、变量默认值合并和 E2E mock 响应字段。
- **允许修改的额外文件**: `src/components/workspace/__tests__/template-variable-panel.test.tsx` 若当前不存在可新建；`e2e/fixtures/api-responses/*.json` 可新增自动模板 fixture。
- **暂停条件**: 如果需要新增 UI 主结构、改变生成 API 请求体、自动保存分析模板或把变量状态写入后端草稿表，停止并请求确认。
- **E2E 不适用说明**: 不适用；本功能是用户可观察工作台能力，必须有 E2E。
- **风险备注**: 09 期工作台已有模板库 query 加载和局部 `templateContent` 状态；实现时要明确分析自动模板与模板库加载模板的优先级，避免互相覆盖。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 分析 ready 但变量列表为空 | 视为 fallback，进入文本模式并显示说明 | done |
| partial 只有部分变量 | 展示可信变量，不补空变量，不阻断生成 | done |
| 用户删除模板正文中的变量 | 变量面板移除该变量，不影响其他变量值 | done |
| 用户新增模板正文变量 | 面板新增空值输入，生成前如未填导致禁用或提示 | done |
| 文本模式已触碰 | 不再用变量渲染结果覆盖文本草稿 | done |
| 新参考图分析成功 | 清空旧自动模板，用新分析模板接管编辑区 | done |
| 分析失败 | 保留原有编辑内容，但不把旧变量标记为新分析产物 | done |
| 未替换变量残留 | 轻量生成区禁用生成并显示可修复原因 | done |
