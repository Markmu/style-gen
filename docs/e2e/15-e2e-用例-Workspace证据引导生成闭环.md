---
source: docs/15-Workspace证据引导生成闭环/15-1-架构文档-Workspace证据引导生成闭环.md
created: 2026-09-01
---

# E2E 测试用例：Workspace 证据引导生成闭环

> 本文档按 FEAT（plan-N）分组增量维护。当前包含 plan-02、plan-04、plan-05、plan-06 与 plan-07 分组；plan-01 为纯函数/Provider 契约（E2E 不适用，由相邻 Vitest 承载，见 `docs/e2e/evidence/plan-01-e2e-red-20260901.md`），plan-03 为后端 API（由路由/仓库测试承载）。

## 资产现状

- Playwright projects: `workspace`（端口 3001，`AUTH_REQUIRED=false`，mock API 全量拦截）；`auth`（端口 3000，仅认证类 spec）。
- 现有相关 spec: `workspace-prompt-generate.spec.ts`（Render Dock 手动生成）、`error-path.spec.ts` / `degradation.spec.ts`（分析与生成失败三段式）、`workspace-ai-first-evidence.spec.ts`（证据面板）。
- 可复用 helpers: `mockAuthSession`、`mockUploadPresign`、`mockAnalysisCreate`、`mockAnalysisPolling`、`mockAnalysisPollingSequence`、`mockGenerationCreateCapture`、`mockGenerationPolling`、`mockGenerationList`、`gotoWorkspace`、`waitForReactInput`。
- 可复用 fixtures: `analysis-v2-completed.json`（V2 success Recipe）、`analysis-completed.json`、`generation-completed.json`、`test-image.png`（100×100，参考比 1:1）。
- 本期新增 helpers: `mockCdnImages`、`mockAnalysisCreateSequence`（mock-api.ts）；`chooseQuickRecreatePace`、`confirmQuickRecreate`、`exitQuickRecreate`（workspace-actions.ts）。
- plan-04 新增 fixture: `analysis-v2-completed-no-invariants.json`（V2 success 但 `styleInvariants=[]`，驱动摘要空态）；无新增 API helper（画幅/恢复场景通过 spec 内 `seedWorkspaceV5State` 注入 v5 sessionStorage 快照，与 `style-memory-reuse.spec.ts` 既有 seed 模式一致）。
- plan-05 新增 helpers: `mockDirectionFeedStateful`（可控状态方向 feed：`set(feed)` 推进服务端事实、`fail()` 进入 L2 错误；仅拦截 `view=direction` GET，其余 fallback 给 `mockGenerationList`）、`mockIterationDetailStateful`（比较详情失败/恢复：`fail()` → 503、`set(detail)` 恢复）；`MockIterationDetail` 增补可选 `promptControlSnapshot` 字段（plan-03 契约，既有 spec 构造不受影响）。
- plan-05 新增 fixture: `analysis-v2-completed-dual-invariant.json`（复制 V2 completed，color 维度补第二条 observation/invariant `color_invariant_2`，驱动比较区多 invariant 分支）。
- plan-06 新增 helpers: `mockAnalysisCreateCapture(page, taskId)`（mock-api.ts，捕获 POST /api/analysis 请求体，驱动「结果作为新参考」只提交 `sourceAssetId` 断言；在既有 `mockAnalysisCreate` 之后注册即只捕获后续新请求）；`mockStyleMemoryDetailCollection` 增补 `listQueries` / `detailGets` 回读计数（Memory 写成功后 templates 列表/详情回读断言，行为不变仅加计数）。
- plan-06 spec 内共享构造器: `sourceMemoryDetail`（来源 Memory 详情 DTO，pending 起步）、`representativeCandidate`（候选条目，promptSummary 携带 id 驱动 radio 定位）、`seedSourceMemoryDirection`（经 plan-04 `pendingIterationRestore` 一次性通道 seed 「来自来源 Memory 的方向」，固化 `currentTemplateId` 且保持上传入口可用；裸 seed `currentTemplateId` 会被 `restoreFromPersistedState` 丢弃，勿用）。
- plan-07 新增 helpers: `mockGenerationCreateSequence(page, steps)`（mock-api.ts，POST /api/generation 序列步 mock：第 n 次提交返回 `steps[n]`——成功步 201+taskId / 错误步（status≥400）返回错误体，捕获全部请求体；驱动全旅程两次生成与 L5「提交失败→主动重试成功」序列）。
- plan-07 存量契约对齐: 主 spec TC-2.3/TC-2.5 由「成功弹层可见」按 plan-07 实现规格 §4 最小对齐为「方向 rail 内联终态可见 + 弹层不出现」；`workspace-generation-dialog.spec.ts` 三条与 `ai-first-visual-regression.spec.ts` TC-8.3 由「弹层呈现成功/失败」对齐为「内联结果可见 + 弹层不出现」（加强不放宽）。

## plan-02：快速创作节奏与工作区状态

> 来源：架构 §3.1/3.2/3.3、§6.1、ADR-2、§8.2；实现计划 plan-02 实现规格 §1–§4 与验收 AC-01、AC-07。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-2.1 | 深入路径默认节奏、分析完成后零自动生成 | Happy | 空工作区、无 sessionStorage | 打开 `/workspace`；断言默认节奏；上传参考图并等待分析 V2 success | `creation-pace-selector` 可见且 `pace-option-analyze-edit` 为默认选中（aria-pressed）；`ai-status-header` data-phase=analysis_ready；方向证据完整（`recipe-card`/`content-analysis`/`style-invariants`/evidence facet/unified-prompt-editor/output-card）；捕获的 POST /api/generation 数为 0 | `e2e/workspace-evidence-guided-render-loop.spec.ts` |
| TC-2.2 | 快速复刻确认区披露五类信息 | Happy | 空工作区（选图前） | 点击 `pace-option-quick-recreate` | `quick-confirm-dialog` 可见且标题获得焦点；五类披露逐项可见：`quick-confirm-intent` data-value=reconstruction、`quick-confirm-detail-level` data-value=standard、`quick-confirm-aspect-ratio-policy` data-value=reference_or_fallback、`quick-confirm-generation-settings`（data-quality=standard 且 data-model 与 OutputCard 当前默认模型一致）、`quick-confirm-image-count` data-value=1 | 同上 |
| TC-2.3 | 快速路径分析 success 后恰好一次自动 POST 且请求与确认快照一致 | Happy | 已确认快速复刻（armed） | 上传参考图；分析轮询 V2 completed；等待自动提交 | POST /api/generation 恰好 1 次；请求体 `analysisTaskId` 一致；`promptControlSnapshot` trigger=quick_recreate、intent=reconstruction、detailLevel=standard；`params.aspectRatio`="1:1"（100×100 参考按 policy 解析）、`params.quality` 与 `params.model` 与确认披露一致；promptText 非空；生成完成后 POST 数仍为 1 | 同上 |
| TC-2.4 | armed 期间已确认设置只读并解释退出方式 | Edge | 已确认快速复刻，分析轮询保持 processing | 上传参考图后检查确认区与 Render Dock | `quick-authorization-status` data-authorization=armed；`quick-authorization-locked-note` 可见（说明自动任务将使用已确认设置及退出方式）；OutputCard 的 Aspect Ratio / Quality / Model 下拉 disabled；`exit-quick-recreate` 可见；无 generation POST | 同上 |
| TC-2.5 | 自动提交后刷新不重放 | Edge | TC-2.3 完成自动提交（consumed 已持久化） | `page.reload()` 并等待工作区恢复、生成轮询到达终态 | 恢复后生成终态可观察（generation-dialog 出现）；POST /api/generation 总数仍为 1 | 同上 |
| TC-2.6 | 分析失败清除 armed 快照并说明原因 | Error | 已确认快速复刻（armed） | 上传参考图；分析轮询返回 status=failed | 无 generation POST；`reference-card` 显示 Analysis failed 且参考图上下文保留（reference-image-stage 可见）；`quick-authorization-cleared-reason` 可见；`quick-authorization-status` data-authorization=none | 同上 |
| TC-2.7 | 取消确认零写入、焦点回触发器 | Edge | 空工作区 | 点击 `pace-option-quick-recreate` 打开确认区后点击取消 | `quick-confirm-dialog` 关闭；焦点回到 `pace-option-quick-recreate`；`pace-option-analyze-edit` 仍为选中默认；无 generation POST；上传空态仍可用 | 同上 |
| TC-2.8 | 分析期间退出快速路径：清授权、不丢上下文、完成后不自动生成 | Edge | armed 且分析轮询保持 processing | 点击 `exit-quick-recreate`；随后分析轮询序列回到 completed | `quick-authorization-status` data-authorization=none；OutputCard 三个设置下拉恢复 enabled；参考图与证据保留；analysis_ready 后 POST /api/generation 数为 0 | 同上 |
| TC-2.9 | 快速路径证据完整度与深入路径一致 | Happy | 已确认快速复刻 | 上传参考图；分析 V2 success；等待自动提交完成 | 与 TC-2.1 相同的证据断言集合全部通过（共享 `expectDirectionEvidenceComplete`），且自动 POST 恰好 1 次 | 同上 |
| TC-2.10 | 阻塞清除后条件恢复不延迟自动提交 | Edge | armed 后首次分析 failed（授权已清除） | 点击 Retry analysis；重试 POST 返回新 taskId，轮询 completed | 分析恢复 analysis_ready 且证据完整；POST /api/generation 数保持 0；`quick-authorization-status` data-authorization=none（不复活 armed） | 同上 |

