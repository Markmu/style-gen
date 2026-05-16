---
feat_id: "FEAT-03"
title: "模板保存默认值承接"
dimension: mixed
phase: 3
status: done
depends_on: ["FEAT-02"]
---

# FEAT-03: 模板保存默认值承接

## 功能概要

- **目标**: 保存为模板时显式提交并持久化当前变量默认值和元信息，使自动模板被用户主动保存后，下次加载仍能看到变量和当前默认值。
- **完成后可观察结果**: 用户在自动模板模式中修改变量后点击“保存为模板”，保存弹窗提交当前模板正文、当前变量值、label/sourceField 和来源 analysisTaskId。后端按正文变量名过滤请求变量，只保存正文中实际存在且合法的变量默认值；保存成功后再次加载该模板，变量输入框会显示用户保存时的当前值，而不是空默认值。非法、重复或正文外变量不会污染模板库，保存失败时编辑草稿仍保留。
- **依赖**: FEAT-02
- **关联验收标准**: [AC-06]
- **涉及架构模块**: TemplateSaveDialog, Template API, Template Repository, Template Parser, UnifiedPromptEditor
- **前置条件**: FEAT-02 已能在工作台维护当前模板正文和当前变量元信息；模板 API 认证和现有模板列表/详情流程保持可用。
- **不在范围**: 自动保存每次分析结果、多套模板候选、公共模板库、复杂变量类型、模板分享或模板市场。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/lib/template-parser.ts` | 新增 `mergeTemplateVariables(content, providedVariables)`，按正文变量名过滤并保留默认值/label/sourceField |
| modify | `src/lib/__tests__/template-parser.test.ts` | 覆盖默认值保留、非法变量过滤、重复变量、正文变量顺序、正文外变量丢弃 |
| modify | `src/lib/repositories/template-repository.ts` | `createTemplate` / `updateTemplate` 接收可选 variables，保存 merge 后结果 |
| modify | `src/lib/repositories/__tests__/template-repository.test.ts` | 覆盖创建/更新模板时默认值保留和正文 source of truth |
| modify | `src/app/api/templates/route.ts` | 创建模板请求体验证可选 variables，并传入 repository；日志记录默认值数量 |
| modify | `src/app/api/templates/[id]/route.ts` | 更新模板请求体验证可选 variables，并传入 repository；日志记录默认值数量 |

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/unified-prompt-editor.tsx` | 向父级暴露当前模板变量元信息和当前变量值，用于保存 |
| modify | `src/components/workspace/editing-pane.tsx` | 转发当前变量列表给 `WorkspacePage` |
| modify | `src/app/workspace/page.tsx` | 保存弹窗打开时传入当前模板正文、当前变量元信息和 sourceAnalysisTaskId |
| modify | `src/components/workspace/template-save-dialog.tsx` | 接收 initialVariables，保存请求携带 variables，并在预览中展示默认值 |
| create | `src/components/workspace/__tests__/template-save-dialog.test.tsx` | 新建保存弹窗组件测试，覆盖携带变量默认值提交和错误保留草稿 |
| create | `e2e/template-default-values.spec.ts` | 保存自动模板默认值、重新加载模板后默认值不丢失 E2E |
| modify | `e2e/helpers/mock-api.ts` | 增加模板保存/详情 mock，断言请求 variables |

## 实现规格

### 后端部分

#### 1. `mergeTemplateVariables`

- 在 `src/lib/template-parser.ts` 新增：
  - 输入：`content: string`、`providedVariables?: TemplateVariable[]`
  - 输出：`TemplateVariable[]`
- 合并算法：
  - 用 `extractVariables(content)` 按正文首次出现顺序得到变量名。
  - 对每个正文变量名查找 `providedVariables` 中同名且名称合法的第一项。
  - 找到时保留 `defaultValue`、`label`、`sourceField`；未找到时 `defaultValue = ""`。
  - 丢弃正文中不存在、名称非法、重复的请求变量。
  - 对 `defaultValue` 和 `label` 做长度上限保护，避免超长 JSON 写入和 UI 卡顿。（架构 §8.3）
  - 非法 `sourceField` 丢弃该字段，不影响变量保存。
- `extractVariables` 保持原有行为，避免破坏旧调用方。

#### 2. Repository 创建/更新

- `createTemplate(userId, data)` 增加 `variables?: TemplateVariable[]`。
- 创建时使用 `mergeTemplateVariables(data.content, data.variables)` 代替 `extractVariables(data.content)`。
- `updateTemplate(id, userId, data)` 增加 `variables?: TemplateVariable[]`。
- 更新 content 时使用新 content + provided variables 合并；只更新 variables 且 content 未变时，用 existing.content + provided variables 合并。
- 复制模板 `duplicateTemplate` 保持复制已有变量默认值，不需要重新提取为空默认值。
- 日志中 `template_created` / `template_updated` 记录 `variableCount` 和 `defaultValueCount`。（架构 §8.5）

