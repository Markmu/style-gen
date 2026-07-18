---
feat_id: "FEAT-02"
title: "合一编辑区与变量模式"
dimension: frontend
phase: 2
status: done
depends_on: ["FEAT-01"]
---

# FEAT-02: 合一编辑区与变量模式

## 功能概要

- **目标**: 在右侧编辑区中实现合一编辑区，通过模板模式和文本模式切换，统一承载模板原文编辑、模板外变量输入和完整生成提示编辑。
- **完成后可观察结果**: 用户在分析完成后可以在右侧编辑区看到模式切换入口。模板模式下，用户能编辑模板原文，并在模板正文之外看到变量输入框列表；修改变量不会直接改写模板原文。切到文本模式后，用户能看到由模板原文和变量值渲染出的完整生成提示，并可继续直接编辑；模式切换不会清空已编辑内容。
- **依赖**: FEAT-01
- **关联验收标准**: [AC-03, AC-09]
- **涉及架构模块**: EditingPane, UnifiedPromptEditor, TemplateModeEditor, TextModeEditor, TemplateVariablePanel
- **前置条件**: FEAT-01 已提供稳定右侧编辑区容器；现有 `src/lib/template-parser.ts` 可用。
- **不在范围**: 生成区轻量化、生成对话框、后端模板持久化、负面提示字段清理。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/editing-pane.tsx` | 新建右侧编辑区容器，组织合一编辑区与后续轻量生成区插槽 |
| create | `src/components/workspace/unified-prompt-editor.tsx` | 新建合一编辑区，管理模板/文本模式和草稿状态 |
| create | `src/components/workspace/template-mode-editor.tsx` | 新建模板模式编辑器，编辑模板原文和变量列表 |
| create | `src/components/workspace/text-mode-editor.tsx` | 新建文本模式编辑器，编辑完整生成提示 |
| create | `src/components/workspace/template-variable-panel.tsx` | 新建模板外变量输入列表 |
| modify | `src/components/workspace/prompt-editor.tsx` | 收敛为文本模式可复用输入，移除可见 Negative Prompt 输入或停止在工作台使用 |
| modify | `src/components/workspace/template-wizard.tsx` | 如仍被工作台引用，替换为合一编辑区流程或保留给非工作台场景 |
| modify | `src/app/workspace/page.tsx` | 将右侧临时编辑区替换为 `EditingPane` / `UnifiedPromptEditor` 接线 |
| modify | `src/lib/template-parser.ts` | 保留现有提取/替换逻辑，必要时导出变量合并 helper |
| modify | `src/lib/__tests__/template-parser.test.ts` | 补充变量合并、首次出现顺序、长变量名替换等测试 |
| create | `src/components/workspace/__tests__/unified-prompt-editor.test.tsx` | 覆盖模式切换、草稿保留、变量输入 |
| create | `e2e/workspace-unified-editor.spec.ts` | 合一编辑区、模板模式、文本模式 E2E |
| modify | `e2e/helpers/workspace-actions.ts` | 如需要，补充编辑模式操作 helper |

## 实现规格

### 前端部分

#### 1. `EditingPane`

- 接收当前工作台状态、初始 `promptText`、模板加载内容和后续生成区 slot。
- 在 FEAT-02 中可以保留 FEAT-03 的轻量生成区占位，但不能让生成设置挤占合一编辑区主体。
- 确保 `EditingPane` 在分析中、分析完成、生成中、生成完成后不被卸载。

#### 2. `UnifiedPromptEditor`

- 维护 `mode: "template" | "text"`。
- 维护 `templateSource`、`variableValues`、`promptText` 三份草稿。
- 初始值规则：
  - 从模板加载进入时：`templateSource = template.content`，默认进入模板模式。
  - 从分析完成进入时：`promptText = analysis.promptText`，默认可进入文本模式；如已有模板上下文则进入模板模式。
- 模式切换规则：
  - 模板 -> 文本：用 `replaceVariables(templateSource, variableValues)` 生成完整提示词，并作为文本模式初始值；若用户已手动编辑文本草稿，不能无提示覆盖。
  - 文本 -> 模板：不反向解析文本；保留模板草稿和变量值。
- 对外输出 `resolvedPromptText` 给 FEAT-03 生成提交使用。

#### 3. 模板变量合并规则

- 每次 `templateSource` 变化后调用 `extractVariables(templateSource)`。
- 变量列表按首次出现顺序展示。
- 同名变量保留已有 `variableValues[name]`。
- 新增变量默认值为空字符串。
- 已删除变量从 `variableValues` 移除。
- `replaceVariables` 继续按变量名长度降序替换，避免短变量误替换长变量。

#### 4. 文本模式与负面提示 UI

- 工作台右侧不再展示 Negative Prompt / 负面提示输入。
- 文本模式只展示完整生成提示。
- `negativePromptText` 可继续存在于 `useWorkspaceState` 作为接口兼容字段，但 FEAT-02 不再让用户编辑它。

#### 5. E2E red spec

- `e2e/workspace-unified-editor.spec.ts` 必须先 red。
- 覆盖：模板模式出现、变量列表出现在模板正文外、变量值变更后文本模式展示完整提示、切回模板模式不清空模板原文。
- 覆盖：携带模板 ID query 进入工作台时自动加载模板并进入模板模式。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `workspace-unified-editor` E2E red spec | frontend | done | 覆盖 AC-03/09 |
| 2 | 创建 `EditingPane` 容器 | frontend | done | 接入 FEAT-01 右侧编辑区 |
| 3 | 创建 `UnifiedPromptEditor` | frontend | done | 管理模式、草稿和 resolved prompt |
| 4 | 创建 `TemplateModeEditor` 和 `TemplateVariablePanel` | frontend | done | 模板原文与变量列表分离 |
| 5 | 创建或改造 `TextModeEditor` / `PromptEditor` | frontend | done | 移除工作台可见负面提示输入 |
| 6 | 补充变量合并 helper 和单元测试 | frontend | done | 首次出现顺序、同名保留、新增/删除变量 |
| 7 | 改造 `WorkspacePage` 接入合一编辑区 | frontend | done | 不改变生成提交，FEAT-03 再接最终提交 |
| 8 | 添加组件测试 | frontend | done | 模式切换和草稿不丢失 |
| 9 | 跑通 E2E green 和基础验证 | frontend | done | 记录 green 证据 |

## 验收标准

### 前端验收

- [x] AC-03 右侧主体始终是合一编辑区，不被状态切换或生成设置替换。
- [x] AC-03 用户在模板模式和文本模式中的编辑内容不因上传、分析完成、生成中、生成完成状态切换丢失。
- [x] AC-09 模板模式展示可编辑模板原文，并在模板正文之外展示变量输入框列表。
- [x] AC-09 文本模式展示可编辑的完整生成提示。
- [x] AC-09 模式切换不清空模板原文、变量值或文本草稿。
- [x] AC-09 模板原文新增同名变量时保留已有变量值；新增变量为空；删除变量从列表移除。
- [x] 模板加载：工作台 query 携带模板 ID 时，自动加载模板内容进入模板模式，模板原文和变量列表正确显示。
- [x] E2E-TDD：`e2e/workspace-unified-editor.spec.ts` 先 red 后 green。
- [x] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-02-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-02-e2e-green-{date}.md`。

