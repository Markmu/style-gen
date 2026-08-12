---
feat_id: "plan-03"
title: "Workspace Reference/Evidence/Prompt 风格复刻"
dimension: frontend
phase: 2
status: done
depends_on: ["plan-02"]
---

# plan-03: Workspace Reference/Evidence/Prompt 风格复刻

## 功能概要

- **目标**: 将 Workspace 的 Reference Canvas、Style Intelligence 和 Prompt 区迁移为 AI-first Evidence Workbench，建立 `VisualRecipe -> EvidenceFacet -> PromptProvenanceSpan` 的前端视图模型和可见交互关系。
- **完成后可观察结果**: 用户上传参考图并完成分析后，左侧 Reference Canvas 以图片和失败恢复入口为核心，中间 Style Intelligence 展示色彩、构图、光线、质感、情绪和主体等 evidence facets，右侧 Prompt 区展示这些判断如何影响当前 prompt。用户点击任一 facet 时，对应 prompt 相关片段同步高亮；若无法精确匹配 prompt 文本，也会显示“相关信号”而不是伪造因果。Reference Canvas 不使用缺乏模型空间坐标支持的合成锚点。空态、分析中和失败态都说明 AI 将读取或已经保留的上下文，并提供继续行动。
- **依赖**: plan-02（AppShell 与 AI 状态头）
- **关联验收标准**: [AC-02, AC-03, AC-08, AC-09]
- **涉及架构模块**: WorkspaceExperience、Evidence/Prompt/Render 契约、StatePresenter/StatusLanguage
- **前置条件**: plan-01 token/status 可用；plan-02 壳层和 AI 状态头已完成；现有上传、分析、模板变量、保存模板入口保持可用。
- **不在范围**: Render Dock 生成 readiness 完整实现、Iteration Memory 历史恢复、Style Memory 列表迁移、真实后端 provenance 字段。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 增加 selectedFacetId、evidence facets、prompt provenance 派生和 Style Intelligence / Prompt 接线 |
| modify | `src/components/workspace/workspace-three-column-layout.tsx` | 微调三栏命名、宽屏层级、overflow、aria-label 和空态可见区域 |
| modify | `src/components/workspace/reference-card.tsx` | 迁移为 Reference Canvas，以充分利用画布的参考图和失败恢复表达为核心 |
| modify | `src/components/workspace/recipe-card.tsx` | 迁移为 Style Intelligence，展示 facets、confidence、selected 状态 |
| modify | `src/components/workspace/prompt-card.tsx` | 展示 prompt provenance、variables、negative constraints、单一保存 Style Memory 入口 |
| modify | `src/components/workspace/unified-prompt-editor.tsx` | 保持编辑语义，暴露 provenance/selected span 的非破坏性展示能力 |
| create | `src/lib/evidence-facets.ts` | 从 `VisualRecipe` 派生 `EvidenceFacet[]` 的纯函数 |
| create | `src/lib/prompt-provenance.ts` | 从 prompt + facets 派生 `PromptProvenanceSpan[]` 的纯函数 |
| create | `src/lib/__tests__/evidence-facets.test.ts` | 覆盖字段顺序、缺失字段、confidence/tone 以及兼容排序字段 |
| create | `src/lib/__tests__/prompt-provenance.test.ts` | 覆盖长文本优先、大小写、无匹配 facet_only |
| modify | `src/components/workspace/__tests__/reference-card.test.tsx` | 覆盖画布填充、无合成 overlays、失败恢复、空态教学 |
| modify | `src/components/workspace/__tests__/recipe-card.test.tsx` | 覆盖 facets、selected 高亮、confidence |
| modify | `src/components/workspace/__tests__/prompt-card.test.tsx` | 覆盖 provenance、variables、保存入口 |
| create | `e2e/workspace-ai-first-evidence.spec.ts` | Workspace evidence/provenance targeted E2E |

## 实现规格

### 前端部分

#### 1. EvidenceFacet 派生

创建 `src/lib/evidence-facets.ts`，实现纯函数：

- 输入：`recipe: VisualRecipe | null`
- 输出：`EvidenceFacet[]`
- 固定字段顺序：`color -> composition -> lighting -> texture -> mood -> subject`
- 非空文本才生成 facet，缺失字段不渲染空 facet。
- 每项包含 `id`、`label`、`summary`、`tone`、`confidenceLabel`、`sourceField`、`anchorIndex`；`anchorIndex` 仅保留为兼容排序字段，不代表图像空间坐标。
- `confidenceLabel` 首版用确定性启发式：文本长度、关键词数量、字段是否存在；不能调用 AI 或 API。
- `anchorIndex` 按数组顺序稳定生成，但不得据此在 Reference Canvas 伪造空间锚点；只有模型 contract 提供真实坐标后才能新增此类可视化。

