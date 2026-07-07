---
source: docs/12-全站AI优先界面风格复刻/12-1-架构文档-全站AI优先界面风格复刻.md
created: 2026-07-05
---

# E2E 测试用例：全站 AI 优先界面风格复刻

## 资产现状

- Playwright projects: `auth` 使用 `http://localhost:3000`；`workspace` 使用 `AUTH_REQUIRED=false pnpm dev --port 3001`，本期 targeted E2E 默认走 `workspace` project。
- 现有相关 spec: `precision-glass-home.spec.ts`, `precision-glass-shell.spec.ts`, `workspace-three-column-layout.spec.ts`, `workspace-reference-recipe.spec.ts`, `workspace-prompt-generate.spec.ts`, `workspace-history-strip.spec.ts`, `template.spec.ts`。
- 可复用 helpers: `mockAuthSession`, `mockUploadPresign`, `mockAnalysisCreate`, `mockAnalysisPolling`, `mockAnalysisPollingSequence`, `mockGenerationCreate`, `mockGenerationPolling`, `loadFixture`。
- 可复用 fixtures: `analysis-completed.json`, `analysis-degraded.json`, `generation-completed.json`, `rate-limited.json`, `test-image.png`。

## plan-01：DesignTokenLayer 与状态语言基线

> 来源：架构文档 §2.1、§2.4 AC-01/AC-07/AC-08、§4.2、§6.7、§7.4、§8.2；实现计划 plan-01 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-1.1 | Workspace 壳层暴露第 12 期 AI-first 语义 token | Happy | plan-01 未实现前，`globals.css` 只有既有 Precision Glass token | 打开 `/workspace`，读取 `.workspace-chromatic` 与 root 的 computed CSS custom properties | `--surface-evidence-*`、`--evidence-*`、`--readiness-*`、`--style-memory-*`、`--status-*` 最小 token contract 均存在且非空；既有 `.surface-panel`/按钮/input token 不被破坏 | `e2e/ai-first-design-system.spec.ts` |
| TC-1.2 | 首页状态预览使用 AI-first 三段式状态语言 | Happy | Landing 继续渲染状态语言预览，plan-01 只更新共享 copy，不迁移页面布局 | 打开 `/`，查看 `Every State Stays Clear` 状态预览 | `processing` 文案说明 AI 正在读取的风格信号；`failedRecoverable` 文案说明保留 reference/prompt/context，并给出 retry/back/next action 方向 | `e2e/ai-first-design-system.spec.ts` |

### plan-01 red 阶段最小 token contract

- `--surface-evidence-panel`
- `--surface-evidence-chip`
- `--evidence-color-bg`
- `--evidence-color-text`
- `--evidence-composition-bg`
- `--evidence-lighting-bg`
- `--evidence-texture-bg`
- `--evidence-mood-bg`
- `--evidence-neutral-bg`
- `--readiness-ready-bg`
- `--readiness-waiting-bg`
- `--readiness-blocked-bg`
- `--readiness-processing-bg`
- `--style-memory-card-bg`
- `--style-memory-source-bg`
- `--status-neutral-bg`
- `--status-warning-bg`
- `--status-danger-bg`

### 需要新增的 mock / fixture

- 无。plan-01 red E2E 不触发上传、分析、生成或模板 CRUD，直接验证页面可观察的设计 token 和状态语言。

### 需要新增的源码 data-testid

- plan-01 red E2E 不要求新增业务源码 `data-testid`。
- plan-01 实现阶段仍需确保 `StatePresenter` 输出稳定 `data-testid="state-presenter-tone"` 和 `data-status`，由 plan-01 单元/组件测试覆盖。

## plan-02：AppShell 与 AI 状态头