### 需要新增的 mock / fixture

- `mockCdnImages(page)`（mock-api.ts）—— 拦截 `https://cdn.example.com/**` 图片请求返回 1×1 PNG，参考图/结果图加载不依赖外网。
- `mockAnalysisCreateSequence(page, taskIds: string[])`（mock-api.ts）—— POST /api/analysis 依次返回新 taskId，模拟「失败后重试创建新分析任务」的真实后端行为（TC-2.10）。
- 无新增 fixture：V2 分析复用 `analysis-v2-completed.json`；分析 failed 轮询响应用内联对象（status=failed + errorMessage + errorStage），与 `error-path.spec.ts` 既有模式一致。

### 需要新增的源码 data-testid（implementer 契约）

- `src/components/workspace/creation-pace-selector.tsx` → `data-testid="creation-pace-selector"`（新组件，挂载于工作区空态/方向入口）
  - `data-testid="pace-option-analyze-edit"`（aria-pressed 表达默认选中）
  - `data-testid="pace-option-quick-recreate"`
  - `data-testid="quick-confirm-dialog"`（role="dialog"；打开时初始焦点在 `quick-confirm-title`）
  - `data-testid="quick-confirm-title"`
  - `data-testid="quick-confirm-intent"`（`data-value="reconstruction"`）
  - `data-testid="quick-confirm-detail-level"`（`data-value="standard"`）
  - `data-testid="quick-confirm-aspect-ratio-policy"`（`data-value="reference_or_fallback"`；画幅未知时只展示策略，不伪造比例）
  - `data-testid="quick-confirm-generation-settings"`（`data-quality` + `data-model` 与当前共享默认生成设置一致）
  - `data-testid="quick-confirm-image-count"`（`data-value="1"`）
  - `data-testid="quick-confirm-confirm"` / `data-testid="quick-confirm-cancel"`
  - `data-testid="quick-authorization-status"`（`data-authorization="none | armed | consumed"`）
  - `data-testid="quick-authorization-locked-note"`（armed 期间说明「自动任务将使用已确认设置」与退出方式）
  - `data-testid="quick-authorization-cleared-reason"`（阻塞/分析失败/退出后的清除原因提示）
  - `data-testid="exit-quick-recreate"`（armed 期间退出快速路径入口）
- `src/components/workspace/output-card.tsx` —— armed 期间既有 Aspect Ratio / Quality / Model 下拉（aria-label 不变）置为 disabled；无需新 testid。

## plan-04：Prompt 控制与保留改变摘要

