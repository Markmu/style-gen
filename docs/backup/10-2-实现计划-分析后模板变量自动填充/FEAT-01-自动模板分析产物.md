---
feat_id: "FEAT-01"
title: "自动模板分析产物"
dimension: backend
phase: 1
status: done
depends_on: []
---

# FEAT-01: 自动模板分析产物

## 功能概要

- **目标**: 扩展结构化分析结果和分析任务契约，让一次分析 completed 后同时返回自动模板正文、变量默认值、模板状态和降级原因。
- **完成后可观察结果**: 当参考图分析成功且结构化结果可信时，`POST /api/analysis` 的同步响应和 `GET /api/analysis/:id` 的轮询响应会包含 `analysisTemplateContent`、`analysisTemplateVariables`、`analysisTemplateStatus` 和 `analysisTemplateReason`。ready/partial 任务的 `promptText` 已经由模板默认值渲染得到，不包含未替换变量；fallback 或结构化失败时任务仍为 completed，并保留可编辑完整提示。日志中能看到自动模板状态、变量数量和 fallback 原因，便于后续排查模型输出质量。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-07]
- **涉及架构模块**: Structurer Prompt, Structurer Validator, Analysis Repository, Analysis API
- **前置条件**: 现有分析 API、AI Provider、Drizzle schema 和 repository 测试可运行；本功能先完成数据库字段和领域类型扩展。
- **不在范围**: 工作台 UI 展示、变量输入交互、保存模板默认值、生成 API 改造、多候选模板或独立模板表。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/types/models.ts` | 扩展 `TemplateVariable`、新增 `AnalysisTemplateStatus` / `AnalysisTemplateSourceField`，在 `AnalysisTask` 增加自动模板字段 |
| modify | `src/lib/db/schema.ts` | 在 `analysisTasks` 增加自动模板正文、变量列表、状态和原因字段及 status check |
| modify | `src/lib/ai/prompts.ts` | 更新结构化整理 prompt，要求输出自动模板字段、变量优先级、fallback 规则和 JSON 契约 |
| modify | `src/lib/ai/structurer.ts` | 扩展 `StructuredResult`，新增自动模板校验、变量去重、默认值渲染、fallback 归一化和日志 |
| modify | `src/lib/repositories/analysis-task-repository.ts` | 映射并更新自动模板字段，允许 `updateAnalysisTask` 写入新字段 |
| modify | `src/app/api/analysis/route.ts` | 同步管线保存自动模板字段，L3 降级时写入 fallback/null 字段，补充可观测性日志 |
| modify | `src/app/api/analysis/[id]/route.ts` | 保持轮询响应透传扩展后的 `AnalysisTask`；必要时补响应测试 |
| modify | `src/lib/ai/__tests__/structurer.test.ts` | 覆盖 ready/partial/fallback、默认值非空、正文变量 source of truth 和未替换变量降级 |
| modify | `src/lib/ai/__tests__/prompts.test.ts` | 覆盖结构化 prompt 包含自动模板字段和 fallback 规则 |
| modify | `src/lib/repositories/__tests__/analysis-task-repository.test.ts` | 覆盖新字段创建/更新/读取映射 |
| modify | `src/app/api/analysis/__tests__/route.test.ts` | 覆盖同步分析返回自动模板字段、fallback 和 L3 降级 |
| modify | `src/app/api/analysis/[id]/__tests__/route.test.ts` | 覆盖轮询响应透传自动模板字段 |

## 实现规格

### 后端部分

#### 1. 领域类型与数据库字段

- 在 `src/types/models.ts` 中新增：
  - `AnalysisTemplateStatus = "ready" | "partial" | "fallback"`。
  - `AnalysisTemplateSourceField = "subject" | "scene" | "visual_style" | "lighting_color" | "composition" | "camera_language" | "texture" | "mood"`。
  - `TemplateVariable` 扩展可选 `label?: string`、`sourceField?: AnalysisTemplateSourceField`。
- 在 `AnalysisTask` 中增加：
  - `analysisTemplateContent: string | null`
  - `analysisTemplateVariables: TemplateVariable[]`
  - `analysisTemplateStatus: AnalysisTemplateStatus | null`
  - `analysisTemplateReason: string | null`
- 在 `src/lib/db/schema.ts` 的 `analysisTasks` 中增加同名字段，`analysisTemplateVariables` 使用 JSONB 并默认 `[]`。
- status check 仅允许 `ready/partial/fallback` 或 null。
- 数据库迁移由实现阶段运行 `pnpm db:generate` 生成；若生成迁移文件名不可预测，按生成结果纳入提交，不在本计划中预写假文件名。

#### 2. Structurer prompt 契约

- 更新 `STRUCTURER_SYSTEM_PROMPT` 输出 JSON，新增字段：
  - `analysisTemplateContent: string | null`
  - `analysisTemplateVariables: TemplateVariable[]`
  - `analysisTemplateStatus: "ready" | "partial" | "fallback"`
  - `analysisTemplateReason: string | null`
- 要求模型优先变量化主体内容、场景环境、视觉风格、光线色彩；内容明确时可补充构图、材质、镜头语言和情绪氛围。
- 明确变量上限建议 8 个，避免过多变量造成编辑负担。
- 明确输出长度预算，避免模型生成过大的模板产物：若项目已有模板或 prompt 长度常量，优先复用既有常量；否则建议 `analysisTemplateContent <= 6000` 字符、`TemplateVariable.defaultValue <= 500` 字符、`TemplateVariable.label <= 80` 字符、`analysisTemplateReason <= 500` 字符。
- 明确 fallback 时 `analysisTemplateContent` 可为 null 或普通完整提示，变量列表必须为空，`analysisTemplateReason` 说明原因。
- 明确输出仍必须是单个合法 JSON 对象，不允许 markdown fence 或解释性文本。

#### 3. Structurer validator 与渲染逻辑

- `validateStructuredResult` 需要校验既有 recipe/prompt 字段，再校验自动模板字段。
- 模板状态归一化规则：
  - 非 `ready | partial | fallback` 视为 fallback。
  - ready/partial 必须有非空 `analysisTemplateContent` 且包含合法变量标记。
  - fallback 必须返回空变量列表；普通 `promptText` 继续可用。
- 变量校验规则：
  - 变量名匹配 `[a-zA-Z_]\w*`。
  - 变量名必须在 `analysisTemplateContent` 中以 `{{name}}` 出现。
  - `defaultValue` 必须非空；空默认值变量丢弃。
  - 同名变量去重，保留正文首次出现顺序。
  - `label` 为空时允许前端回退到变量名。
  - `sourceField` 非法时丢弃该字段，不丢弃变量。
- 长度安全规则：
  - 长度上限统一在 `src/lib/ai/structurer.ts` 以常量定义；若仓库已有模板正文、prompt 或变量值长度常量，优先复用既有常量。
  - `analysisTemplateContent` 超过上限时不截断，整体降级为 fallback，`analysisTemplateContent = null`、`analysisTemplateVariables = []`，`analysisTemplateReason` 归一化为短原因。
  - `TemplateVariable.defaultValue` 超过上限时丢弃该变量；若过滤后没有可用变量，则 fallback。
  - `TemplateVariable.label` 超过上限时丢弃 label 字段，不丢弃变量；`analysisTemplateReason` 超过上限时截断为短诊断文本，禁止写入完整超长 provider 输出。
  - 任何过长模板正文或过长变量默认值都不得写入 `analysis_tasks` 或透传给前端。
- ready/partial 且校验后仍有变量时，用 `replaceVariables(analysisTemplateContent, defaultsByName)` 生成完整 `promptText`。
- 若渲染结果仍含合法 `{{name}}`，降级为 fallback，保留 provider 原始 `promptText`，`analysisTemplateContent = null`，变量列表为空。
- partial 可只保留可信变量，不强行补齐核心变量；ready 应包含核心变量中的多数项。

#### 4. Repository 与 API 保存

- `rowToAnalysisTask` 映射新字段，JSONB 空值统一成 `[]`。
- `AnalysisTaskUpdatable` 允许写入自动模板字段。
- `executeSyncPipeline` 在结构化成功时保存 recipe、渲染后的 `promptText`、negative prompt、自动模板字段和 raw response。
- L3 structurer 降级时保存：
  - `status: "completed"`
  - `recipe: null`
  - `promptText: rawAnalysis`
  - `negativePromptText: ""`
  - `analysisTemplateContent: null`
  - `analysisTemplateVariables: []`
  - `analysisTemplateStatus: "fallback"`
  - `analysisTemplateReason: error.message`
- `analysis_completed` 日志增加 `templateStatus`、`templateVariableCount`、`templateFallbackReason`。（架构 §8.5）
- `structurer_completed` 日志增加 `templateStatus`、`templateVariableCount`、`templateFallbackReason`。（架构 §8.5）

#### 5. 测试先行

- 先补 red 测试再实现：
  - `structurer.test.ts`：ready、partial、fallback、变量过滤、未替换变量降级、模板正文过长 fallback、defaultValue 过长变量丢弃、label/reason 过长处理。
  - `analysis-task-repository.test.ts`：字段落库和读取映射。
  - `analysis/route.test.ts`：同步分析返回自动模板字段、过长模板产物不透传、fallback 和 L3 降级。
  - `analysis/[id]/route.test.ts`：轮询响应包含新字段。
- 若 repository 测试依赖数据库 fixture，需要补充 schema mock 或本地测试数据库说明，不能跳过字段映射测试。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 structurer 和 analysis API red 测试 | backend | done | 覆盖 AC-01/02/03/07 的后端契约，包含过长模板产物安全边界 |
| 2 | 扩展模型类型和 Drizzle schema | backend | done | 增加自动模板字段、状态枚举、变量元信息 |
| 3 | 更新结构化 prompt 契约 | backend | done | 要求模型输出模板正文、变量默认值和状态 |
| 4 | 实现模板校验、变量过滤、长度上限和默认值渲染 | backend | done | 以模板正文变量名为 source of truth，过长内容不落库 |
| 5 | 改造 Analysis Repository 映射与更新 | backend | done | 支持新字段持久化和读取 |
| 6 | 改造 Analysis API 同步管线和 L3 降级 | backend | done | completed 响应透传自动模板字段 |
| 7 | 补充可观测性日志 | backend | done | `structurer_completed` / `analysis_completed` 注入模板状态 |
| 8 | 运行迁移生成和后端测试 green | backend | done | 已生成 `drizzle/0001_simple_ser_duncan.sql`，后端契约测试 green |

## 验收标准

### 后端验收

- [x] AC-01 `POST /api/analysis` 同步 completed 响应在 ready/partial 时包含非空 `analysisTemplateContent` 和非空 `analysisTemplateVariables`。
- [x] AC-01 `GET /api/analysis/:id` 轮询响应透传同一组自动模板字段。
- [x] AC-02 每个返回变量的 `defaultValue` 非空，且来自结构化结果中可信的参考图分析内容；非法、正文外或重复变量会被过滤。
- [x] AC-03 ready/partial 响应中的 `promptText` 由模板默认值渲染得到，不包含合法 `{{name}}` 标记。
- [x] AC-07 结构化模板字段缺失、默认值为空、变量正文不匹配或仍有未替换变量时，任务 completed 且 `analysisTemplateStatus = "fallback"`，变量列表为空，完整 `promptText` 可继续编辑和生成。
- [x] L3 structurer 失败仍沿用现有降级：`recipe = null`、`promptText = rawAnalysis`、`negativePromptText = ""`，并带 fallback 模板状态。
- [x] `analysisTemplateStatus` 仅允许 `ready | partial | fallback | null`，`analysisTemplateVariables` 对外始终是数组。
- [x] 安全边界：过长 `analysisTemplateContent` 必须 fallback 且不写入/不透传；过长 `TemplateVariable.defaultValue` 必须丢弃对应变量；过长 `label` / `analysisTemplateReason` 必须丢弃或归一化为短文本，不能把完整超长 provider 输出写入数据库或返回前端。（架构 §8.3）
- [x] API 契约检查：`POST /api/analysis` 请求体字段 `assetId/fileUrl/width/height/mimeType` 继续来自 frontend_computed；新增自动模板字段只来自 system_generated。（架构 §7.3）

### 性能验收

- [x] 自动模板不新增网络调用；结构化阶段仍只有一次 LLM 调用。（架构 §8.1）
- [x] `structurer_completed` 记录 `templateStatus/templateVariableCount/templateFallbackReason`，`analysis_completed` 记录自动模板状态。（架构 §8.5）
- [x] 分析轮询响应体新增字段后，单条响应仍保持可接受大小；变量上限建议 8 个。（架构 §8.1）
- [x] 模板正文、变量默认值、label 和 fallback reason 均有长度上限测试，避免超长 JSON 写入和 UI 卡顿。（架构 §8.3）

## 验证命令

```bash
pnpm vitest --run src/lib/ai/__tests__/structurer.test.ts src/lib/ai/__tests__/prompts.test.ts
pnpm vitest --run src/lib/repositories/__tests__/analysis-task-repository.test.ts
pnpm vitest --run src/app/api/analysis/__tests__/route.test.ts 'src/app/api/analysis/[id]/__tests__/route.test.ts'
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-01/02/03/07，§5 ADR-1/2/3/4/6，§6.1，§6.6，§7.2，§7.3，§8.1，§8.3，§8.5
- **相关代码**: `src/types/models.ts`、`src/lib/db/schema.ts`、`src/lib/ai/prompts.ts`、`src/lib/ai/structurer.ts`、`src/lib/repositories/analysis-task-repository.ts`、`src/app/api/analysis/route.ts`、`src/app/api/analysis/[id]/route.ts`
- **契约 / 数据对象**: `AnalysisTemplateStatus`、`AnalysisTemplateSourceField`、`TemplateVariable`、`StructuredResult`、`AnalysisTask`
- **下游消费方**: FEAT-02 工作台状态和编辑器直接消费本功能返回的自动模板字段。