> 来源：架构文档 §2.4 AC-02/AC-07/AC-08、§3.1 主流程 1/10、§3.2 受限/未登录、§4.2 AppShell/StatePresenter、§6.1、§6.7、§7.4、§8.2；实现计划 plan-02 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-2.1 | Landing、Workspace、Style Memory 渲染共享 AI-first AppShell | Happy | plan-01 token/status copy 已完成；模板列表和历史列表使用 mock，避免真实后端依赖 | 分别打开 `/`、`/workspace`、`/workspace/templates` | 三个页面都有 `app-shell`、`banner`、`main`、`app-shell-primary-nav`；shell `data-variant` 分别为 `landing/workspace/memory`；导航包含 Workspace 与 Style Memory | `e2e/ai-first-shell.spec.ts` |
| TC-2.2 | `/workspace/templates` 导航显示 Style Memory 且处于 active | Happy | 模板列表 mock 返回 1 条记忆；当前 route 为 `/workspace/templates` | 打开 `/workspace/templates` | 主导航用户可见文案为 `Style Memory`，该 nav item `aria-current="page"`；主导航不再出现旧 `Template Library` 文案；URL 保持 `/workspace/templates` | `e2e/ai-first-shell.spec.ts` |
| TC-2.3 | Workspace idle 状态头说明下一步和服务可用性 | Happy | 无 reference、无 prompt；历史列表 mock 为空 | 打开 `/workspace` | `ai-status-header` 可见且 `data-phase="idle"`；可见文案说明上传/参考图、next action 和 service ready/available | `e2e/ai-first-shell.spec.ts` |
| TC-2.4 | 分析处理中状态头说明 AI 正在读取风格信号 | Happy | 上传/分析 API mock；分析轮询返回 `processing` | 打开 `/workspace`，上传测试图片 | `ai-status-header` 进入 `data-phase="analyzing"`；文案包含 reading/extracting/style signals，并提及 color、composition、lighting、texture、mood 等信号 | `e2e/ai-first-shell.spec.ts` |
| TC-2.5 | 分析完成状态头说明 evidence/生成就绪方向 | Happy | 上传/分析 API mock；分析轮询返回 completed fixture | 打开 `/workspace`，上传测试图片并等待分析完成 | `ai-status-header` 进入 `data-phase="analysis_ready"`；文案说明 ready/evidence/style signals/generate 和 next action | `e2e/ai-first-shell.spec.ts` |
| TC-2.6 | 生成中与生成失败状态头保留上下文并提示恢复 | Error | 分析已完成；生成 POST mock 成功；生成轮询先 `processing` 后 `failed` 且错误码 `SERVICE_UNAVAILABLE` | 点击 Render Dock 的 Generate | `ai-status-header` 先进入 `data-phase="generating"` 并显示 rendering/processing；失败后展示 recoverable/failed/unavailable/retry/back to edit；sessionStorage 仍保留 analysisTaskId | `e2e/ai-first-shell.spec.ts` |
| TC-2.7 | Style Memory 受限时登录入口不清空 Workspace 快照 | 降级 | sessionStorage 已有有效 Workspace 快照；`GET /api/templates` mock 返回 401 | 打开 `/workspace/templates` | `app-shell` 保持可见；`app-shell-auth-entry` 展示 log in/sign in 行动；sessionStorage 中原 Workspace 快照未被删除或覆盖 | `e2e/ai-first-shell.spec.ts` |

### 需要新增的 mock / fixture

- `mockGenerationList(page, items, nextCursor)` — mock `GET /api/generation?pageSize=20...`，让 Workspace shell 测试不依赖真实历史 API。
- `mockTemplateList(page, items, nextCursor)` — mock `GET /api/templates?search=&limit=20...`，让 Style Memory shell/nav 测试不依赖真实模板 API。
- `mockApiError(page, "**/api/templates?**", 401, ...)` — 复用现有通用 helper 覆盖 L4 auth restricted 分支。
- 不新增 fixture；分析/生成使用现有 `analysis-completed.json` 和测试内最小 generation failed 响应。

### 需要新增的源码 data-testid

- `src/components/app-shell.tsx` → `data-testid="app-shell"`，并设置 `data-variant="landing|workspace|memory"`。
- `src/components/app-shell.tsx` → `data-testid="app-shell-primary-nav"`，承载 Workspace / Style Memory 主导航。
- `src/components/app-shell.tsx` 或 auth slot → `data-testid="app-shell-auth-entry"`，承载登录/用户入口。
- `src/components/workspace/status-bar.tsx` 或 `src/components/workspace/ai-copilot-ribbon.tsx` → `data-testid="ai-status-header"`，并设置 `data-phase`、`data-service-state` 和可见 next action 文案。

## plan-03：Workspace Reference / Evidence / Prompt 风格复刻

> 来源：架构文档 §2.1、§2.4 AC-02/AC-03/AC-08/AC-09、§3.1 主流程 4/5、§3.2 分析完成/分析失败/编辑提示、§6.2、§6.3、§7.1、§7.2、§8.1、§8.2、ADR-4；实现计划 plan-03 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-3.1 | Workspace 空态解释 AI 将读取的风格信号 | Happy | plan-02 AppShell 和 AI 状态头已完成；无 reference、无 prompt、历史列表 mock 为空 | 打开 `/workspace` | 三栏结构仍可见；Reference Canvas 空态说明 AI 将读取 color、composition、lighting、texture、mood 等信号；页面提供上传 reference 与进入 Style Memory 的开始路径 | `e2e/workspace-ai-first-evidence.spec.ts` |
| TC-3.2 | 分析完成后按稳定顺序展示 evidence facets | Happy | 上传/分析 API mock；分析轮询返回 completed fixture | 打开 `/workspace`，上传测试图片并等待分析完成 | Style Intelligence 渲染 `color -> composition -> lighting -> texture -> mood -> subject` 顺序的 facet；每个 facet 暴露 label、summary、confidence 和 source field；不渲染空 facet | `e2e/workspace-ai-first-evidence.spec.ts` |
| TC-3.3 | 点击 facet 同步高亮 Reference anchor 与 Prompt provenance | Happy | 分析已完成，prompt 中存在可匹配 lighting 片段 | 点击 `lighting` facet | 被选中的 facet、Reference Canvas 对应 anchor、Prompt provenance 对应 span 同步 `data-selected="true"`；prompt span 标记 `exact` 或 `keyword` match，不修改用户 prompt 文本 | `e2e/workspace-ai-first-evidence.spec.ts` |
| TC-3.4 | prompt 无精确片段时显示 facet-only 相关信号 | Edge | 分析 completed mock 中 `texture` summary 不存在于 prompt 文本 | 点击 `texture` facet | Prompt provenance 显示 `matchType="facet_only"` 的 texture chip，并展示“相关信号 / related signal”说明；不得伪造精确文本 span | `e2e/workspace-ai-first-evidence.spec.ts` |
| TC-3.5 | 分析失败保留 reference/prompt context 并提供恢复行动 | Error | 上传成功后 `POST /api/analysis` mock 返回 retryable failure | 打开 `/workspace`，上传测试图片 | Reference Canvas 仍显示参考图；错误态说明上下文已保留；Retry analysis、Replace、Back to Edit 等继续行动可见；Prompt 区不被清空为死空态 | `e2e/workspace-ai-first-evidence.spec.ts` |