#### 2. Prompt provenance 派生

创建 `src/lib/prompt-provenance.ts`：

- 输入：`promptText: string`、`facets: EvidenceFacet[]`
- 输出：`PromptProvenanceSpan[]`
- 匹配规则：从 facet summary 提取关键词，长文本优先，小写比较，避免短词覆盖长词。
- 无匹配时返回 `matchType: "facet_only"`，`startIndex/endIndex: null`，UI 显示 facet chip 与解释文案。
- 不创建可编辑 AST，不修改用户 prompt 原文。
- Prompt provenance chips、状态说明和 UI copy 仅用于界面解释，不拼入 AI system prompt 或用户 prompt；用户编辑内容、AI 输出说明和 negative prompt/constraints 的视觉边界必须可辨认。

#### 3. Workspace page 状态接线

在 `src/app/workspace/page.tsx` 中：

- 增加 `selectedFacetId: EvidenceFacetId | null` 的 UI state，不写入 sessionStorage 或后端。
- 从 `ws.recipe`、`resolvedPromptText || ws.promptText` 派生 facets 和 spans，使用 `useMemo` 控制计算。
- `ReferenceCard` 独立展示参考图；facets/spans 传入 `RecipeCard`、`PromptCard`，点击 facet 时同步更新 selected 状态。
- 保留现有上传、分析轮询、变量编辑、模板保存、history、generation dialog 和 `templateId` query 行为。

#### 4. Reference Canvas

`ReferenceCard` 迁移为 Reference Canvas：

- 空态：解释 AI 将读取色彩、构图、光线、质感、情绪，并提供上传入口。
- 有图态：图片以 `object-fit: cover` 充分利用可用画布；不展示缺乏真实空间证据的 facet anchors、palette 或 overlay controls。
- 分析中：保留参考图，说明正在读取哪些信号；超过 60s 时接收 queued copy。
- 分析失败：保留 reference、assetId 和可重试上下文，提供 Retry analysis 与 Replace；不得只显示红色错误。

#### 5. Style Intelligence

`RecipeCard` 迁移为 Style Intelligence：

- 展示 facets 列表、confidence、source field、相关 prompt 状态。
- 点击 facet 触发 `onFacetSelect(id)`；selected facet 视觉高亮并可通过 keyboard focus 操作。
- 若 recipe 为空，显示教学空态；若分析中，显示 AI 正在组织 evidence 的 loading。
- 文案使用“相关信号”而非“精确因果”。

#### 6. Prompt provenance

`PromptCard` 与 `UnifiedPromptEditor`：

- 继续支持 `analysisTemplateContent`、`analysisTemplateVariables`、`onResolvedPromptChange`、`onTemplateVariablesChange`。
- 保留 Prompt 区块上方外层的单一保存 Style Memory 入口，不新增重复保存按钮。
- 在 prompt 旁展示 provenance chips/spans；selected facet 对应 span 高亮。
- negative prompt/constraints 保持可见但不喧宾夺主。

#### 7. E2E red/green

`e2e/workspace-ai-first-evidence.spec.ts` 覆盖：

- 空态工作台说明 AI 将读取的 signals。
- mock 分析完成后 facets 出现，字段顺序稳定。
- 点击 facet 高亮 Style Intelligence 与 Prompt provenance，同时确认 Reference Canvas 不虚构图像坐标。
- 无精确 span 时显示 facet-only 解释。
- 分析失败时 reference/prompt context 保留，Retry/Replace 可见。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `workspace-ai-first-evidence.spec.ts` red 用例和证据 | frontend | done | red 证据已在 `docs/e2e/evidence/plan-03-e2e-red-20260705.md` |
| 2 | 实现 evidence facets 和 prompt provenance 纯函数及单元测试 | frontend | done | 不新增后端字段或 AI 调用 |
| 3 | 在 workspace page 派生 selected facet/facets/spans 并接线 | frontend | done | selectedFacetId 仅为前端 UI state |
| 4 | 改造 ReferenceCard 为 Reference Canvas | frontend | done | 覆盖空态、有图、分析中、失败恢复 |
| 5 | 改造 RecipeCard 为 Style Intelligence | frontend | done | facets、confidence、selected 高亮 |
| 6 | 改造 PromptCard/UnifiedPromptEditor provenance 展示 | frontend | done | 保留变量编辑和单一保存入口 |
| 7 | 更新组件测试 | frontend | done | reference/recipe/prompt 三类组件 |
| 8 | 运行 red/green E2E、单元测试、类型检查和构建 | frontend | done | implement 步骤已确认 red spec 转绿；green 证据由 test-e2e 步骤写入 |

