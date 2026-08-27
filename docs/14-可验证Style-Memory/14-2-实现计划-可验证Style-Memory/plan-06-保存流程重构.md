---
feat_id: "plan-06"
title: "保存流程重构"
dimension: frontend
phase: 4
status: done
depends_on: ["plan-02", "plan-03", "plan-05"]
---

# plan-06: 保存流程重构

## 功能概要

- **目标**: 重构两条保存链路——从完成 Iteration 保存的三步向导（结果与代表结果 → 保留规则与可替换变量 → 命名）替换现有单步对话框；工作区草稿保存对齐同一向导骨架并明确"待验证"预期；交付 V1/V2 配方到规则四元组的预填映射纯函数。
- **完成后可观察结果**: 从 Iteration 详情点"保存为 Style Memory"，先并排看到参考图与本次结果并可勾选"设为代表结果"（默认不勾选，勾选联动最终"保存后状态"文案），第二步确认/编辑核心保留规则、排除约束与可替换变量默认值（缺失项明确标记），第三步命名保存，成功直接进入新 Memory 详情；保存进行中按钮锁定，失败时全部已确认内容与所在步骤保留可重试。从工作区保存则首屏说明无代表结果、将保存为待验证。两种流程都不会在用户未操作时提前显示必填错误。
- **依赖**: plan-02（POST 扩展契约）、plan-03（ModalDialog）、plan-05（保存成功的跳转目标——新 Memory 详情路由）
- **关联验收标准**: [AC-04, AC-08, AC-11]
- **涉及架构模块**: ⑤ 保存流程模块
- **前置条件**: plan-02/03/05 完成（AC-04"成功后进入新详情"的断言依赖详情页存在）。
- **不在范围**: 预检与工作区身份（plan-07）；Iteration 详情其余改动（仅保存入口与传参）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/style-memory-prefill.ts` | 配方 → 规则四元组预填映射（V1/V2 分支 + 缺失标记） |
| create | `src/lib/__tests__/style-memory-prefill.test.ts` | 两种 schemaVersion + fallback 用例 |
| modify | `src/components/iterations/save-style-memory-dialog.tsx` | 重构为三步向导（ModalDialog 原语） |
| modify | `src/components/iterations/iteration-detail-panel.tsx` | 向导宿主：预填载荷按架构 §6.3 实际字段传参 |
| modify | `src/components/workspace/template-save-dialog.tsx` | 草稿保存流程对齐（无代表结果分支） |
| modify | `src/app/workspace/page.tsx` | 草稿向导接线（props/回调适配） |
| create | `e2e/style-memory-save-flows.spec.ts` | AC-04/11 场景（red 先行） |
| modify | `e2e/workspace-iteration-save-style-memory.spec.ts` | 旧单步保存对话框的直接回归 owner（targeted 门内），按三步向导口径改写：入口条件与"已保存为 Style Memory"状态用例保留，单步表单断言改为向导步骤断言 |
| modify | `e2e/workspace-ai-first-iteration-memory.spec.ts` | 保存入口回归用例更新 |
| modify | `e2e/template-default-values.spec.ts` | 与 plan-04 协同：涉及保存弹窗的默认值用例随向导口径更新（若 plan-04 已完成则仅核对无回归） |

## 实现规格

### 前端部分

#### 1. 预填映射纯函数（`style-memory-prefill.ts`）

```ts
interface StyleMemoryPrefillInput {
  recipe: StoredVisualRecipe | null;
  recipeSource: "snapshot" | "fallback" | "missing";
}
interface StyleMemoryPrefill {
  retainedRules: string[];      // 预填值（用户可改）
  negativeConstraints: string[];
  styleTokens: string[];        // 快照值
  enhancementHints: string[];
  missing: Array<"rules" | "constraints" | "tokens" | "enhancements">; // 缺失标记
}
export function deriveStyleMemoryPrefill(input: StyleMemoryPrefillInput): StyleMemoryPrefill;
```

映射算法（架构 §6.3，按 `recipe.schemaVersion` 分支）：

- **V2**：`retainedRules ← styleInvariants[].value`（`kind=hard` 优先排序）；`negativeConstraints ← negativeConstraints`；`enhancementHints ← optionalModifiers[].defaultValue`（过滤空）；`styleTokens ← styleFingerprint.tokens`
- **V1**：`retainedRules ← mustKeep`；`styleTokens ← styleTags`；`enhancementHints ← visualKeywords`；排除约束由调用方传入负面提示文本（流程 A `negativePromptSnapshot` / 流程 B `negativePromptText`），非空整体作为一条
- **fallback 配方**（`extractionStatus=fallback`，无 promptOutputs/规则结构）或 `recipe=null`：四组全空 + `missing` 全标记，不推测补齐（PRD 规则 11）
- 各分支结果为空数组的组别加入 `missing`

#### 2. 三步向导（`save-style-memory-dialog.tsx` 重构，流程 A）

宿主传参（`iteration-detail-panel.tsx`，字段来自 `IterationDetail`）：`promptSnapshot`（content 高级信息预填）、`recipe` + `recipeSource`、`variables` + `variablesSource`、`sourceAssetId`、`id`（→ sourceGenerationTaskId）、`resultFileUrl`（本次结果图）、`negativePromptSnapshot`。

- **ModalDialog 原语**（plan-03）承载；步骤状态 `1|2|3` 保留在组件 state，可往返且不丢已确认内容
- **步骤 1**：并排参考图（详情 sourceImageUrl）与本次结果（`resultFileUrl`）+ `☑ 设为代表结果`（**默认不勾选**）；说明文案："勾选并保存后，这条 Memory 将标记为用户已验证"
- **步骤 2**：`deriveStyleMemoryPrefill` 预填；规则与排除约束逐条可勾选/编辑/增删（≤12 条 × 200 字符）；同屏确认可替换变量及默认值（预填自 `variables`，默认值可编辑，随提交携带）；`styleTokens` / `enhancementHints` 只读展示（快照，随提交携带）；缺失组显示"本次迭代无 X"标记
- **步骤 3**：名称（必填 1–50，中性帮助文案，提交或失焦才显示错误）、说明（≤500）、高级信息折叠预览完整提示（`promptSnapshot` 可编辑）；底部固定"保存后状态：用户已验证 / 待验证"随步骤 1 勾选**即时联动**
- **提交**：`POST /api/templates` 扩展体（字段与 `SaveStyleMemoryRequest` 一致；勾选时 `representativeGenerationTaskId = sourceGenerationTaskId`）；进行中锁定全部按钮防重复提交；成功 `router.push('/workspace/templates/{id}')` 且新详情初始焦点置于首要内容（plan-03 约定）
- **失败保留**（AC-11）：409 显示服务端文案（聚焦名称字段引导改名）；5xx/网络错误显示可重试错误条；**全部步骤内容、当前步骤、勾选状态保留**；重试成功不产生重复 Memory；打开时每次以该次迭代快照重置（沿用现有 useEffect 重置模式）

#### 3. 草稿保存（`template-save-dialog.tsx` 重构，流程 B）

- 首屏（原单步表单前）增加说明区："当前没有代表结果，本次将保存为待验证；之后可以从相关的已完成 Iteration 补充代表结果"
- 复用同一向导骨架（跳过步骤 1 的代表结果勾选）：规则/排除/变量确认 → 命名；预填用 `deriveStyleMemoryPrefill`（工作区配方，现行链路 V2）+ 工作区 `negativePromptText`
- 提交体不含 `representativeGenerationTaskId` / `sourceGenerationTaskId`；携带 `sourceAssetId`（工作区有参考图时）；底部预期状态固定"待验证"
- 宿主 `workspace/page.tsx` 的 props/回调按新向导适配（保存成功同样进入新详情）

#### 4. E2E（`e2e/style-memory-save-flows.spec.ts`，red 先行）

mocked 模式覆盖 AC-04（两条流程全序列 + 保存进行中锁定 + 无提前必填错误）、AC-11（409 改名重试成功 / 5xx 直接重试成功，内容保留、无重复创建）、AC-08（向导三步间键盘往返、Escape 取消还原焦点、确认后详情焦点落点）。同步更新 `workspace-ai-first-iteration-memory.spec.ts` 中保存入口受影响用例。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：style-memory-save-flows.spec.ts 编写并确认失败 | frontend | done | red 证据留存 `docs/e2e/evidence/plan-06-e2e-red-2026-08-26.md`（12/12 预期失败） |
| 2 | prefill 纯函数 + 单测 | frontend | done | V2/V1/fallback 三分支，8 用例全绿 |
| 3 | 三步向导重构（流程 A） | frontend | done | ModalDialog + 状态联动 + 提交锁 |
| 4 | 宿主传参适配（iteration-detail-panel） | frontend | done | 按 IterationDetail 实际字段（variablesSource 由详情降级提示消费，向导预填仅需 variables） |
| 5 | 草稿保存重构（流程 B） | frontend | done | 无代表结果分支 + workspace 接线 |
| 6 | 存量 e2e 回归更新 | frontend | done | 主三 spec 向导口径改写全绿；共享对话框联动 spec（template/card-expand/render-dock/integration/analysis-structured）已同步改写并复跑全绿（见 green 证据"存量回归与联动改写"） |
| 7 | green：spec 全绿 + verify:fast | frontend | done | green 证据留存 `docs/e2e/evidence/plan-06-e2e-green-2026-08-26.md` |

## 验收标准

### 功能验收

- [x] AC-04 流程 A：三步依次确认代表结果（默认不勾选）、保留规则、变量与名称后保存；勾选 → 新详情显示"用户已验证"与该代表结果；不勾选 → "待验证"（e2e 双分支）
- [x] AC-04 流程 B：工作区保存显示"无代表结果，保存为待验证"说明；新详情显示工作区来源与已确认内容、无代表结果（e2e）
- [x] AC-04 保存进行中：按钮锁定、再次点击无效；两流程首屏与空名称均不提前显示必填错误（e2e 断言中性帮助文案存在、错误文案在提交/失焦前不存在）
- [x] AC-11 409：显示服务端冲突文案、修改名称重试成功进入新详情，过程中不产生重复 Memory；5xx：直接重试成功；失败期间步骤与全部已确认内容保留（e2e）
- [x] AC-08 键盘：向导三步仅键盘可完成/取消；Tab 在弹层内循环；Escape 取消并还原触发按钮焦点；确认保存后新详情焦点落首要内容（e2e）
- [x] prefill 单测：V2 全字段映射、V1 映射、fallback 全缺失标记、空数组组进 missing 通过
- [x] `pnpm verify:fast` 通过；`workspace-ai-first-iteration-memory.spec.ts` 回归绿

### 契约对接验收

- [x] 提交体字段与 `SaveStyleMemoryRequest` 一致；`styleTokens`/`enhancementHints` 作为 frontend_computed 随体携带；不提交 `verificationStatus`

## 验证命令

```bash
pnpm e2e -- e2e/style-memory-save-flows.spec.ts --project=workspace
pnpm e2e -- e2e/workspace-iteration-save-style-memory.spec.ts e2e/workspace-ai-first-iteration-memory.spec.ts e2e/template-default-values.spec.ts --project=workspace
pnpm vitest --run src/lib/__tests__/style-memory-prefill.test.ts
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.3（保存链路与预填算法、A/B 流程差异）、§4.2-⑤ 交互链路、ADR-1（状态服务端派生，前端只展示预期）、§8.2 L3、Q5 决策（默认不勾选）
- **相关代码**: `src/components/iterations/save-style-memory-dialog.tsx`（现有单步对话框，视觉与 409 处理口径沿用）、`IterationDetail` 字段（`promptSnapshot`/`recipe`+`recipeSource`/`variables`+`variablesSource`/`sourceAssetId`/`resultFileUrl`/`negativePromptSnapshot`/`id`）
- **契约 / 数据对象**: `SaveStyleMemoryRequest`（消费）、`StyleMemoryPrefill`（本功能交付）
- **下游消费方**: 无（保存是链路起点；plan-07 的预检与保存无直接耦合）
- **列表/详情联动**: 保存成功进入的新详情由 plan-05 交付（正式依赖，见 depends_on）