### 需要新增的 mock / fixture

- 复用 `mockUploadPresign(page)`, `mockAnalysisCreate(page, taskId)`, `mockAnalysisPolling(page, taskId, loadFixture("analysis-completed.json"))`, `mockGenerationList(page)` 和测试内 CDN 图片 mock。
- TC-3.4 使用测试内最小 inline analysis response 覆盖 `texture` 无 prompt span 的 facet-only 分支，不新增 fixture 文件。
- TC-3.5 使用测试内 `POST /api/analysis` 500 retryable response，不新增 helper。

### 需要新增的源码 data-testid

- `src/components/workspace/recipe-card.tsx` 或拆分后的 Style Intelligence facet 组件：`data-testid="evidence-facet-{facetId}"`，并设置 `data-source-field`、`data-selected`。
- `src/components/workspace/reference-card.tsx` 或拆分后的 Reference Canvas anchor 组件：`data-testid="reference-anchor-{facetId}"`，并设置 `data-selected`。
- `src/components/workspace/prompt-card.tsx` / `src/components/workspace/unified-prompt-editor.tsx` provenance 展示区：`data-testid="prompt-provenance-span-{facetId}"`，并设置 `data-selected`、`data-match-type="exact|keyword"`。
- prompt 无匹配时的 chip：`data-testid="prompt-provenance-facet-only-{facetId}"`，并设置 `data-match-type="facet_only"`。
- 可选：Reference Canvas 空态教学区 `data-testid="reference-canvas-empty-state"`，用于实现阶段收敛空态选择器。

## plan-04：Render Dock readiness 与生成恢复

> 来源：架构文档 §2.4 AC-04/AC-08、§3.2 生成就绪判断/开始生成/生成完成、§6.4、§7.2 RenderReadiness、§8.1、§8.2 L1/L2/L3、ADR-5；实现计划 plan-04 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-4.1 | 未上传/未分析时 Render Dock 展示完整 readiness 与不可生成原因 | Edge | plan-03 已完成；无 reference、无 prompt、历史列表 mock 为空 | 打开 `/workspace` | Render Dock 可见；readiness list 包含 Prompt、Variables、Style signals、Service、Workspace idle 5 项；Generate 禁用；按钮附近显示需要上传/分析或编辑 prompt 的原因与下一步行动 | `e2e/workspace-ai-first-render-dock.spec.ts` |
| TC-4.2 | prompt 含未解析变量时禁用生成并指向变量完整度 | Edge | 上传/分析完成；分析响应包含可编辑 template；用户把变量值改成 `{{subject}}` 使 resolved prompt 仍含变量标记 | 修改变量后查看 Render Dock | Variables readiness 为 blocked/waiting；Generate 禁用；disabled reason 指向 resolve variables/变量完整度；不发起 `/api/generation` | `e2e/workspace-ai-first-render-dock.spec.ts` |
| TC-4.3 | analysis_ready 且变量完整时可以生成并沿用现有 `/api/generation` contract | Happy | 上传/分析完成；prompt 非空、变量已解析、服务可用、workspace 非 busy | 点击 Render Dock 的 Generate | readiness 5 项均 ready；Generate enabled；POST `/api/generation` 请求体包含 `analysisTaskId`、resolved `promptText`、`negativePromptText` 和 UI 参数 | `e2e/workspace-ai-first-render-dock.spec.ts` |
| TC-4.4 | generation service unavailable 时阻断生成但保留编辑与保存能力 | 降级 | analysis_ready；第一次生成 POST 返回 `503` 和 `SERVICE_UNAVAILABLE` | 点击 Generate 后查看 Render Dock 和 Prompt 区 | Generate 禁用；disabled reason 显示 service unavailable/retry service；prompt 编辑器仍可编辑；保存 Style Memory 入口仍可见且可操作；reference/prompt context 不被清空 | `e2e/workspace-ai-first-render-dock.spec.ts` |
| TC-4.5 | generating 中禁止重复提交且参数控件保持可见 | Happy | analysis_ready；生成 POST 成功；轮询返回 `processing` | 点击 Generate 后尝试再次点击 | Workspace 进入 generating；Generate disabled/Rendering；Aspect Ratio 与 Quality 控件仍可见但 disabled；`/api/generation` 只收到 1 次 POST | `e2e/workspace-ai-first-render-dock.spec.ts` |
| TC-4.6 | generation failed 后保留上下文并提供 Retry / Back to Edit 恢复路径 | Error | analysis_ready；生成 POST 成功；轮询返回 `failed` 且 retryable | 点击 Generate，等待失败态 | Render Dock 和 Generation Dialog 均说明 reference/prompt/params 已保留；Retry 与 Back to Edit/Keep Editing 可见；prompt 编辑器仍显示原 prompt；参数值不丢失 | `e2e/workspace-ai-first-render-dock.spec.ts` |