> 来源：架构 §3.2（手动全文分支）、§6.2、§6.3、§7.2（PromptControlSnapshot / AspectRatioSource）、§8.6（三档规则恒等、未知画幅）；实现计划 plan-04 实现规格 §1–§5 与验收 AC-02、AC-03、AC-05。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-4.1 | 分析完成后两轴与编辑方式默认态 | Happy | 空工作区、深入路径 | 上传参考图并等待 V2 分析 success | `prompt-intent-controls` 可见且 `data-intent=same_style`、`data-detail=standard`（新分析默认，架构 §3.1.1）、`data-editor-mode=variables`；intent 两项（`intent-option-reconstruction` / `intent-option-same-style`，默认 same_style aria-pressed）、detail 三项（concise/standard/professional，默认 standard）、editor 三入口（variables/text/structured）全部可见；无 `prompt-controls-locked-note`；零 generation POST | `e2e/workspace-evidence-guided-render-loop.spec.ts` |
| TC-4.2 | 切换 intent 即时重编译、reconstruction 说明与 invariant 恒等 | Happy | TC-4.1 完成分析（未手动改写全文） | 点击 `intent-option-reconstruction`；再切回 `intent-option-same-style` | 切换无确认弹层（`prompt-switch-confirm-dialog` 不出现，`customPromptDirty=false` 即时更新，架构 §6.2.6）；reconstruction 下 `compiled-prompt-text` 含原内容 summary「An amber bottle on folded linen」且不含未解析 `{{` 标记；两档下 5 条 invariant 值全部保留（invariant 恒等）；`keep-change-intent-note` 可见（同时参考原内容与风格的说明）；切回 same_style 后文本回到变量编译结果 | 同上 |
| TC-4.3 | 三档 detail 切换 invariant 集合恒等且密度按档位变化 | Happy | TC-4.1 完成分析 | 依次点击 `detail-option-concise` / `detail-option-standard` / `detail-option-professional` | 每档 `data-detail` 同步；三档下 5 条 invariant 值全部存在于 `compiled-prompt-text`（绝不因 detailLevel 删除已确认规则）；concise 不含未覆盖 observation「asymmetric thirds composition」，standard/professional 含（fixture 中 composition_1 置信度 0.88 无 invariant 覆盖，按 §6.2.2 阈值补充） | 同上 |
| TC-4.4 | 变量值在 intent/detail 切换后保持且进入编译 | Happy | TC-4.1 完成分析（variables 模式） | 修改 Subject 变量为「ceramic vase」；切换 intent→reconstruction→same_style；切换 detail→professional | 修改后 `compiled-prompt-text` 含「ceramic vase」；全部切换后变量输入（aria-label Subject）仍为「ceramic vase」；切回 same_style 后编译文本仍含「ceramic vase」 | 同上 |
| TC-4.5 | 三编辑入口可达、structured 只读、返回后最终 Prompt 来源不变 | Edge | TC-4.1 完成分析 | 依次切换 editor mode：text → structured → variables | text 模式 `fulltext-prompt-editor`（textarea）可见且值为当前最终 Prompt；structured 模式 `structured-readonly-view` 与 `structured-readonly-copy` 可见，`fulltext-prompt-editor` 与 `structured-variable-prompt` 均不可编辑/隐藏（structured 只读，不改变最终 Prompt，架构 §6.2.7）；返回 variables 后 `compiled-prompt-text` 与进入 structured 前逐字一致 | 同上 |
| TC-4.6 | 手动全文后切换先确认；取消逐字保留、确认后替换并清 dirty | Edge | TC-4.1 完成分析，切到 text 模式并手动改写全文 | 手动 fill 自定义全文；点击 `detail-option-concise` → 弹 `prompt-switch-confirm-dialog` → 点 cancel；再点 `intent-option-reconstruction` → 弹确认 → 点 accept；再点 `detail-option-concise` | cancel 后：对话框关闭、`fulltext-prompt-editor` 逐字等于手动文本（零写入）、controls 维持 standard（pending selection 清除）、焦点回 `detail-option-concise`；accept 后：文本被新编译结果替换（≠手动文本）、`data-intent=reconstruction`；dirty 已清——再次切换 detail 不弹确认且 `data-detail=concise` 即时生效（架构 §3.2 手动全文分支） | 同上 |
| TC-4.7 | 保留/改变摘要从真实规则与变量派生并可定位 | Happy | TC-4.1 完成分析（same_style） | 查看 `keep-change-summary`；点击保留项「warm amber and sand palette」；修改变量 Subject；点击改变项 | 摘要 `data-intent=same_style` 持续可见；`data-kind="keep"` 项数=5（fixture 全部 enabled invariants）、`data-kind="change"` 初始为 0；点击保留项后 RecipeCard 中 `invariant-item-color_invariant_1` 获得 `data-located="true"`（定位真实规则，不伪造）；修改变量后 change 项恰好 1 条，点击后 Subject 变量输入获得焦点（定位变量编辑器） | 同上 |
| TC-4.8 | Recipe 无 invariants 时摘要显示可恢复空态、不伪造项 | 降级 | fixture `analysis-v2-completed-no-invariants.json`（V2 success、styleInvariants=[]） | 上传参考图并等待分析 success | `keep-change-summary` 可见；`keep-change-empty` 空态可见；`data-kind="keep"` 与 `data-kind="change"` 均为 0（来源缺失时不伪造描述，plan-04 规格 §2）；`compiled-prompt-text` 仍可见（无规则也可编译） | 同上 |
| TC-4.9 | 画幅 reference 推荐标注、user 选择不被图片重载与 Prompt 编辑覆盖 | Happy | TC-4.1 完成分析（100×100 参考图） | 断言初始来源；改选 3:4；`page.reload()`；切 detail | 初始 `aspect-ratio-source` `data-source=reference` 且 `data-recommended=true`（仅 reference 标推荐）、select 值 1:1（最近画幅）；改选后 `data-source=user`；reload 后仍 3:4 + user（架构 §6.3.4 重载不覆盖）；切换 detail 后仍 3:4 + user（Prompt 更新不覆盖） | 同上 |
| TC-4.10 | Iteration 恢复：restore 来源优先于参考推荐，旧快照降级 text 模式 | Edge | seed v5 快照携带 `pendingIterationRestore`（recipe=null、16:9、无控制快照），导航回工作台 | 挂载后检查 controls 与 Render Dock | `aspect-ratio-source` `data-source=restore` 且 select 值 16:9（参考图加载不覆盖，架构 §6.3.5）；`prompt-intent-controls` `data-editor-mode=text`（旧任务缺快照降级，架构 §3.2 旧任务行）；`fulltext-prompt-editor` 值=promptSnapshot 原文（不虚构历史变量/adjustment） | 同上 |
| TC-4.11 | 未知画幅被请求前拒绝：清洗回 1:1、fallback 不标推荐、POST 仅白名单 | Edge | seed v5 快照 `generationParams.aspectRatio='21:9'`（非法），挂载后点击 Generate | 检查 Render Dock 与捕获的 POST /api/generation | select 值回退 1:1（未知值不得进入 UI/请求）；`aspect-ratio-source` `data-source=fallback` 且 `data-recommended=false`（fallback 不冒充推荐）；Generate 后 POST `params.aspectRatio` ∈ {1:1,4:3,16:9,3:4,9:16}（plan-01 唯一白名单） | 同上 |
| TC-4.12 | armed 期间 intent/detail 只读并说明确认快照 | Edge | 快速复刻已确认（armed），分析轮询保持 processing | 上传参考图后检查 Prompt 控件 | `prompt-controls-locked-note` 可见（说明自动任务将使用已确认设置）；`intent-option-*` 两项与 `detail-option-*` 三项均 disabled（架构 §3.2 armed 行）；零 generation POST | 同上 |

### plan-04 需要新增的 mock / fixture

- `analysis-v2-completed-no-invariants.json`（`e2e/fixtures/api-responses/`）—— 复制 `analysis-v2-completed.json` 并置 `recipe.styleInvariants=[]`、`promptText` 只保留 Content 部分，驱动 TC-4.8 摘要空态。
- 无新增 API helper：画幅与恢复场景通过 spec 内 `seedWorkspaceV5State(page, state)` 向 sessionStorage 注入 v5 快照（先在不消费工作台快照的 `/workspace/iterations` 页面 seed，再导航回 `/workspace`），与 `style-memory-reuse.spec.ts` 既有 seed 模式一致；plan-02 review 已确认共享测试基建扩展为允许惯例（本次仅新增 fixture，mock-api.ts 未改动）。

### plan-04 需要新增的源码 data-testid（implementer 契约）

- `src/components/workspace/prompt-intent-controls.tsx`（新组件，挂载于 PromptCard 顶层）
  - `data-testid="prompt-intent-controls"`：容器同时挂 `data-intent="reconstruction|same_style"`、`data-detail="concise|standard|professional"`、`data-editor-mode="variables|text|structured"` 反映当前值
  - 注意：分析中（analyzing/skeleton）与 armed 期间控件区保持渲染（禁用态），锁定说明照常可见（TC-4.12 在分析 processing 中断言）
  - `data-testid="intent-option-reconstruction"` / `data-testid="intent-option-same-style"`（aria-pressed 表达选中）
  - `data-testid="detail-option-concise"` / `data-testid="detail-option-standard"` / `data-testid="detail-option-professional"`（aria-pressed；armed 时 disabled）
  - `data-testid="editor-mode-option-variables"` / `data-testid="editor-mode-option-text"` / `data-testid="editor-mode-option-structured"`
  - `data-testid="prompt-controls-locked-note"`（armed 期间说明「自动任务将使用已确认设置」）
- 手动全文切换确认（`customPromptDirty=true` 时由 controls 弹出）
  - `data-testid="prompt-switch-confirm-dialog"`（role="dialog"）
  - `data-testid="prompt-switch-confirm-accept"` / `data-testid="prompt-switch-confirm-cancel"`（取消后焦点回触发切换的控件）