### 性能验收

- [x] 模式切换和变量提取均为本地操作，不发起网络请求。（架构 §8.1）
- [x] 百级变量以内编辑模板原文不会阻塞输入；如测试中不构造百级变量，至少用单元测试覆盖变量提取复杂度边界。（架构 §8.1）

## 验证命令

```bash
pnpm e2e -- e2e/workspace-unified-editor.spec.ts
pnpm vitest --run src/lib/__tests__/template-parser.test.ts src/components/workspace/__tests__/unified-prompt-editor.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-03/09，§3.2，§4.2，§6.3，§7.2，§7.6，§8.1
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/prompt-editor.tsx`、`src/components/workspace/template-wizard.tsx`、`src/lib/template-parser.ts`
- **契约 / 数据对象**: `WorkspacePromptMode`、`UnifiedPromptDraft`、`TemplateVariableView`
- **下游消费方**: FEAT-03 从本功能读取 `resolvedPromptText` 并提交给生成 API。

## 风险与边界

- **执行顺序**: 先 E2E red，再变量 helper，再组件，再页面接线，最后 green。
- **验证失败排查方向**: 优先检查模式切换时是否覆盖 `promptText`、变量合并是否错误删除值、E2E mock 是否加载模板内容。
- **允许修改的额外文件**: `src/types/models.ts` 仅限新增前端 UI 类型导出；避免改后端模型。
- **暂停条件**: 如果需要把变量值持久化到数据库或新增模板 API，停止并回报，因为架构要求变量状态前端派生。
- **E2E 不适用说明**: 不适用；本功能是用户可观察编辑能力，必须有 E2E。
- **风险备注**: 旧 `TemplateWizard` 可能仍被其他模板流程引用；不要直接删除，除非确认无引用或同步更新全部调用方。

### 文件清单偏差说明

| 文件 | 处理结论 | 原因 |
| --- | --- | --- |
| `src/components/workspace/prompt-editor.tsx` | waived - legacy 保留 | 工作台已改用 `UnifiedPromptEditor` + `TextModeEditor`，旧 `PromptEditor` 保留给既有测试和非 09 工作台路径，不再在工作台渲染负面提示输入。 |
| `src/components/workspace/template-wizard.tsx` | waived - legacy 保留 | 工作台模板变量常驻编辑已由 `TemplateModeEditor` + `TemplateVariablePanel` 承接，旧向导保留避免影响历史模板流程。 |

### 审核修复记录

- 已补 `src/components/workspace/__tests__/unified-prompt-editor.test.tsx`，覆盖模式切换、变量输入、手动文本草稿保留和外部 prompt 更新。
- 已修复 `UnifiedPromptEditor` 外部 `initialPromptText` 更新场景：当历史恢复或外部上下文替换 prompt 时，文本草稿会刷新；组件自身向父级同步的 resolved prompt 不会反向覆盖模板草稿。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 模板无变量 | 模板模式显示原文编辑，变量列表为空态 | done |
| 模板新增变量 | 变量列表新增输入框，已有同名变量值保留 | done |
| 模板删除变量 | 变量列表移除该项，不影响模板原文其他内容 | done |
| 文本模式手动编辑后切回模板模式 | 不反向解析文本，保留模板草稿和变量值 | done |
| 模板变量标记异常 | 尽量提取可识别变量，保留模板原文，文本模式可直接编辑 | done |
| 工作台状态切换 | 合一编辑区不卸载，草稿不清空 | done |