### 需要新增的 mock / fixture

- 复用 `mockUploadPresign(page)`, `mockAnalysisCreate(page, taskId)`, `mockAnalysisPolling(page, taskId, response)`, `mockGenerationCreate(page, taskId)`, `mockGenerationPolling(page, taskId, response)`, `mockGenerationList(page)`。
- TC-4.2 使用测试内 inline analysis response，补 `analysisTemplateContent` / `analysisTemplateVariables`，不新增 fixture。
- TC-4.4 使用测试内 `POST /api/generation` 503 响应 `{ error, code: "SERVICE_UNAVAILABLE", retryable: true }`，不新增 helper。
- TC-4.5/TC-4.6 使用测试内 route 计数或现有 polling helper，不新增 fixture。

### 需要新增的源码 data-testid

- `src/components/workspace/output-card.tsx` / Render Dock 根节点保留 `data-testid="output-card"`，并新增 `data-readiness-can-generate="true|false"`。
- Render Dock readiness 列表：`data-testid="render-readiness-list"`。
- readiness 单项：`data-testid="render-readiness-item-prompt|variables|style-signals|service|workspace-idle"`，并设置 `data-state="ready|waiting|blocked|processing"`。
- disabled reason：`data-testid="render-disabled-reason"`，文本必须可见，不只放在 `title`。
- next action：`data-testid="render-next-action"`，承载 upload/analyze/resolve variables/retry service/wait/generate 等下一步。
- generation failed 恢复区：`data-testid="render-recovery-actions"`，包含 Retry 与 Back to Edit/Keep Editing 行动。

## plan-05：Iteration Memory 与保存记忆入口

> 来源：架构文档 §2.4 AC-02/AC-05/AC-08、§3.1 主流程 8、§3.2 历史恢复/保存风格记忆、§6.5、§7.3 generation history/template API、§7.4 restored 状态、§8.1、§8.2 L3/L4/L5；实现计划 plan-05 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-5.1 | 生成完成后 Iteration Memory 刷新并展示最新缩略图 | Happy | plan-04 Render Dock 已完成；历史列表首次 mock 为空，生成完成后 mock 返回 1 条最新 history item | 打开 `/workspace`，上传参考图并完成分析，点击 Generate，等待生成完成 | `generation-history` 被重新查询；Recent iterations 区域出现最新结果缩略图；旧 `generate-history-bar` 不回归 | `e2e/workspace-ai-first-iteration-memory.spec.ts` |
| TC-5.2 | 无历史时显示 Iteration Memory 教学空态 | Edge | 历史列表 mock 返回空数组；Workspace 没有已生成结果 | 打开 `/workspace` 查看底部 Recent iterations | 区域明确表达 `Iteration Memory`；显示 “renders will appear here as visual evidence”；说明后续可 compare、restore、reuse；Compare 禁用且不造成误操作 | `e2e/workspace-ai-first-iteration-memory.spec.ts` |
| TC-5.3 | 点击历史项打开详情并展示恢复、继续生成和保存记忆入口 | Happy | 历史列表 mock 返回 1 条；`GET /api/generation/:id` mock 返回 result、recipe、prompt snapshot、negative prompt、params、analysisTaskId | 打开 `/workspace`，点击历史缩略图 | `HistoryDetailDialog` 展示结果、prompt snapshot、negative prompt、aspect ratio、quality；操作包含 Restore to workspace、Generate variation/Continue editing、Save as Style Memory、Close | `e2e/workspace-ai-first-iteration-memory.spec.ts` |
| TC-5.4 | Restore 后 Workspace 回填 prompt、Style Intelligence、Render Dock 参数并可继续生成变体 | Happy | 历史详情 mock 返回 recipe、restored prompt、`16:9/hd` 参数；生成 POST mock 成功 | 打开历史详情，点击 Restore to workspace，再点击 Generate | Workspace 进入 `history_restored`；Prompt 显示 restored prompt；Style Intelligence 仍有 recipe facets；Render Dock 参数为 restored params；点击 Generate 后进入 `generating` | `e2e/workspace-ai-first-iteration-memory.spec.ts` |
| TC-5.5 | 从 restored state 保存 Style Memory 时携带历史来源上下文和变量 | Happy | 已 Restore 一条历史；`POST /api/templates` mock 捕获请求体 | 点击 Render Dock 的 Save as Style Memory，填写名称并保存 | TemplateSaveDialog 使用 restored prompt；POST 请求体包含 restored `sourceAnalysisTaskId`、source asset/image 和 variables，不丢失历史来源 | `e2e/workspace-ai-first-iteration-memory.spec.ts` |
| TC-5.6 | history API 失败时显示可恢复状态而不是误判为空历史 | 降级 | `GET /api/generation?pageSize=20...` mock 返回 500 retryable；Workspace 其他区域仍可渲染 | 打开 `/workspace` 查看 Recent iterations | 区域显示 history failed/retry/recoverable 状态；不显示“renders will appear here”空历史教学文案；不清空当前 workspace context | `e2e/workspace-ai-first-iteration-memory.spec.ts` |

### 需要新增的 mock / fixture