- `src/components/workspace/keep-change-summary.tsx`（新组件）
  - `data-testid="keep-change-summary"`（容器挂 `data-intent`）
  - 摘要项统一 `data-testid="keep-change-item"`，以 `data-kind="keep|change"` + `data-target-id`（invariantId / 变量名）标识
  - `data-testid="keep-change-empty"`（无 invariants 的可恢复空态，不伪造描述）
  - `data-testid="keep-change-intent-note"`（reconstruction 下「同时参考原内容与风格」说明）
- `src/components/workspace/prompt-card.tsx` / 页面接线
  - `data-testid="compiled-prompt-text"`：显示当前最终 Prompt（resolved）文本的元素，任何编辑模式下同步更新（E2E 读取编译结果的单一断言点）
  - `data-testid="fulltext-prompt-editor"`：text 模式全文编辑 textarea（手动改写入口）
  - `data-testid="structured-readonly-view"` + `data-testid="structured-readonly-copy"`：structured 模式只读视图与复制动作
- `src/components/workspace/recipe-card.tsx`（style-invariants 行）
  - 每条 invariant 行 `data-testid="invariant-item-{invariantId}"`；被摘要定位时置 `data-located="true"`（短暂高亮即可）
- `src/components/workspace/output-card.tsx`
  - `data-testid="aspect-ratio-source"`：画幅来源徽标，挂 `data-source="reference|user|restore|fallback"` 与 `data-recommended="true|false"`（仅 reference 为 true；fallback 不显示推荐文案）

## plan-05：本次结果区与内联比较

> 来源：架构 §3.1.5/3.1.6、§3.2（排队转成功/失败、方向查询失败、对旧结果应用调整行）、ADR-5/ADR-7、§6.4、§6.5、§7.2/7.4、§8.2（L2/L3）；实现计划 plan-05 实现规格 §1–§4 与验收 AC-04、AC-05、AC-06、AC-07。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-5.1 | 方向结果区三组状态同时内联呈现且互不挤占 | Happy | 深入路径完成 V2 分析（方向 analysisTaskId 已建立） | seed 方向 feed（5 completed + 1 active processing + 1 latestFailure） | `direction-result-rail` 可见；`direction-completed-item` 恰 5 张且渲染真实 `img`；`direction-active-face` 可见且 `data-iteration-id` 正确；`direction-failure-face` 显示截断 errorMessage 并有 `direction-failure-retry`；三组并存时缩略图数仍为 5（不共享配额）；direction GET query 为 `view=direction` + 当前 analysisTaskId + `pageSize=5` | `e2e/workspace-evidence-guided-render-loop.spec.ts` |
| TC-5.2 | 手动生成 queue→processing→success 全程内联；新成功自动成为 selected 不自动 preferred | Happy | TC-5.1 同；方向已有 1 条成功 | `feed.set` 推进 active → 点击 Generate（POST 恰 1 次）→ `feed.set` 推进终态（active 清空、新成功进 completed 最新位） | POST 恰 1 次且 `analysisTaskId` 一致；active face 出现并携带新任务 id；新成功缩略图可见且 `data-selected="true"`、rail `data-selected-id` 指向它；新成功 `data-preferred="false"` 且 rail `data-preferred-id` 为空（selected/preferred 分离，架构 §6.4.7）；POST 总数仍 1 | 同上 |
| TC-5.3 | 六个成功结果只显示最新五个，更旧结果可打开完整 Iteration | Edge | 方向累计 6 个成功（服务端按 pageSize=5 返回最新五条 dir-c-6..2） | 完成分析后查看 rail | `direction-completed-item` 恰 5 张；最旧 `dir-c-1` 不出现在首屏缩略图；每个结果保留 `direction-item-open-iteration` 入口；direction GET `pageSize=5` | 同上 |
| TC-5.4 | 最近失败内联显示截断原因；主动重试创建新任务不复活原任务 | Error | 方向 feed 只有 latestFailure（errorMessage 非 null） | `feed.set` 预置新 active → 点击 `direction-failure-retry` | 失败 face 显示 errorMessage 文本；POST /api/generation 恰 1 次且 `analysisTaskId` 一致；active face 显示新任务 id（≠原失败 id）；`direction-failure-face` 仍为原失败 id（failed 终态不复活，架构 §7.4）；POST 总数仍 1 | 同上 |
| TC-5.5 | 当前选择与本次首选分离且状态标识不同 | Edge | 方向有 2 条成功结果 | 初始断言 → 点击 c1 的 `direction-item-preferred` → 点击 c2 缩略图切换选择 | 初始 rail `data-preferred-id` 为空、条目 `data-preferred="false"`；设置后 preferred 按钮 `aria-pressed="true"`、条目 `data-preferred="true"`、rail `data-preferred-id` 指向 c1；切换选择后 c2 `data-selected="true"`、c1 `data-selected="false"` 且 `data-preferred="true"` 不变（preferred 只由用户操作写入，AC-06） | 同上 |
| TC-5.6 | 打开比较：真实双图、历史快照与「正在调整当前草稿」、标题获得焦点 | Happy | 方向 1 条成功；其 Iteration detail（历史 prompt 与当前草稿不同）mock 就绪 | 点击该结果 `direction-item-compare` | `result-comparison-panel` 可见且 `comparison-panel-title` 获得焦点（ADR-7：聚焦标题不 trap）；`comparison-reference-image` / `comparison-result-image` 的 `src` 为 detail 真实 URL；`comparison-historical-prompt` 含历史文本（ceramic vase）而当前 `compiled-prompt-text` 仍含当前草稿（amber bottle）；`comparison-historical-context` 可见；`comparison-live-region` 为 `aria-live="polite"` | 同上 |
| TC-5.7 | 多 invariant 维度：未选具体规则前四动作 disabled | Edge | dual-invariant fixture（color 维度 2 条真实 invariant） | 打开比较 → 选择 color 维度 → 选择 `color_invariant_2` | `comparison-invariant-option` 恰 2 条且均 `aria-pressed="false"`（无隐藏预选）；`comparison-observation-item`（color_1）与 `comparison-prompt-segments`（含规则表达）可见（真实证据，不自动偏差结论）；四动作 `adjustment-action-*` 全 disabled；选择 `color_invariant_2` 后 `aria-pressed="true"` 且四动作 enabled（架构 §6.5.3） | 同上 |
| TC-5.8 | 单 invariant 维度：唯一规则可见地预选，四动作直接可用 | Edge | 标准 fixture（lighting 维度恰 1 条 invariant） | 打开比较 → 选择 lighting 维度 | `comparison-invariant-option` 恰 1 条且 `aria-pressed="true"`（可见预选，不隐藏选择事实）；四动作全部 enabled | 同上 |
| TC-5.9 | 零 invariant 维度：提示暂无可调整规则，仅保留「其他/全文编辑」 | Edge | 标准 fixture（composition 维度有 observation 无 invariant） | 打开比较 → 选择 composition 维度 | `comparison-invariant-empty` 可见且含「暂无可调整规则」；`comparison-invariant-option` 为 0；真实 observation 仍展示；四动作全 disabled；`comparison-dimension-other` enabled（不伪造 invariant 或 adjustment，架构 §6.5.3） | 同上 |
| TC-5.10 | 应用调整只更新当前草稿：重编译、焦点移至摘要项、零 generation POST | Happy | 打开比较（color 维度单 invariant 预选） | 点击 `adjustment-action-strengthen` → 点击 `comparison-adjustment-apply` | 面板关闭；`compiled-prompt-text` 出现「warm amber and sand palette (严格保留)」（plan-04 确定文案）；`keep-change-item[data-target-id="color_invariant_1"]` 获得焦点（应用后焦点移动到更新的摘要项）；捕获的 POST /api/generation 数为 0（应用不自动生成，AC-05） | 同上 |
| TC-5.11 | 取消比较零写入：草稿逐字不变、焦点回比较触发器 | Edge | 打开比较（lighting 维度单 invariant） | 选择 `adjustment-action-relax`（不应用）→ 点击 `comparison-adjustment-cancel` | 面板关闭；焦点返回该结果的 `direction-item-compare`（触发器）；`compiled-prompt-text` 与取消前逐字一致（零写入）；零 POST | 同上 |
| TC-5.12 | 「其他」维度进入全文编辑 | Edge | 打开比较 | 点击 `comparison-dimension-other` | `prompt-intent-controls` `data-editor-mode="text"`；`fulltext-prompt-editor` 获得焦点（「其他」直接聚焦全文编辑，架构 §6.5.2，不创建 adjustment）；零 POST | 同上 |
| TC-5.13 | 方向 feed 失败保留缓存与草稿并提供重试，重试后恢复 | Error | 方向 2 条成功 + 1 active（active 期间定时刷新命中错误） | `feed.fail()`（503）→ 断言错误态 → `feed.set` 恢复 → 点击 `direction-feed-retry` | `direction-feed-error` 与 `direction-feed-retry` 可见（L2）；`direction-completed-item` 仍 2 张（previous data 保留）；`compiled-prompt-text` 逐字不变（草稿不清）；重试后新增第三条成功可见、错误态消失 | 同上 |
| TC-5.14 | 比较详情失败保留结果区与草稿，提供重试与打开 Iteration | Error | `mockIterationDetailStateful.fail()`（详情 GET 全部 503） | 打开比较 → 断言错误态 → `set(detail)` → 点击 `comparison-detail-retry` | `comparison-detail-error` 可见，含 `comparison-detail-retry` 与 `comparison-detail-open-iteration`；rail 缩略图保留、草稿逐字不变；重试后 `comparison-result-image` 渲染真实结果图 | 同上 |
| TC-5.15 | completed 缺结果资产：显示来源异常，不渲染假图且不开放结果动作 | 降级 | 方向 1 条正常成功 + 1 条 `resultFileUrl/resultAssetId` 均为 null 的 completed | 完成分析后查看 rail | 正常条目渲染真实 `img`；缺资产条目 `data-asset-missing="true"` 且内部 `img` 数为 0（不渲染假图）；其 `direction-item-compare` / `direction-item-preferred` disabled（架构 §7.4：completed 必须有 resultAssetId 才开放结果动作） | 同上 |