## 验收标准

### Workspace Evidence 验收

- [x] AC-02 `/workspace` 常规宽屏下仍有 Reference Canvas、Style Intelligence、Prompt + Render 结构，三栏层级稳定。
- [x] AC-03 分析完成后从 `VisualRecipe` 派生主要 style signals，并展示 label、summary、confidence 和 source field。
- [x] AC-03 点击 facet 后 Style Intelligence 与 Prompt provenance 同步高亮；Reference Canvas 在缺少真实空间坐标时不生成合成 anchor。
- [x] AC-03 无可匹配 prompt 片段时展示 facet chip 和“相关信号”说明，不伪造精确 span。
- [x] AC-03 Prompt provenance 和状态说明只作 UI 展示，不拼入 system prompt；用户 prompt、AI 输出说明和 negative prompt/constraints 边界可见。
- [x] AC-08 分析失败保留 reference/prompt context，Retry analysis、Replace 和 Back to Edit 行动可见。
- [x] AC-09 Workspace 空态说明 AI 将读取的信号，并提供上传参考图或选择 Style Memory 的入口。
- [x] E2E-TDD：`e2e/workspace-ai-first-evidence.spec.ts` 已先 red 后在 implement 步骤转 green；red 证据在 `docs/e2e/evidence/plan-03-e2e-red-20260705.md`，green 证据由 test-e2e 步骤写入。

### 性能验收（架构 §8.1 目标）

- [x] AC-03 Evidence facet 与 prompt provenance 均为前端同步派生，不触发额外网络请求（架构 §8.1）。

### 降级回归验收（架构 §8.2）

- [x] AC-08 分析 queueing、analysis failed、no reference 空态在新三栏中正确显示，不被 overlay、anchors 或 prompt 区遮挡。

## 验证命令

```bash
pnpm vitest --run src/lib/__tests__/evidence-facets.test.ts src/lib/__tests__/prompt-provenance.test.ts src/components/workspace/__tests__/reference-card.test.tsx src/components/workspace/__tests__/recipe-card.test.tsx src/components/workspace/__tests__/prompt-card.test.tsx
pnpm e2e -- e2e/workspace-ai-first-evidence.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-02/AC-03/AC-08/AC-09、§3.1、§6.2、§6.3、§7.1、§7.2、§8.1、§8.2、ADR-4。
- **相关代码**: `src/app/workspace/page.tsx`、`src/components/workspace/reference-card.tsx`、`src/components/workspace/recipe-card.tsx`、`src/components/workspace/prompt-card.tsx`、`src/components/workspace/unified-prompt-editor.tsx`、`src/types/models.ts`。
- **契约 / 数据对象**: `VisualRecipe`、`EvidenceFacet`、`PromptProvenanceSpan`、`TemplateVariable`、`WorkspaceContext`。
- **下游消费方**: plan-04 Render Dock 使用 prompt/variables/facets 判断 readiness；plan-05 history restore 写回 recipe/prompt 后复用本功能显示。

## 风险与边界

- **执行顺序**: 先补 red E2E，再实现纯函数和单元测试，随后改 workspace 接线和卡片 UI。
- **验证失败排查方向**: 检查 `VisualRecipe` 字段映射、span index 是否越界、selected facet state 是否被 sessionStorage 持久化、失败态是否仍清空 context。
- **允许修改的额外文件**: 无。
- **暂停条件**: 如果 AC-03 必须依赖真实后端 provenance 字段、可编辑 prompt AST 或新增 `/api/evidence`，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能为核心用户可观察工作台链路。
- **风险备注**: Prompt provenance 首版是前端启发式关系展示，文案必须避免声明精确因果。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| recipe 为 null | facets 返回空数组，Reference/Style Intelligence 显示教学空态 | done |
| recipe 字段缺失 | 跳过缺失字段，不渲染空 facet | done |
| prompt 无匹配片段 | provenance 返回 facet_only，UI 显示相关信号 chip | done |
| 分析失败 retryable | 保留 reference/prompt，展示 Retry analysis 和 Replace | done |
| 用户编辑 prompt 后 | provenance 重新派生，变量编辑语义不变 | done |