- `mockGenerationListSequence(page, responses)` — mock `GET /api/generation?pageSize=20...` 的序列响应，用于验证生成完成后的 history refresh。
- `mockGenerationDetail(page, generationId, detail)` — mock `GET /api/generation/:id`，返回包含 recipe、prompt snapshot、negative prompt、params 和 analysisTaskId 的恢复详情。
- `mockTemplateCreate(page, onBody, response)` — mock `POST /api/templates` 并捕获 Save as Style Memory 请求体。
- 不新增 fixture；复用 `analysis-completed.json`、`generation-completed.json`，history detail 数据在 spec 内按架构 §6.5/§7.3 最小 contract 构造。

### 需要新增的源码 data-testid

- HistoryStrip 空态/错误态容器：建议补 `data-testid="iteration-memory-empty-state"` 与 `data-testid="iteration-memory-error-state"`，便于区分 empty 与 API failure。
- HistoryDetailDialog 操作区：建议补 `data-testid="history-detail-actions"`，其中 Save/Continue/Restore 使用 role name 保持可访问。
- TemplateSaveDialog 若产品文案迁移为 Style Memory，建议 dialog label 同步为 `Save as Style Memory`，同时保持兼容现有保存模板 contract。

## plan-06：Style Memory 模板库迁移

> 来源：架构文档 §2.1、§2.4 AC-06/AC-07/AC-08/AC-09、§3.1 主流程 9、§3.2 使用风格记忆/受限未登录、§6.6、§7.2 StyleMemoryCardViewModel、§7.3 templates API、§7.4 Style Memory 状态映射、§7.6 产品术语映射、§8.1、§8.2 L4/L5；实现计划 plan-06 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-6.1 | Populated Style Memory 列表展示 AI-first 标题和记忆卡片证据 | Happy | plan-02 AppShell 已完成；`GET /api/templates?search=&limit=20` mock 返回 2 条，其中 1 条有 `sourceImageUrl`、2 个变量，1 条无来源图 | 打开 `/workspace/templates` | 页面主标题为 `Style Memory`，不出现旧主标题 `Template Library`；卡片展示来源图、变量数量、`No source preview` 缺省状态、派生 style tags 或 reuse intent；操作包含 Use memory/style、Duplicate、Delete | `e2e/ai-first-style-memory.spec.ts` |
| TC-6.2 | Use memory 沿用现有模板详情 API 注入 Workspace prompt/variables | Happy | 模板列表和 `GET /api/templates/:id` mock 返回 content 与 variables；Workspace 历史列表 mock 为空 | 在 Style Memory 卡片点击 Use memory/style | URL 跳转到 `/workspace?templateId=id` 或短暂带 query 后进入 Workspace；`UnifiedPromptEditor` 展示模板变量默认值，文本模式 resolved prompt 使用默认值 | `e2e/ai-first-style-memory.spec.ts` |
| TC-6.3 | Duplicate/Delete 继续调用现有模板 API 并刷新列表 | Happy | 模板列表 mock 返回 1 条；`POST /api/templates/:id/duplicate` 和 `DELETE /api/templates/:id` 使用现有 API contract mock | 通过卡片 More actions 依次 Duplicate、Delete | Duplicate 后新记忆出现在列表；Delete 确认后原记忆消失；请求路径仍为 `/api/templates/:id/duplicate` 和 `/api/templates/:id`，不调用 `/api/style-memory` | `e2e/ai-first-style-memory.spec.ts` |
| TC-6.4 | 空库状态使用 Style Memory empty copy 和创建入口 | Edge | `GET /api/templates?search=&limit=20` mock 返回空数组；未输入 search | 打开 `/workspace/templates` | `StatePresenter` 或等价状态区为 `data-status="empty"`；文案说明还没有 Style Memory，并提供从 Workspace 保存、Create from Reference 或 Back to Workspace 等下一步；不显示旧 “No templates yet” 死空态 | `e2e/ai-first-style-memory.spec.ts` |
| TC-6.5 | 搜索无结果状态可清除搜索并返回工作台 | Edge | 初始模板列表 mock 可为空；输入 search 后 GET 返回空数组 | 在搜索框输入无匹配关键词 | `data-status="noResults"` 可见；文案为 Style Memory 语义；Clear Search 和 Back to Workspace 行动可见；点击 Clear Search 清空搜索输入 | `e2e/ai-first-style-memory.spec.ts` |
| TC-6.6 | API 失败映射 failedRecoverable 而非误判空库 | Error | `GET /api/templates?search=&limit=20` mock 返回 500 retryable | 打开 `/workspace/templates` | `data-status="failedRecoverable"` 可见；文案说明 Style Memory 服务暂不可用但上下文保留；Retry 与 Back to Workspace 行动可见；不显示 empty/noResults 文案 | `e2e/ai-first-style-memory.spec.ts` |
| TC-6.7 | 401 未登录映射 authRequired 且不清空 Workspace 快照 | 降级 | sessionStorage 已有 Workspace 快照；`GET /api/templates?search=&limit=20` mock 返回 401 | 打开 `/workspace/templates` | `data-status="authRequired"` 或登录状态区可见；提供 Login/Sign in 与 Back to Workspace；sessionStorage 原 Workspace 快照保持不变 | `e2e/ai-first-style-memory.spec.ts` |

### 需要新增的 mock / fixture