### plan-05 需要新增的 mock / fixture

- `mockDirectionFeedStateful(page, initialFeed, options?)`（mock-api.ts）—— 拦截 `GET /api/generation?view=direction&…` 返回可控状态 feed（`DirectionIterationFeed` DTO）；`set(feed)` 推进服务端事实（active→completed 终态迁移按测试时序驱动，不受请求次数影响）、`fail({status, body})` 进入 L2 错误；仅拦截 `view=direction` 的 GET，其余请求 `route.fallback()` 给先注册的 `mockGenerationList`；`onRequest` 暴露 `view/analysisTaskId/pageSize` 供 query 契约断言。
- `mockIterationDetailStateful(page, detail)`（mock-api.ts）—— 单条 Iteration 详情可控状态 mock：`fail()` 后详情 GET 全部 503（retryable），`set(detail)` 恢复 200，驱动 TC-5.14 详情失败/重试恢复。
- `MockIterationDetail` 接口增补可选字段 `promptControlSnapshot?: Record<string, unknown> | null`（plan-03 详情 DTO 契约；可选以保持既有 spec 构造兼容）。
- `analysis-v2-completed-dual-invariant.json`（`e2e/fixtures/api-responses/`）—— 复制 `analysis-v2-completed.json`，color 维度补第二条 observation（`color_2`，0.78）与 soft invariant（`color_invariant_2`），驱动 TC-5.7 多 invariant 分支。
- spec 内共享构造器：`directionItem` / `activeItem` / `latestFiveCompleted`（feed 条目 DTO）、`completedIterationDetail`（详情 DTO，历史 promptSnapshot 故意与当前草稿不同以区分历史上下文）、`openComparison`（seed feed+detail、完成分析、打开比较并断言标题聚焦）。

### plan-05 需要新增的源码 data-testid（implementer 契约）

- `src/components/workspace/direction-result-rail.tsx`（新组件，挂载于 Workspace 三栏内/bottom bar 上方）
  - `data-testid="direction-result-rail"`：容器始终挂 `data-selected-id`（瞬时当前所选 completed id，无则空串）与 `data-preferred-id`（会话首选 id，无则空串）
  - `data-testid="direction-completed-item"`：每张成功缩略图；挂 `data-iteration-id`、`data-selected="true|false"`、`data-preferred="true|false"`、缺资产时 `data-asset-missing="true"`；内部 `img` 使用真实 `resultFileUrl`（缺资产不渲染 img）；缩略图本体点击切换当前选择
  - `data-testid="direction-active-face"`：进行中独立状态位（pending/processing 均入此 face）；挂 `data-iteration-id`
  - `data-testid="direction-failure-face"`：最近失败独立状态位；挂 `data-iteration-id`，显示截断 errorMessage
  - `data-testid="direction-failure-retry"`：失败主动重试入口（POST 新任务，不复活原任务）
  - 每个结果项动作按钮：`data-testid="direction-item-compare"`（比较，取消后的焦点返回目标）、`data-testid="direction-item-preferred"`（设为本次首选，`aria-pressed` 表达首选态）、`data-testid="direction-item-open-iteration"`（打开完整 Iteration）、`data-testid="direction-item-regenerate"` / `data-testid="direction-item-new-reference"`（本 plan 仅提供回调，plan-06 接管）；缺 `resultAssetId` 的条目上 compare/preferred 等结果动作 disabled
  - `data-testid="direction-feed-error"` + `data-testid="direction-feed-retry"`：L2 列表失败错误位与重试（保留 previous data）
- `src/components/workspace/result-comparison-panel.tsx`（新组件，内联 focus-managed region，非模态）
  - `data-testid="result-comparison-panel"`；`data-testid="comparison-panel-title"`（打开时初始焦点，focusable）
  - `data-testid="comparison-historical-prompt"`（所选结果历史 Prompt 快照文本）与 `data-testid="comparison-historical-context"`（「正在调整当前草稿」边界说明）
  - `data-testid="comparison-dimension-option"`（挂 `data-dimension` 为 Recipe 真实维度 key；observations ∪ invariants 并集）与 `data-testid="comparison-dimension-other"`（「其他」→ 聚焦全文编辑）
  - `data-testid="comparison-observation-item"`（挂 `data-observation-id`）；`data-testid="comparison-prompt-segments"`（该维度 Prompt 表达/来源聚合）
  - `data-testid="comparison-invariant-option"`（挂 `data-invariant-id`，`aria-pressed` 表达选择；恰一条时预选为 true）；`data-testid="comparison-invariant-empty"`（「该维度暂无可调整规则」）
  - `data-testid="adjustment-action-strengthen|relax|replace|disable"`（未选定目标 invariant 时 disabled；零 invariant 时 disabled）；`data-testid="adjustment-replacement-input"`（replace 值，trim 非空 ≤200）
  - `data-testid="comparison-adjustment-apply"` / `data-testid="comparison-adjustment-cancel"`（应用后面板关闭并聚焦摘要项；取消零写入且焦点回 `direction-item-compare`）
  - `data-testid="comparison-live-region"`（`aria-live="polite"`，状态通知不夺焦点）
  - `data-testid="comparison-detail-error"` + `data-testid="comparison-detail-retry"` + `data-testid="comparison-detail-open-iteration"`（详情失败错误位）