#### 3. API 请求体验证

- `POST /api/templates` 请求体增加可选 `variables`：
  - 必须是数组，长度上限建议 20。
  - 每项 `name` 必须是 string 且合法，`defaultValue` 必须是 string，可为空。
  - `label` / `sourceField` 可选，非法可返回 400 或在 merge 中丢弃；推荐 API 做基础类型校验，merge 做 source of truth 过滤。
- `PUT /api/templates/:id` 同样支持可选 `variables`。
- `sourceAnalysisTaskId` 为可选来源标记：
  - 类型为 string，来源为 frontend_computed，仅表示本次保存来自哪个分析任务上下文。
  - 首版不写入 `templates` 表，不参与模板权限判断，不作为保存成功的必要条件。
  - API 接受并可在 `template_created` / `template_updated` 日志中记录 `sourceAnalysisTaskIdPresent` 或短 ID，便于排查自动模板保存链路。
  - 若字段类型非法，返回 400；若字段缺失，按普通模板保存流程处理。
- API 契约来源：
  - `name`: user_input
  - `content`: user_input/derived
  - `variables`: derived from editor
  - `sourceAnalysisTaskId`: frontend_computed
- 保存失败沿用现有错误结构，不清空前端编辑草稿。

### 前端部分

#### 4. 当前变量元信息上报

- `UnifiedPromptEditor` 在变量值或模板正文变化后，计算当前有效变量数组：
  - name 来自当前模板正文。
  - defaultValue 来自当前 `variableValues[name]`。
  - label/sourceField 来自初始变量元信息或用户当前合并结果。
- 通过 `onTemplateVariablesChange` 通知父级。
- `EditingPane` 和 `WorkspacePage` 保存 `currentTemplateVariables`，打开保存弹窗时传入。
- 文本模式下：
  - 如果仍有模板正文和变量状态，保存为模板默认使用当前模板正文和变量元信息。
  - 如果只有普通文本，没有模板正文，则作为普通模板保存，variables 可为空。

#### 5. TemplateSaveDialog 提交

- props 增加 `initialVariables?: TemplateVariable[]`。
- 保存请求 body 增加 `variables: initialVariables`，仅在数组存在时发送。
- 若当前工作台存在 `analysisTaskId` 且保存内容来自自动模板上下文，保存请求 body 同时携带 `sourceAnalysisTaskId`；普通文本模板或旧模板保存可不携带该字段。
- 变量预览从只展示 `{{name}}`，升级为展示变量名和当前默认值；默认值为空时显示短占位，不影响保存。
- 保存失败时保留 name/content/variables 的当前输入状态。
- 成功保存后关闭弹窗并让父级保留当前工作台上下文。

#### 6. E2E red spec

- 新建 `e2e/template-default-values.spec.ts`，先 red，再实现到 green。
- 场景至少覆盖：
  - 自动模板 ready 后修改 `subject` 变量，点击保存为模板。
  - 拦截 `POST /api/templates`，断言 body.variables 包含修改后的 defaultValue、label/sourceField，且 body.sourceAnalysisTaskId 等于当前 analysisTaskId。
  - 保存成功后通过 templateId 加载模板，变量输入框显示保存时的默认值。
  - 请求中包含正文外变量时，后端返回模板不包含该变量。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `template-default-values` E2E red spec | frontend | done | 覆盖 AC-06 保存与重新加载 |
| 2 | 编写 parser/repository/API red 测试 | backend | done | 默认值保留和正文变量 source of truth |
| 3 | 实现 `mergeTemplateVariables` | backend | done | 过滤非法、正文外和重复变量 |
| 4 | 改造 Template Repository 创建/更新 | backend | done | 接收并保存变量默认值 |
| 5 | 改造 Template API 请求体验证和日志 | backend | done | 可选 variables + 可观测性 |
| 6 | 改造编辑器向父级上报当前变量元信息 | frontend | done | FEAT-02 当前变量值用于保存 |
| 7 | 改造保存弹窗提交和变量预览 | frontend | done | 请求携带 variables，错误保留草稿 |
| 8 | 跑通 E2E green 和全局模板回归 | mixed | done | 模板加载默认值不丢失 |

## 验收标准

### 混合验收