## 风险与边界

- **执行顺序**: 先测试 red，再类型/schema，再 structurer 校验，再 repository/API，最后迁移和 green。
- **验证失败排查方向**: 优先检查 structurer JSON 字段名、变量名提取、Drizzle JSONB 默认值、repository rowToAnalysisTask 映射和 route mock。
- **允许修改的额外文件**: `drizzle/*.sql` 和 `drizzle/meta/*.json` 仅限 `pnpm db:generate` 生成的 schema 迁移文件。
- **暂停条件**: 如果实现需要新增独立自动模板表、第二次 AI 调用、生成 API 字段或异步队列，停止并请求架构确认。
- **E2E 不适用说明**: 本功能是后端分析契约扩展，用户可观察行为由 FEAT-02 的工作台 E2E 覆盖；本功能用 API/Repository/Structurer 测试作为质量门。
- **风险备注**: 输出 JSON 变长可能提高解析失败率；必须优先 fallback，不让模板错误导致分析任务失败。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| Provider 未返回自动模板字段 | 降级为 fallback，保留普通 promptText | done |
| 变量 defaultValue 为空 | 丢弃该变量；若无可用变量则 fallback | done |
| 模板正文超过长度上限 | 不截断，整体 fallback，模板正文和变量列表不落库 | done |
| 变量 defaultValue 超过长度上限 | 丢弃该变量；若无可用变量则 fallback | done |
| label 或 fallback reason 超过长度上限 | label 丢弃；reason 归一化/截断为短诊断文本 | done |
| 变量名不在模板正文中 | 丢弃变量，以正文变量名为 source of truth | done |
| 模板正文仍残留未替换变量 | fallback，不提交带 `{{name}}` 的 promptText | done |
| 结构化 JSON 解析失败 | 沿用 L3 降级，任务 completed 且模板 fallback | done |
| 数据库新字段为 null | Repository 对外归一化 variables 为 []，status/content/reason 可为 null | done |
| 响应体变量过多 | Validator 限制变量数量，优先核心变量 | done |