- `mockTemplateCollection(page, initialTemplates)` — mock `GET /api/templates?search=&limit=20`、`GET /api/templates/:id`、`POST /api/templates/:id/duplicate`、`DELETE /api/templates/:id`，验证 Style Memory 仍复用现有 template API contract。
- 复用 `mockApiError(page, "**/api/templates?**", status, body)` 覆盖 authRequired 与 failedRecoverable 分支。
- 复用 `mockGenerationList(page)` 让跳转 Workspace 后不依赖真实 history API。
- 不新增 fixture；Style Memory list/detail 数据在 spec 内按架构 §6.6/§7.2/§7.3 最小 contract 构造。

### 需要新增的源码 data-testid

- Style Memory 页面状态区可复用 `StatePresenter` 的 `data-status="empty|noResults|authRequired|failedRecoverable"`，不强制新增 `data-testid`。
- `src/components/workspace/template-card.tsx` 可选补 `data-testid="style-memory-card"`、`data-has-source-image`，便于后续 green 阶段稳定区分 source image 与 no source preview。
- 卡片派生字段建议有可见 label：`Style tags` 或 `Reuse intent`，E2E 使用用户可见文案断言。

## plan-07：Landing / Auth / 全站空态收口

> 来源：架构文档 §2.4 AC-07/AC-08/AC-09、§3.1 主流程 1/2/3/10、§3.2 上传参考图/受限未登录、§6.1、§6.7、§7.4、§8.1、§8.2 L4/L5；实现计划 plan-07 验收标准。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-7.1 | Landing 第一屏直接解释 Reference -> Evidence -> Render 产品入口 | Happy | plan-02 AppShell 与 plan-06 Style Memory 语义已完成；登录 session mock 返回用户，避免 OAuth 干扰 | 打开 `/`，查看首屏 hero、产品预览和主行动 | `app-shell` 为 `data-variant="landing"`；首屏可见 Reference -> Evidence -> Render 顺序；文案说明 AI 会读取 color、composition、lighting、texture、mood，并辅助 prompt/render；主行动是上传 reference，次行动是浏览 Style Memory；首屏不是旧营销长页或抽象装饰预览 | `e2e/ai-first-landing-states.spec.ts` |
| TC-7.2 | Landing 上传入口只做 file handoff，Workspace 消费 pending file 后进入上传/分析链路 | Happy | 登录 session mock；`POST /api/upload/presign`、R2 PUT、`POST /api/analysis` 和 history list 使用 mock | 在 `/` 的上传入口选择测试图片 | 选择文件后跳转 `/workspace`；上传/分析请求发生在 Workspace 挂载后，不在 Landing 提前调用；`ai-status-header` 进入 uploading/analyzing；Reference Canvas 保留参考图或上传进度 | `e2e/ai-first-landing-states.spec.ts` |
| TC-7.3 | 受限/未登录状态显示 login/back action 且不清空 Workspace 快照 | 降级 | sessionStorage 已有 Workspace 快照；`GET /api/templates?search=&limit=20` mock 返回 401 | 打开 `/workspace/templates` | `app-shell` 和登录入口保持可见；`StatePresenter` 或等价状态区为 `data-status="authRequired"`；文案说明需要登录、workspace context 保留，并提供 Login/Sign in 与 Back to Workspace；sessionStorage 原快照不变 | `e2e/ai-first-landing-states.spec.ts` |
| TC-7.4 | Workspace empty 与 Style Memory empty/noResults 使用统一行动型状态语言 | Edge | Workspace 无 reference/prompt/history；Style Memory 列表 mock 为空并支持搜索无结果 | 先打开 `/workspace` 查看空态，再打开 `/workspace/templates` 和搜索无匹配关键词 | Workspace 空态说明 AI 将读取 reference evidence signals，并提供上传/Style Memory 路径；Style Memory empty 为 `data-status="empty"` 且提供 Create from Reference/Open Workspace；搜索无结果为 `data-status="noResults"` 且提供 Clear Search/Back to Workspace | `e2e/ai-first-landing-states.spec.ts` |
| TC-7.5 | 旧 Landing/Template 主文案不作为第 12 期主路径出现 | Edge | plan-07 实现后 Landing 已完成最终收口 | 打开 `/`，检查可见首页主路径文案 | 首页主路径不再出现旧 `Reference Image Style Recreation`、`Template Library`、`Visual Recipe`、`Recreate a Style in Three Steps`、孤立 `Generate a New Image in the Same Style` 等旧体系文案；Style Memory 作为用户可见术语出现 | `e2e/ai-first-landing-states.spec.ts` |
| TC-7.6 | Style Memory 服务失败映射 failedRecoverable 而不是误判空库 | Error | `GET /api/templates?search=&limit=20` mock 返回 500 retryable；Workspace 快照可选存在 | 打开 `/workspace/templates` | 状态区为 `data-status="failedRecoverable"`；说明服务失败但上下文保留；Retry 和 Back to Workspace 可见；不显示 empty/noResults 教学空态 | `e2e/ai-first-landing-states.spec.ts` |

### 需要新增的 mock / fixture