- `src/components/workspace/comparison-view.tsx`（改造）
  - `data-testid="comparison-reference-image"` / `data-testid="comparison-result-image"`：`img` 元素本身挂 testid，`src` 为真实 URL（unoptimized 或原生 img，不做占位假图）
  - `data-testid="comparison-reference-missing"` / `data-testid="comparison-result-missing"`：参考/结果 URL 缺失的真实缺失态
- 复用既有 testid：`compiled-prompt-text`、`fulltext-prompt-editor`、`prompt-intent-controls`（`data-editor-mode`）、`keep-change-item`（`data-target-id`，应用调整后的焦点去向）

## plan-06：首选 Memory 与结果新参考

> 来源：架构 §3.1.7、§3.2（首选滚出五条成功窗口、作为新参考、首选保存/更新 Memory 行）、ADR-6（生成结果作为新参考复用 Asset）、§6.6（结果作为新参考）、§6.7（首选结果与 Style Memory）、§7.3（/api/analysis sourceAssetId 分支、representative-result 端点）；实现计划 plan-06 实现规格 §1–§5 与验收 AC-04、AC-06、AC-07。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-6.1 | 设置与更换首选：preferred 写入经 Iteration detail 验证 | Happy | 深入路径完成 V2 分析；方向 2 条成功（c1/c2），两详情 mock 就绪 | 点击 c1 `direction-item-preferred`；再点击 c2 `direction-item-preferred` | c1 设置后 rail `data-preferred-id` 指向 c1 且发生 c1 的详情 GET（callCount>0，架构 §6.7.1「总是通过 Iteration detail 验证」）；更换后指向 c2、c1 `data-preferred=false`、c2 `data-preferred=true` 且发生 c2 的详情 GET | `e2e/workspace-evidence-guided-render-loop.spec.ts` |
| TC-6.2 | 首选滚出五条成功窗口仍有效并链接 Iteration Memory | Edge | preferred 已设在 rail 内条目；方向含 active（feed 处于 2-3s 定时刷新节奏） | `feed.set` 推进为最新五条（active 清空、preferred 条目滚出窗口）→ 点击 `direction-preferred-open-detail` | rail 恰 5 张缩略图且不含旧 preferred 条目；`data-preferred-id` 保留该 id；`direction-preferred-external` 可见且挂 `data-iteration-id`（「首选已在 Iteration Memory」）；点击后 URL 到达 /workspace/iterations（AC-06：窗口外按 detail 有效） | 同上 |
| TC-6.3 | 无效 preferred 清理：detail 属不同方向时清除并说明原因 | Error | 方向 1 条 completed，其 Iteration detail 的 analysisTaskId 与当前方向不同 | 点击该条目 `direction-item-preferred` | rail `data-preferred-id` 清空；`direction-preferred-invalid` 可见且挂 `data-iteration-id`（说明无效原因）；`direction-preferred-external` 不出现（只有详情无效才清除，AC-06） | 同上 |
| TC-6.4 | 无来源 Memory：从首选结果打开保存向导并预选代表结果 | Happy | 无 currentTemplateId；方向 1 条成功 + 详情就绪；POST /api/templates 捕获 mock | 设置 preferred → 点击 `direction-item-save-memory` → Cancel → 重新打开走完三步向导提交 | `save-style-memory-dialog` 可见且「Set as representative result」勾选（预选完成结果，plan-06 规格 §2）；Cancel 后对话框关闭且 POST 数 0（取消零写入）；重新提交恰 1 次 POST，body `sourceGenerationTaskId` = `representativeGenerationTaskId` = 该结果 id（第 14 期请求契约） | 同上 |
| TC-6.5 | 有来源 Memory：Memory 动作打开代表结果确认并预选 preferred 结果 | Happy | seed 来源 Memory 方向（currentTemplateId=tpl-src-1、pending_verification）+ 候选含 preferred 结果 | 断言初始验证状态 → 设 preferred → 点击 `direction-item-save-memory` → 确认 | 初始 `direction-memory-status` `data-verification=pending_verification`（服务端派生）；`representative-result-selector` 可见且 preferred 结果 radio 已勾选（预选）；确认后恰 1 次 POST `/api/templates/tpl-src-1/representative-result`，body `generationTaskId` = preferred 结果 id（架构 §6.7.2 确认后才更新） | 同上 |
| TC-6.6 | Memory 更新成功后四类回读即时可见，无需整页刷新 | Happy | TC-6.5 同；记录列表/详情/候选/方向 feed 四类 GET 基线 | 确认代表结果更新（不刷新页面） | POST 恰 1 次；`direction-memory-status` 无需刷新变为 `data-verification=user_verified` 且 `data-representative-iteration-id` 指向 preferred 结果（禁止乐观伪造）；templates 列表 GET、`templates/{id}` 详情 GET、representative-candidates GET、direction feed GET 计数均较基线增加（统一刷新协调器，plan-06 规格 §2）；rail `data-preferred-id` 保持 | 同上 |
| TC-6.7 | 写入成功但部分回读失败：「已保存，刷新失败」只重试读取 | Error | TC-6.5 同；确认前 `feed.fail()`（方向 feed 回读 503） | 确认更新 → 断言部分失败态 → `feed.set` 恢复 → 点击 `memory-refresh-retry` | POST 恰 1 次后 `memory-refresh-partial-error` 与 `memory-refresh-retry` 可见（保留服务端成功事实，不回滚）；重试后错误态消失、`direction-memory-status` 变 user_verified；全程 representative-result POST 保持 1 次（只重试读取、不重复 POST，AC-06） | 同上 |
| TC-6.8 | 设置/更换首选不改变验证状态：零 Memory 写请求 | Edge | TC-6.5 同；方向 2 条成功 + 两详情 mock | 点击 c1 preferred → 点击 c2 preferred | 全程 `direction-memory-status` 保持 `data-verification=pending_verification`；representative-result 与 PUT /api/templates 请求数均为 0（§6.7 实现原则：preferred 从不写 templates） | 同上 |
| TC-6.9 | 作为新参考：未完成内容确认守卫，取消零写入且焦点回触发器 | Edge | 方向 1 条成功（其 Prompt 快照 ≠ 当前草稿）；分析/生成 POST 捕获 mock | 点击 `direction-item-new-reference` → 点击 `new-reference-confirm-cancel` | `new-reference-confirm-dialog` 可见且 `new-reference-unfinished-summary` 说明将切换的内容（架构 §6.6.2）；取消后对话框关闭、焦点回 `direction-item-new-reference` 触发器、`compiled-prompt-text` 逐字不变、新 POST /api/analysis 与 POST /api/generation 均为 0（取消零写入，§6.6.3） | 同上 |
| TC-6.10 | 确认作为新参考：仅提交 sourceAssetId、进入新方向且旧方向可回溯 | Happy | TC-6.9 同 + 新分析轮询 processing mock + 旧方向 Iteration 列表 mock | 点击 `new-reference-confirm-accept` → 导航 /workspace/iterations?status=all | POST /api/analysis 恰 1 次，body 仅含 `sourceAssetId`（= 该结果 resultAssetId），不含 fileUrl/width/height/mimeType/assetId（ADR-6 零复制、不重传）；工作区进入 analyzing 新方向；完整历史列表仍可见旧方向条目（AC-04 旧方向可回溯） | 同上 |