## 风险与边界

- **执行顺序**: Task 1 red 先行；Task 3/5 依赖 2；保存成功跳转目标为 plan-05 交付的详情路由（`depends_on` 正式依赖，非临时回退）。
- **验证失败排查方向**: 预填断言失败先确认 fixture 的 `schemaVersion` 分支正确；提交锁断言注意 mock 延迟响应时序。
- **允许修改的额外文件**: `src/hooks/use-iteration-memory-view.tsx`（仅当保存入口状态联动需要）。
- **暂停条件**: 现有单步对话框存在本计划未覆盖的消费方（全局搜索确认后如有新增宿主）。
- **E2E 不适用说明**: 不适用本功能（核心用户可观察功能）。
- **风险备注**: 旧对话框的 `initialContent`/`initialVariables` props 将被向导新 props 替换，宿主类型同步修改，不留双轨。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 来源 Iteration 配方为 fallback/missing | 四组预填空 + 缺失标记，流程可继续（保存空规则待验证 Memory） | done |
| 来源参考图缺失（旧数据） | 步骤 1 参考图区显示"来源图缺失"，结果图正常 | done |
| 用户取消勾选代表结果后继续 | 允许，步骤 3 状态文案联动为"待验证" | done |
| 提交后网络中断 | 错误条 + 全内容保留，可重试（幂等由服务端名称冲突检测兜底） | done |
| 向导中途关闭（Escape/取消） | 丢弃未保存内容关闭还原焦点（PRD 未要求跨会话草稿） | done |