- 复用 `mockAuthSession(page)`, `mockUploadPresign(page)`, `mockAnalysisCreate(page, taskId)`, `mockAnalysisPolling(page, taskId, response)`, `mockGenerationList(page)`, `mockTemplateCollection(page, [])`, `mockApiError(page, "**/api/templates?**", status, body)`。
- 不新增 fixture；上传使用既有 `e2e/fixtures/test-image.png`，分析/状态响应使用测试内最小 inline 数据。

### 需要新增的源码 data-testid

- 无。plan-07 red E2E 复用 plan-02/06 已建立的 `app-shell`、`app-shell-primary-nav`、`app-shell-auth-entry`、`ai-status-header`、`reference-card` 和 `StatePresenter[data-status]` 契约；Landing 首屏用可见文案和现有语义角色断言。

## plan-08：第 12 期 Targeted E2E 与视觉 QA

> 来源：架构文档 §2.4 AC-01..AC-09、§8.1、§8.2、§8.5、§9 Phase D；实现计划 plan-08 验收标准。

### plan-08 证据回填

| 阶段 | 证据 | 结论 |
| --- | --- | --- |
| red | `docs/e2e/evidence/plan-08-e2e-red-20260707.md` | 预期失败，测试有效 |
| green | `docs/e2e/evidence/plan-08-e2e-green-20260707.md` | 通过 |

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
|---|------|------|---------|------|------|-----------|
| TC-8.1 | 第 12 期 targeted E2E 总门覆盖 AC-01..AC-09 | Happy | plan-01..07 targeted specs 已创建；plan-08 尚未实现最终总门 | 运行第 12 期 targeted bundle，并检查本用例文档 AC 覆盖矩阵 | bundle 包含 design system、shell、Workspace evidence、Render Dock、Iteration Memory、Style Memory、Landing states、visual regression；AC-01..AC-09 每条均映射到至少一个 spec 或视觉 QA checklist | `e2e/ai-first-visual-regression.spec.ts` + targeted bundle |
| TC-8.2 | Landing、Workspace idle、Style Memory populated 在桌面/宽屏/窄屏非空且关键 data-testid 可见 | Happy | 使用 mock auth、history、templates 和 CDN 图片；不依赖真实后端 | 在 1440x900、1280x800、390x844 打开 `/`、`/workspace`、`/workspace/templates` | `app-shell`、主导航、main 可见且非空；Workspace 的 `ai-status-header`、`workspace-three-column-layout`、`reference-card`、`recipe-card`、`prompt-card`、`output-card`、`history-strip` 可见；Style Memory 记忆卡片具备稳定 QA selector | `e2e/ai-first-visual-regression.spec.ts` |
| TC-8.3 | Workspace analysis_ready / generation failed 页面几何不重叠且 Render Dock 不遮挡 Prompt | Error | 上传/分析/generation failed 使用 mock；生成失败必须保留 prompt 与参数上下文 | 打开 `/workspace`，上传测试图到 `analysis_ready`，点击 Generate 并让 generation polling 返回 failed | 页面文本元素无明显几何重叠；按钮文本不溢出；`output-card` 不覆盖 `unified-prompt-editor`；`render-recovery-actions` 可见；失败态仍保留 Prompt 编辑区 | `e2e/ai-first-visual-regression.spec.ts` |
| TC-8.4 | Style Memory populated / empty / noResults / authRequired 状态通过视觉 QA | Edge | `/api/templates` 分别 mock 为 populated、空数组、搜索无结果和 401 | 打开 `/workspace/templates`，切换搜索与错误状态 | populated 卡片展示来源图、变量、Style tags、Reuse intent，且不退回旧文件列表；empty/noResults/authRequired 的 `StatePresenter` action 可见且按钮不溢出；不出现旧 `Template Library` / `No templates yet` 主路径 | `e2e/ai-first-visual-regression.spec.ts` |
| TC-8.5 | StatePresenter action 在异常/受限状态下保持可见 | 降级 | Style Memory 401、noResults 和 generation failed 均有 mock | 触发 authRequired、noResults、generation failed 三类状态 | 每个状态至少 1 个可见 action；按钮文本不被截断；状态说明包含保留上下文和下一步，不只显示错误码 | `e2e/ai-first-visual-regression.spec.ts` |
| TC-8.6 | legacy specs 迁移或隔离旧主体验断言 | Edge | plan-08 尚未迁移 `precision-glass-*`、`template.spec.ts`、`workspace-two-pane.spec.ts` 等历史 spec | 扫描旧 spec 中的旧文案、旧 two-pane、floating generate 断言 | 旧断言被迁移为 AI-first / Style Memory 语义，或明确标注为非第 12 期 targeted gate；不得继续作为第 12 期最终验收口径 | `rg` 残留扫描 + plan-08 evidence |
| TC-8.7 | 旧体系残留扫描区分允许命名与禁用主 UI 残留 | Edge | API/hook/repository 仍允许 `template` 命名；主 UI 不允许旧产品文案 | 运行 `rg -n "Template Library|workspace-two-pane-layout|floating-generate-window|Ready to Generate|GenerateHistoryBar|No templates yet" src e2e docs/e2e` | API/template 命名、历史迁移备注可记录为允许；主 UI 文案、主工作台组件、targeted specs 预期结果中不得出现旧体系残留 | `rg` 残留扫描 + plan-08 evidence |
| TC-8.8 | 最终 green 阶段记录 targeted bundle 与视觉 QA 结果 | Happy | plan-08 实现完成且 legacy spec 已迁移/隔离 | 运行 plan-08 验证命令中的 targeted bundle、残留扫描、type-check/lint/test/build | 通过/失败数量、HTML report、截图/trace 和残留扫描结果写入 green evidence；若 targeted spec 失败不得推进 review | `docs/e2e/evidence/plan-08-e2e-green-*.md` |
| TC-8.9 | red/green evidence 路径和 AC 覆盖证据可追踪 | Happy | red 阶段已有失败证据；green 阶段由 implementer 后续补齐 | 检查 README 非状态机区域、本用例文档和 evidence 文件 | red evidence 指向实际失败命令和 HTML report；green evidence 指向实际通过命令；AC-01..AC-09、视觉 QA、legacy 迁移/隔离、残留扫描均有可追踪证据 | `docs/e2e/evidence/plan-08-e2e-red-20260707.md` |