- [x] AC-06 自动模板模式下保存模板时，请求体包含当前模板正文、当前变量默认值、label/sourceField 和 `sourceAnalysisTaskId`。
- [x] AC-06 用户修改变量后保存，保存后的模板变量 defaultValue 等于用户当前看到/修改后的值，而不是最初分析默认值。
- [x] AC-06 下次通过 templateId 加载保存后的模板时，变量输入框显示保存时的默认值。
- [x] Template API 接受可选 `sourceAnalysisTaskId`，验证其类型；首版仅作为来源标记用于日志/排查，不写入 `templates` 表，不参与权限判断，缺失时不影响普通模板保存。
- [x] Repository 以后端重新解析的正文变量名为 source of truth，只保存正文中存在且合法的变量。
- [x] 正文外变量、非法变量名、重复请求变量会被丢弃，不污染模板库。
- [x] 更新模板时，如果请求包含 variables，默认值按当前 content 合并保存；复制模板保留已有默认值。
- [x] 保存失败时，保存弹窗和工作台编辑草稿不清空，可修改后重试。
- [x] E2E-TDD：`e2e/template-default-values.spec.ts` 先 red 后 green。
- [x] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-03-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-03-e2e-green-{date}.md`。

### 性能验收

- [x] 保存模板仍是单次数据库写入，不新增额外持久化链路。（架构 §8.1）
- [x] API 对 variables 数量和字符串长度做上限校验，避免超长 JSON 写入和 UI 卡顿。（架构 §8.3）
- [x] `template_created` / `template_updated` 记录保存变量数量和携带默认值数量。（架构 §8.5）

### 全流程验收（US 覆盖矩阵）

| US 编号 | 用户故事简述 | 承接功能 | 验证方式 |
| --- | --- | --- | --- |
| US-05 | 分析后变量模板可保存复用 | FEAT-03 | `e2e/template-default-values.spec.ts` 保存并重新加载默认值 |

- [x] US-05 可在当前工作台下走通：分析自动模板 -> 修改变量 -> 保存模板 -> 通过模板加载 -> 默认值仍在。

## 验证命令

```bash
pnpm e2e -- e2e/template-default-values.spec.ts
pnpm vitest --run src/lib/__tests__/template-parser.test.ts src/lib/repositories/__tests__/template-repository.test.ts
pnpm vitest --run src/components/workspace/__tests__/template-save-dialog.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-06，§5 ADR-3/5，§6.5，§7.3，§7.5，§8.1，§8.3，§8.5
- **相关代码**: `src/lib/template-parser.ts`、`src/lib/repositories/template-repository.ts`、`src/app/api/templates/route.ts`、`src/app/api/templates/[id]/route.ts`、`src/components/workspace/unified-prompt-editor.tsx`、`src/components/workspace/template-save-dialog.tsx`、`src/app/workspace/page.tsx`
- **契约 / 数据对象**: `TemplateVariable`、`PromptTemplate`、`CreateTemplateRequest`、`UpdateTemplateRequest`
- **下游消费方**: 模板库详情、工作台 templateId 加载、历史模板复用流程。

## 风险与边界

- **执行顺序**: 先 E2E/API/parser red，再 parser/repository/API，随后编辑器变量上报和保存弹窗，最后 green。
- **验证失败排查方向**: 优先检查保存请求 body、`mergeTemplateVariables` 正文变量顺序、repository update 分支、templateId 加载是否把 variables 传回编辑器。
- **允许修改的额外文件**: `src/components/workspace/__tests__/template-save-dialog.test.tsx` 若当前不存在可新建；`e2e/fixtures/api-responses/*.json` 可新增模板 fixture。
- **暂停条件**: 如果需要新增模板版本表、自动保存分析任务到模板库、复杂变量类型系统或模板市场能力，停止并请求确认。
- **E2E 不适用说明**: 不适用；本功能是用户可观察保存复用能力，必须有 E2E。
- **风险备注**: 现有模板保存流程只从正文提取空变量；实现时需要兼容旧模板和旧测试，不能让没有 variables 的普通模板保存失败。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 请求未传 variables | 按旧行为从正文提取变量，defaultValue 为空 | done |
| 请求传正文外变量 | merge 时丢弃 | done |
| 请求变量名非法 | API 400 或 merge 丢弃，保持模板库干净 | done |
| content 更新但 variables 仍来自旧正文 | 以后端新 content 变量名过滤保存 | done |
| 仅更新 variables 不更新 content | 用 existing.content 合并变量默认值 | done |
| 变量 defaultValue 过长 | API 拒绝或截断策略按实现统一，需测试覆盖 | done |

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 只有普通文本没有模板变量 | 保存为普通模板，variables 为空或按正文提取空默认值 | done |
| 用户保存前又改模板正文 | 当前正文和当前变量值一起提交，后端按正文过滤 | done |
| 保存失败 | 弹窗保留 name/content/variables，可重试 | done |
| 保存成功后关闭弹窗 | 工作台上下文、变量值和完整提示保持不丢失 | done |
| 加载旧模板 | 无 label/sourceField 时回退变量名，defaultValue 可为空 | done |