### plan-06 需要新增的 mock / fixture

- `mockAnalysisCreateCapture(page, taskId)`（mock-api.ts）—— 捕获 POST /api/analysis 请求体并返回 pending 任务；仅拦截 POST；在既有 `mockAnalysisCreate` 之后注册即只捕获后续新请求（Playwright route 后注册优先），驱动 TC-6.9/6.10 的 `{sourceAssetId}` 请求契约断言。
- `mockStyleMemoryDetailCollection` 增补返回 `listQueries`（列表 GET query 快照数组）与 `detailGets`（详情 GET id 序列）——仅加计数、不改响应行为，驱动 TC-6.6 四类回读断言（候选计数沿用既有 `candidateQueries`）。
- 无新增 fixture：Style Memory 详情/候选复用 `mockStyleMemoryDetailCollection`；create 复用 `mockTemplateCreateCapture`；方向 feed/detail 复用 plan-05 stateful mock。
- spec 内共享构造器：`sourceMemoryDetail` / `representativeCandidate` / `seedSourceMemoryDirection`（经 `pendingIterationRestore` 一次性通道 seed 来源 Memory 方向；裸 seed `currentTemplateId`/`preferredIterationId` 会被 `restoreFromPersistedState` 的有效性校验丢弃，不可用）。

### plan-06 需要新增的源码 data-testid（implementer 契约）

- `src/components/workspace/direction-result-rail.tsx`
  - `data-testid="direction-item-save-memory"`：每个完成条目的 Memory 动作（无 currentTemplateId → 打开保存向导；有 → 打开代表结果确认）；缺 `resultAssetId` 的条目上与 compare/preferred 同族 disabled
  - `data-testid="direction-preferred-external"`：窗口外首选提示块（「首选已在 Iteration Memory」），挂 `data-iteration-id`；内部 `data-testid="direction-preferred-open-detail"` 打开详情（导航 /workspace/iterations 即可）
  - `data-testid="direction-preferred-invalid"`：无效首选清理提示，挂 `data-iteration-id`，文案说明无效原因（failed/无资产/不同方向）
  - `data-testid="direction-memory-status"`：工作区当前来源 Memory 验证状态位（有 currentTemplateId 时渲染）；挂 `data-verification="pending_verification|user_verified"` 与 `data-representative-iteration-id`；由服务端详情派生，禁止客户端乐观伪造；写成功回读完成后更新
- `src/components/style-memory/representative-result-selector.tsx`
  - ModalDialog 容器挂 `data-testid="representative-result-selector"`（现无 testid）；从工作台 preferred 入口打开时预选 preferred 结果对应 radio
- `src/components/iterations/save-style-memory-dialog.tsx`
  - 复用既有三步向导 testid（`save-style-memory-dialog` / `save-wizard-step-*`）；从工作区 preferred 入口打开时「Set as representative result」复选框默认勾选（第 14 期 iteration-detail 入口默认不勾选的语义保持不变）
- 方向切换守卫（复用 `src/components/iterations/replace-confirm-dialog.tsx` 骨架，挂载于工作区，不新增第二套弹层）
  - `data-testid="new-reference-confirm-dialog"`（role="dialog"）
  - `data-testid="new-reference-unfinished-summary"`：将切换的未完成内容说明（Prompt/negative constraints/生成参数/当前来源比较结果）
  - `data-testid="new-reference-confirm-cancel"` / `data-testid="new-reference-confirm-accept"`：取消零写入并焦点回触发器；确认后清瞬时 selected/preferred、pace 重置 analyze_edit、POST /api/analysis 仅 `{sourceAssetId}`
- 工作区 Memory 写成功后的部分刷新失败位
  - `data-testid="memory-refresh-partial-error"`（「已保存，刷新失败」，保留服务端成功事实）+ `data-testid="memory-refresh-retry"`（只重试读取，不重复写请求）

## plan-07：Workspace 闭环集成与回归