### plan-08 AC 覆盖矩阵

| AC-ID | plan-08 覆盖项 | 证据类型 |
| --- | --- | --- |
| AC-01 | TC-8.1 targeted bundle 包含 `ai-first-design-system.spec.ts`；TC-8.7 扫描旧 token/旧主体验残留 | targeted E2E + 残留扫描 |
| AC-02 | TC-8.2/TC-8.3 覆盖 Workspace shell、Reference、Style Intelligence、Prompt + Render、Recent iterations | 视觉 QA spec |
| AC-03 | TC-8.1 继承 `workspace-ai-first-evidence.spec.ts`；TC-8.3 覆盖 analysis_ready 几何与 Prompt provenance 区域 | targeted E2E + 视觉 QA spec |
| AC-04 | TC-8.3 覆盖 Render Dock readiness、disabled reason、生成失败恢复和不遮挡 Prompt | 视觉 QA spec |
| AC-05 | TC-8.1 继承 Iteration Memory targeted spec；TC-8.2 检查 `history-strip` 在关键视口可见 | targeted E2E + 视觉 QA spec |
| AC-06 | TC-8.4 覆盖 Style Memory populated/empty/noResults/authRequired 视觉 QA 与卡片 selector | 视觉 QA spec |
| AC-07 | TC-8.2 覆盖 Landing/Workspace/Style Memory 跨页面壳层一致性；TC-8.6/TC-8.7 覆盖旧体系迁移 | 视觉 QA spec + 残留扫描 |
| AC-08 | TC-8.3/TC-8.5 覆盖 generation failed、authRequired、noResults 的上下文保留和 action 可见 | 视觉 QA spec |
| AC-09 | TC-8.1 继承 Landing first step、Workspace empty、Style Memory empty targeted specs；TC-8.2/TC-8.4 检查空态和首屏非空 | targeted E2E + 视觉 QA spec |

### plan-08 视觉 QA checklist

- 视口：1440x900、1280x800、390x844。
- 页面状态：`/`、`/workspace` idle、`/workspace` analysis_ready、`/workspace` generation failed、`/workspace/templates` populated、empty、noResults、authRequired。
- 几何断言：主 UI 非空；关键 `data-testid` 可见；文本元素不明显重叠；按钮文本不溢出；Render Dock 不遮挡 Prompt editor；StatePresenter action 可见；Style Memory 卡片不退回旧文件列表。
- 无截图基线时使用 DOM 几何、非空、selector 和 overflow 断言；截图只作为 Playwright report / failure artifact。

### plan-08 legacy 迁移/隔离与残留扫描

- 需要迁移/隔离：`e2e/precision-glass-home.spec.ts`、`e2e/precision-glass-shell.spec.ts`、`e2e/template.spec.ts`、`e2e/workspace-two-pane.spec.ts`，以及仍断言 `Ready to Generate` / `floating-generate-window` 的旧 09/10/11 期 specs。
- 手动扫描命令：`rg -n "Template Library|workspace-two-pane-layout|floating-generate-window|Ready to Generate|GenerateHistoryBar|No templates yet" src e2e docs/e2e`。
- 允许残留：API、repository、hook、TypeScript 命名中的 `template`；历史 evidence 中说明旧用例迁移背景；plan-08 用例文档中列出的禁止词本身。
- 不允许残留：主 UI 文案、主工作台组件、主路由导航、第 12 期 targeted specs 的预期结果。

### 需要新增的 mock / fixture

- red 阶段复用 `mockAuthSession`、`mockGenerationList`、`mockTemplateCollection`、`mockApiError`、`mockUploadPresign`、`mockAnalysisCreate`、`mockAnalysisPolling`、`mockGenerationCreate`、`mockGenerationPolling` 和既有 `analysis-completed.json`。
- 不新增 fixture；视觉 QA 使用 inline Style Memory records 和现有 `test-image.png`。

### 需要新增的源码 data-testid

- `src/components/workspace/template-card.tsx` → `data-testid="style-memory-card"`，并建议带 `data-has-source-image="true|false"`，让视觉 QA 能稳定区分真实 Style Memory 卡片与旧文件列表/骨架。

## 汇总

| 类型 | 数量 |
|------|------|
| Happy Path | 25 |
| Error Path | 6 |
| Edge | 11 |
| 降级场景 | 6 |
| 合计 | 48 |