> 来源：架构 §2.1.6（成功结果不再通过阻断式弹层呈现）、§3.1/3.2/3.3（全流程与状态机）、ADR-7（内联 focus-managed region）、§6.4（生成与方向结果，含实现原则「移除成功 GenerationDialog，保留任务失败的内联恢复动作」）、§6.6/6.7、§8.2（L1～L5）、§8.5（三视口视觉验收）；实现计划 plan-07 实现规格 §1–§4 与验收 AC-01～AC-07、US-01～US-11。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-7.1 | 全旅程连续性：分析→生成→比较→调整→再生成→首选→Memory→新参考全程不离开 Workspace | Happy | 空工作区；方向 feed/详情/生成序列/模板捕获 mock 就绪 | 深入路径上传分析 → 手动 Generate → feed 推进 active→completed → 打开比较并 strengthen 应用 → 再次 Generate（feed 推进第二个 completed）→ 设首选 → 打开 Memory 保存向导后 Cancel → 「作为新参考」守卫 accept | 全程 URL 保持 `/workspace`；每一步 `generation-dialog` 均不出现（成功/进行中均不弹层）；两次 POST `analysisTaskId` 一致且第二次携带调整后草稿；rail 相继出现两个 completed；`data-preferred-id` 指向第二结果；Memory Cancel 零 POST；新参考 POST 仅 `sourceAssetId`（=第二结果 resultAssetId）且进入 analyzing 新方向（US-01/05/06/07/09） | `e2e/workspace-evidence-guided-render-loop.spec.ts` |
| TC-7.2 | 手动生成成功全程内联，成功后上下文保持可编辑 | Happy | 深入路径完成 V2 分析；feed 空方向 | 点击 Generate → feed 推进 active→completed（新成功） | `direction-active-face` 内联可见且弹层不出现；新成功进 rail、`data-selected="true"`、渲染真实 `img`；`workspace-three-column-layout`/Reference/`compiled-prompt-text` 可见；成功后切换 detail 即时生效（Prompt 仍可编辑，无弹层阻断）；弹层计数 0（AC-04/US-01） | 同上 |
| TC-7.3 | Provider 失败内联恢复（L3）：失败原因与恢复动作留在本次结果区 | Error | 深入路径完成 V2 分析 | 点击 Generate → feed 推进 active→latestFailure（errorMessage 非空）→ 断言内联失败 → 点击 `direction-failure-retry` → feed 推进 active→completed | 失败/进行中均无弹层；`direction-failure-face` 显示截断 errorMessage 且 `direction-failure-retry` 可见；三栏/参考/草稿保留（L3 保留能力）；重试 POST 恰 2 次且第 2 次 `analysisTaskId` 一致；恢复成功后 completed 内联可见（AC-07/US-10） | 同上 |
| TC-7.4 | 键盘焦点旅程连续；完成通知 polite 不夺编辑焦点 | Edge | 方向 1 条成功 + 详情 mock；生成序列 mock | 键盘 Enter 打开比较 → 标题聚焦 → Enter 取消回触发器 → 键盘应用 strengthen → 焦点摘要项 → text 模式编辑全文期间手动生成 → feed 推进完成 | 比较打开 `comparison-panel-title` 聚焦；取消后焦点回 `direction-item-compare`；应用后 `keep-change-item[data-target-id]` 聚焦；生成完成时 `workspace-live-region` 为 `aria-live="polite"`、弹层不出现且焦点保持在 `fulltext-prompt-editor`（§3.3/US-11） | 同上 |
| TC-7.5 | L1 降级：自定义全文应用「不再保留」未命中表达时明确说明 | 降级 | 方向 1 条成功；当前草稿已手动改写全文（不含规则表达） | 打开比较 → 选 lighting 维度（单 invariant 预选）→ disable → 应用 | `prompt-adjustment-miss-note` 可见且挂 `data-invariant-id`（不静默、不声称已删除，§6.2 实现原则）；规则确实停用（保留项 5→4）；全文逐字保留（未命中不做删除/追加）（AC-05/US-10） | 同上 |
| TC-7.6 | L2 降级：方向 feed 失败提供重试与打开 Iteration 出口，编辑能力保留 | 降级 | 方向 2 条成功 + 1 active（定时刷新节奏） | `feed.fail()`（503）→ 断言错误态与出口 → 点击 `direction-feed-open-iteration` | `direction-feed-error`/`direction-feed-retry`/`direction-feed-open-iteration` 可见（§8.2 L2「结果位显示重试/打开 Iteration」）；completed 仍 2 张、草稿逐字不变；三栏可见、Generate enabled、零 POST；出口点击到达 `/workspace/iterations`（AC-07/US-10） | 同上 |
| TC-7.7 | L4 降级：armed 分析失败复位并保留上下文，恢复后手动生成成功不弹层 | 降级 | 已确认快速复刻（armed） | 上传参考 → 分析 failed → 断言复位 → Retry analysis 恢复 → 手动 Generate → feed 推进完成 | `quick-authorization-cleared-reason` 可见、`data-authorization=none`、参考上下文保留、无弹层；恢复后 `analysis_ready` 且零自动 POST（不延迟触发）；手动生成成功内联可见且弹层不出现（AC-01/AC-07/US-10） | 同上 |
| TC-7.8 | L5 降级：生成提交服务错误内联呈现，不声称任务已创建 | Error | 深入路径完成 V2 分析；POST 第一步 503、第二步成功 | 点击 Generate（503）→ 断言内联错误 → 点击 `generation-submit-retry` → feed 推进完成 | `generation-submit-error` 含错误文本 + `generation-submit-retry` 可见；弹层不出现；`direction-active-face` 计数 0（不声称任务已创建）；草稿/画幅参数保留；重试 POST 恰 2 次、错误位消失、成功内联可见（§8.2 L5/US-10） | 同上 |
| TC-7.9 | 三视口结果 rail / 内联比较 / 降级可见性与无横向溢出（含 1280×720 最小守卫） | Edge | analysis-completed 分析 + 方向 feed（2 completed + 1 active + 1 latestFailure）+ 比较详情 mock | 在 1440×900、1280×800、390×844 逐视口：断言 rail 三组状态与无横向溢出 → 打开比较断言无溢出并取消 → `feed.fail()` 断言降级错误位并重试恢复；最后在 1280×720 仅做 rail 可见 + 无横向溢出 DOM 守卫 | 每视口 `direction-result-rail`/completed=2/active/failure face 可见、`workspace-three-column-layout` 无 `scrollWidth > clientWidth`；比较面板打开/取消不产生横向溢出；L2 错误位可见不遮挡三栏、重试后恢复；1280×720 同样无结构性横向溢出（架构 §8.5；plan-05 review S-2 移交决策：1280×720 不入验收截图清单，以最小 DOM 守卫认领） | `e2e/ai-first-visual-regression.spec.ts` |

### plan-07 需要新增的 mock / fixture

- `mockGenerationCreateSequence(page, steps)`（mock-api.ts）—— POST /api/generation 序列步 mock（`MockGenerationCreateStep`：成功步 `taskId` / 错误步 `status≥400 + body`），第 n 次提交返回 `steps[n]`（越界沿用最后一步）并捕获全部请求体；驱动 TC-7.1（两次生成）与 TC-7.8（503 → 重试成功）。
- 无新增 fixture：旅程/降级场景复用 `analysis-v2-completed.json`、`generation-completed.json` 与 plan-05 stateful feed/detail mock。

### plan-07 需要新增的源码 data-testid（implementer 契约）

- `src/components/workspace/result-comparison-panel.tsx` 或页面编排
  - `data-testid="prompt-adjustment-miss-note"`：自定义全文应用调整未命中 range 时的明确说明（挂 `data-invariant-id`；disable 未命中时说明「未找到可删除表达」，不声称已删除）；应用后面板关闭，说明呈现于工作区（keep-change 摘要邻近），驱动 TC-7.5。
- `src/components/workspace/direction-result-rail.tsx`
  - `data-testid="direction-feed-open-iteration"`：L2 feed 错误位中的「打开完整 Iteration」出口（§8.2 L2），点击导航 `/workspace/iterations`；仅错误位渲染，驱动 TC-7.6。
- `src/components/workspace/output-card.tsx` 或页面编排（L5 提交失败内联位）
  - `data-testid="generation-submit-error"`：POST /api/generation 失败（服务/DB 不可用）的内联错误位（Render Dock 邻近），显示服务端错误文本；重试成功后消失。
  - `data-testid="generation-submit-retry"`：提交失败主动重试入口（创建新任务，不声称原任务已创建——失败期间无 active face），驱动 TC-7.8。
- 工作区结果通知（`src/app/workspace/page.tsx` 编排）
  - `data-testid="workspace-live-region"`：生成完成/失败的工作区级 polite 通知（`aria-live="polite"`），不移动正在编辑的焦点、不打开弹层，驱动 TC-7.4。
- 行为契约（无新 testid）：成功/进行中/失败均不得打开 `generation-dialog`（`src/app/workspace/page.tsx` 移除 Workspace 成功/提交路径的 `setGenerationDialogOpen(true)` live 消费；组件保留兼容），驱动 TC-7.1/7.2/7.3/7.7 与存量 dialog spec。

## 汇总

| 类型 | 数量 |
|------|------|
| Happy Path | 21 |
| Error Path | 8 |
| Edge | 21 |
| 降级 | 5 |
| 合计 | 55 |

> plan-02：Happy 4 / Error 1 / Edge 5 / 降级 0，共 10；plan-04：Happy 6 / Edge 5 / 降级 1，共 12；plan-05：Happy 4 / Error 3 / Edge 7 / 降级 1，共 15；plan-06：Happy 5 / Error 2 / Edge 3 / 降级 0，共 10；plan-07：Happy 2 / Error 2 / Edge 2 / 降级 3，共 9（TC-7.9 视觉用例落在 `ai-first-visual-regression.spec.ts`）。




