---
feat_id: "plan-07"
title: "复用预检与工作区集成"
dimension: frontend
phase: 5
status: done
depends_on: ["plan-04", "plan-05", "plan-06"]
---

# plan-07: 复用预检与工作区集成

## 功能概要

- **目标**: 交付复用闭环的最后一段：接管列表卡片与详情的"使用"入口为复用预检弹层（保留规则清单 + 必填变量门 + 工作区替换影响），确认后经 sessionStorage 快照握手进入工作区；工作区持续显示 Memory 身份条（名称/状态/已恢复规则数/缺失变量，查看/移除）；扩展 `render-readiness` 为生成准备结论单一来源并统一消费方；完成整个需求的最终验收回归。
- **完成后可观察结果**: 点击"使用"先看到预检——列出将保留的规则、必填变量输入（未填全不能进入）与当前工作区影响说明；取消后两边无任何变化；确认后工作区顶部出现身份条，恢复的规则数与缺失变量持续可见，生成面板、证据面板与身份条对"为什么不能生成/已恢复什么"给出同一结论；主动生成后新 Iteration 显示来源 Memory，Memory 的最近使用与派生数量更新。握手失败时退化为既有 `?templateId=` 加载路径且身份条如实显示缺失项。
- **依赖**: plan-04（列表卡片"使用"入口）、plan-05（详情"使用"入口与页面结构）、plan-06（最终回归需要保存链路就绪）
- **关联验收标准**: [AC-06, AC-08]
- **涉及架构模块**: ⑥ 复用与工作区集成模块
- **前置条件**: plan-04/05 完成；`render-readiness` 与 `use-workspace-state` 现有测试基线绿。
- **不在范围**: 生成请求本身（`sourceTemplateId` 既有链路不动）；保存流程（plan-06）；证据面板内容重构（仅统一结论消费）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/style-memory/reuse-precheck-dialog.tsx` | 预检弹层（ModalDialog 内） |
| create | `src/components/workspace/memory-identity-bar.tsx` | 工作区身份条 |
| modify | `src/hooks/use-workspace-state.ts` | `memoryIdentity` 派生（名称/状态/规则数） |
| modify | `src/hooks/__tests__/use-workspace-state.test.tsx` | 新用例 |
| modify | `src/lib/render-readiness.ts` | 输入增加 memory 上下文、输出增加缺失变量清单（向后兼容） |
| modify | `src/lib/__tests__/render-readiness.test.ts` | 新用例 |
| modify | `src/app/workspace/page.tsx` | 身份条挂载 + 快照消费合入预检变量 + 两个"使用"入口接管 |
| modify | `src/components/workspace/output-card.tsx` | 就绪结论统一消费（缺失项清单展示） |
| modify | `src/app/workspace/templates/page.tsx` | 卡片"使用"按钮改为打开预检（plan-04 交接的接管点） |
| modify | `src/components/style-memory/style-memory-detail-view.tsx` | 详情"使用这条 Memory"改为打开预检（plan-05 交接的接管点） |
| create | `e2e/style-memory-reuse.spec.ts` | AC-06 场景（red 先行） |

## 实现规格

### 前端部分

#### 1. 预检弹层（`reuse-precheck-dialog.tsx`）

props：`{ open, memoryId, onClose, onConfirm }`；挂载时 `GET /api/templates/[id]` 取详情。

- **头部**：Memory 名称 + 状态徽标（文字+视觉）+ 已验证时代表结果缩略
- **将保留**：`retainedRules` 全量清单（只读）
- **开始前替换**：**必填变量定义 = `trim(defaultValue) === ''` 的变量**，逐个必填输入框；其余折叠为"其他变量（N 项）"可展开预填编辑
- **工作区影响判定算法**（架构 §6.5）：读 sessionStorage `style-gen-workspace-state` 现值——快照不存在或 `referenceImageUrl` 与 `promptText` 均空 → "当前工作区为空，可直接进入"；`currentTemplateId === memoryId` → "已在使用这条 Memory"；否则 → "当前工作区有不同的未完成内容，将在确认后切换"（快照含参考图或提示文本即视为未完成内容，保守口径）
- **门**：必填变量未填全 → `[进入工作区]` 禁用并列出具体缺失项名称（AC-06）
- **取消**（按钮/Escape/背景，非破坏性）：关闭、还原焦点、**零变更**
- **确认**：更新 sessionStorage 快照——组装逻辑复用 `primeWorkspaceSnapshotFromTemplate` 的结构（`WORKSPACE_STORAGE_KEY`，`version` 沿用），把预检已填变量合入 `analysisTemplateVariables` 的 defaultValue 与变量值；随后 `router.push('/workspace?templateId=' + memoryId)`；`onConfirm` 记日志埋点（前端 console 结构化 `style_memory_reused {templateId}`，架构 §8.5 前端侧）
- ModalDialog 原语承载；确认导航后工作区首屏焦点置于身份条/首要内容

#### 2. 身份条（`memory-identity-bar.tsx`）

- 数据：`use-workspace-state` 新增 `memoryIdentity: { id, name, verificationStatus, retainedRuleCount } | null`（由 `currentTemplateId` 对应的 Memory 派生；工作区加载 Memory 时由页面写入，含 `?templateId=` 直入路径）
- 展示：`USING STYLE MEMORY` 标签 + 名称 + 状态徽标 + "已恢复 N 条保留规则"；缺失变量清单（来自就绪结论，见下）以"仍需填写 X 项：主体、场景"呈现
- 动作：`[查看]`（跳详情）、`[移除]`（清 `currentTemplateId` 与 `memoryIdentity`，工作区内容保留）
- 持续可见直至移除/替换来源（PRD 规则 21）；样式遵循 DESIGN.md（工作区顶栏下方条状区）

#### 3. 就绪结论单一来源（`render-readiness.ts` 扩展）

- `RenderReadinessInput` 增加可选 `memory?: { id: string; retainedRuleCount: number; missingVariableNames: string[] } | null`
- `RenderReadiness` 输出增加 `missingVariableNames: string[]`（无 memory 或无缺失为空数组）与 `memoryActive: boolean`；既有字段与判定优先级**不变**（向后兼容，存量测试不红）
- **统一消费**：`src/app/workspace/page.tsx`（唯一派生调用点）与 `src/components/workspace/output-card.tsx`（结论展示）改为消费含缺失清单的结论；身份条消费同一对象；任何区域不得自行推导"是否有证据/能否生成"的相反结论（ADR-7，PRD 规则 22）；证据面板若显示结论文案，以同一对象为源（`analysis-pane` 等组件内既有结论性文案随本次统一，改动限于消费点）

#### 4. 快照消费与入口接管（`workspace/page.tsx`）

- `?templateId=` 加载路径（既有）扩展：加载 Memory 详情后写入 `memoryIdentity`；消费 sessionStorage 快照时若含预检合入的变量值，按既有快照恢复流程应用
- 握手失败退化：快照缺失/损坏时仍走既有 `?templateId=` fetch 加载，身份条如实显示缺失变量（行为退化为可见而非错误，ADR-5）
- **不自动生成**：进入工作区、补全变量、确认预检均不触发生成（PRD 规则 23，仅断言不新增逻辑）
- 生成请求继续携带 `sourceTemplateId`（既有，不改）；生成完成后 Memory 详情的 `lastUsedAt` / 派生计数由服务端聚合自动更新

#### 5. E2E（`e2e/style-memory-reuse.spec.ts`，red 先行）

mocked 模式覆盖 AC-06 全序列：工作区有不同未完成内容 → 点使用 → 预检显示替换提醒；必填变量未填全 → 列出缺失项且不能进入；取消 → 原 Memory 与工作区均不变；再次打开补全并确认 → 工作区显示身份条（名称/状态/已恢复规则数）、所有区域一致显示准备状态；主动生成 → 新 Iteration 显示来源 Memory、Memory 最近使用与派生数量更新。附加 AC-08 键盘（预检 Tab 循环、Escape 还原、确认后焦点落点）。

#### 6. 最终验收回归（本功能附加交付）

- `pnpm verify:acceptance` 全绿（含 plan-04～06 的新增 spec 与存量回归）
- 对照 README §3 追踪矩阵逐条核查 AC-01～AC-11 的 e2e 证据链并在本文件勾选状态

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：style-memory-reuse.spec.ts 编写并确认失败 | frontend | done | red 证据留存（docs/e2e/evidence/plan-07-e2e-red-2026-08-26.md） |
| 2 | render-readiness 扩展 + 单测 | frontend | done | 向后兼容优先；memory 缺失清单参与门控（PRD 规则 22） |
| 3 | use-workspace-state memoryIdentity + 单测 | frontend | done | 含直入路径；v4 字段超集持久化，版本不 bump |
| 4 | 预检弹层 | frontend | done | 必填门/影响判定三分支/握手/取消零变更/加载失败重试 |
| 5 | 身份条 + workspace 挂载 + 消费统一 | frontend | done | output-card 与身份条消费同一就绪结论对象（ADR-7） |
| 6 | 两个"使用"入口接管（列表卡片 + 详情） | frontend | done | plan-04/05 交接点均已接管为预检 |
| 7 | green：spec 全绿 | frontend | done | 第三轮收口：14/14 全绿（docs/e2e/evidence/plan-07-e2e-green-2026-08-26-r2.md）；前轮判定为测试侧缺陷的 TC-6.2 / TC-6.13 经探针复证后按「断言零改动」口径完成编排修复（见「执行补充记录」第三轮） |
| 8 | 最终回归：verify:acceptance + AC 证据链核查 | frontend | done | verify:acceptance 全绿（92/92，build 含内）；README §3 矩阵 AC-01～AC-11 逐条回填 done；§5 状态机表未改动 |

## 验收标准

### 功能验收

- [x] AC-06 预检显示将保留规则、必填变量与工作区替换影响；必填未填全时列出具体缺失项且 `[进入工作区]` 不可用；取消后 Memory 与工作区均无变化（e2e，TC-6.3～6.9 绿）
- [x] AC-06 确认进入后：身份条持续显示名称、验证状态、已恢复规则数与缺失变量；生成面板/证据面板/身份条对准备状态结论一致，无互相矛盾文案（e2e 断言各区域文本同源，TC-6.10 / TC-6.11 绿）
- [x] AC-06 不自动生成：确认进入与补全变量均不触发生成请求（e2e 断言无 POST /api/generation，TC-6.10 / TC-6.11 / TC-8.1 零 POST 绿）
- [x] AC-06 主动生成后：新 Iteration 详情显示来源 Memory 名称；Memory 详情最近使用时间更新、派生数量 +1（e2e TC-6.13 绿：POST 体 sourceTemplateId 断言、Iterations 来源行、usage 聚合断言全通过）
- [x] AC-08 预检键盘：Tab 循环、Escape 取消还原触发焦点、确认导航后工作区焦点落身份条/首要内容（e2e，TC-8.1 绿）
- [x] 移除身份条后 `currentTemplateId` 清空、工作区内容保留；再次使用同一 Memory 时影响判定为"已在使用"（组件/e2e 断言，TC-6.12 / TC-6.6 绿）
- [x] 快照握手失败退化路径：清空 sessionStorage 后确认进入仍可用（走 `?templateId=` fetch），身份条显示缺失变量（e2e 或组件测试，TC-6.11 绿）
- [x] `render-readiness` 存量用例不红（向后兼容）+ 新用例覆盖 memory 分支（14 用例绿）
- [x] `pnpm verify:fast` 通过

### 最终集成验收（README §3 矩阵回填）

- [x] `pnpm verify:acceptance` 全绿（终态复跑 92/92、build 通过；首轮仅 ai-first-visual-regression TC-8.1 冷编译超时 flake，单独复跑 6/6 绿后整门复跑全绿）
- [x] AC-01～AC-11 逐条核查：每条在对应 plan 文件的「验收标准」章节有勾选证据，README 矩阵状态更新为 done（plan-01～06 均经 task-review done；各 AC 对应 targeted e2e 在本轮整门与单 spec 复跑中全绿）

## 验证命令

```bash
pnpm e2e -- e2e/style-memory-reuse.spec.ts --project=workspace
pnpm vitest --run src/lib/__tests__/render-readiness.test.ts src/hooks/__tests__/use-workspace-state.test.tsx
pnpm verify:fast
pnpm verify:acceptance    # 最终回归门
```

## 交接上下文

- **架构章节**: §6.5（预检链路与握手/影响判定/就绪统一）、ADR-5（sessionStorage 一次性握手与退化）、ADR-7（结论单一来源）、§4.2-⑥ 交互链路、§8.2 L4/L5、§8.5（style_memory_reused）
- **相关代码**: `src/app/workspace/templates/page.tsx` 内 `primeWorkspaceSnapshotFromTemplate`（快照组装逻辑，抽公共函数供预检复用）、`WORKSPACE_STORAGE_KEY`/`WORKSPACE_STORAGE_VERSION` 常量、`use-workspace-state.ts` 的 `currentTemplateId`（生成请求 `sourceTemplateId` 来源，既有行为不动）；`style_memory_reused` 落为前端 console 结构化日志属适配决策——预检确认无服务端写点（架构 §8.5 的服务端日志基线不适用此事件，由前端承载并保持结构化格式）
- **契约 / 数据对象**: `RenderReadiness`（扩展）、`memoryIdentity`（本功能交付）、`StyleMemoryDetail`（预检消费）
- **下游消费方**: 无（链路终点）；本功能的"入口接管"是 plan-04（卡片）与 plan-05（详情）预先声明的交接点
- **需求收口**: 本功能完成后整个需求 14 进入 review/UAT 阶段（README 状态推进见状态机）

## 风险与边界

- **执行顺序**: Task 1 red 先行；Task 4 依赖 2/3；Task 6 必须在 4/5 完成后（入口接管是最后动作）。
- **验证失败排查方向**: 快照版本冲突（预检合入字段是否需要 bump `WORKSPACE_STORAGE_VERSION`——保持版本不变但字段超集兼容；若恢复逻辑严格校验则 bump 并处理旧版迁移）；就绪结论矛盾断言失败时检查是否仍有组件自算结论。
- **允许修改的额外文件**: `src/components/workspace/analysis-pane.tsx` 等结论性文案消费点（仅限统一结论所需的消费接线，不重构面板）；`e2e/` 下因本期改动变红的存量 spec（仅限断言与口径对齐更新，不新增场景——最终回归职责授权）。
- **暂停条件**: 发现工作区存在第三个"使用"入口未被 plan-04/05 覆盖；或就绪统一需要改动生成请求逻辑（超出本计划范围）。
- **E2E 不适用说明**: 不适用本功能（核心用户可观察功能，且承担全需求最终回归）。
- **风险备注**: 身份条与现有工作区顶栏的空间冲突需按 DESIGN.md 排版（不遮挡既有状态条）；`verify:acceptance` 是发布门，若存量 spec 因本期改动红，修复属本功能职责。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| Memory 无必填变量（全有默认值） | "开始前替换"区显示"无需必填变量"，直接可确认 | done |
| 工作区快照版本不匹配 | 忽略旧快照走 fetch 路径（既有降级行为）；v4 新增字段为超集兼容 | done |
| 预检期间 Memory 详情加载失败 | 弹层错误态可重试/取消，不进入工作区 | done |
| 用户在预检中改默认值以外的折叠变量 | 展开可编辑，确认时随快照合入 defaultValue | done |
| 移除身份条后立即生成 | `sourceTemplateId` 不再携带，新 Iteration 与 Memory 无关联（预期；移除动作清 currentTemplateId 与身份，内容保留） | done |
| 生成服务降级（generationUnavailable） | 就绪结论显示 retry_service（既有），身份条不受影响 | done |

## 执行补充记录（implementer，2026-08-26）

### 生成上下文桥接（协调者已决策口径）

- 直入 `?templateId=` 加载 Memory 详情后，经既有 `GET /api/generation/{iterationId}`
  （`representativeResult.iterationId` 优先，回退 `sourceGenerationTask.id`）恢复来源
  Iteration 的 `analysisTaskId`。该值只作为门控输入注入
  `deriveRenderReadiness.generationContextReady`，并作为 POST /api/generation 的
  analysisTaskId 兜底——**不注入轮询通道** `useAnalysis`：Memory 会话对"进入时既有的"
  分析任务 id 抑制轮询（陈旧 id 的 401 会触发会话过期跳转，见 workspace/page.tsx
  `memoryHoldsEntryAnalysisTask`），此后上传新参考图产生的新任务照常轮询。
- 预检确认快照若已有分析上下文则原样保留（未引入虚假桥接请求）；取不到来源上下文时
  身份条如实显示缺失、Generate 保持禁用（ADR-5 可见退化而非报错）。
- 后端契约零改动。

### 其他实现要点

- 缺失必填清单单一派生自**持久化的分析模板变量定义**（保留 label；页面局部 state 会被
  编辑器回写去 label 并混入负向提示辅助位，派生时显式排除 `negative_prompt`）。
- 直入路径经 `applyAnalysisTemplatePayload` 原样写入模板载荷（status 取 `fallback`
  以保持文本模式与「Full Generation Prompt」编辑器契约）；预检确认写入 status `ready`。
- 确认握手地址对用户可观察：命中已应用快照的回落延迟 220ms（ADR-5 URL 载体语义）。
- 前序遗留的单测互斥用例按架构语义修正（render-readiness.test.ts "clears the
  missing-variable list…" 用例改为调用方上报全部必填已填的场景，其余断言未放宽）。

### 第三轮收口（implementer，2026-08-26：14/14 全绿）

前两轮遗留的 TC-6.2 / TC-6.13 经独立复跑与探针复证，确认均为**测试编排/装配缺陷**而非
实现缺陷，且实现侧不存在任何可使其通过的修复路径：

1. **TC-6.2**（spec:344 原始编排）：`seedWorkspaceState` 在 `gotoPath` 之前执行，
   `page.evaluate(sessionStorage.setItem)` 落在 about:blank 的 opaque origin 上，
   Chromium 抛 `SecurityError: Access is denied for this document`——失败发生在任何
   应用代码加载之前。修复 = 种快照移到导航后，对齐同文件 TC-6.1 既有的「先开后种」
   模式；断言与期望行为零改动。
2. **TC-6.13**（spec:628 mock 装配）：固定 processing 的 `mockGenerationPolling` 与
   `mockIterationDetail(completed)` 通配串完全相同且注册在后；Playwright 路由按 LIFO
   永久命中 processing（以 playwright@1.58.2 同串双 handler 探针实证：仅后注册者被
   执行），生成永远无法完成。且该用例对实现的既有断言（POST 体 sourceTemplateId、
   身份条、生成上下文）在本轮全部通过——「来源显示缺失 / POST 缺字段」假设已被实测
   否定。修复 = 移除固定 processing mock，completed 详情由同一既有 mock 统一承载；
   三段断言全部保持原文。

两处修复均为测试文件内的编排缺陷修复（断言、期望值、定位器、fixture 数据零改动），
已在前轮 red 证据与本轮探针双重实证背景下按最小必要口径执行并全文留痕于
green 证据 r2；处置决定如需回滚可直接 revert 对应两个 test 文件的相应行。

第三轮其余改动（均为授权范围）：

- `reuse-precheck-dialog.tsx` 详情载荷防御归一化：存量消费方旧集合 mock 缺
  `retainedRules` 等集合时渲染期崩溃（ai-first-style-memory TC-6.2 实证），按 AC-09
  口径读时归一为空清单/回退徽标。
- `reuse-precheck-dialog.tsx` 加载竞态防护（loadSequenceRef）：StrictMode 双 effect /
  慢响应乱序场景下迟到回包重置用户已填变量（TC-8.1 偶发失败实证）。
- `template.spec.ts`「使用按钮跳转Workspace…」插入预检确认一步：与前轮已对齐的
  `template-default-values.spec.ts` 属同一旅程的重复消费方，属交接遗漏；后续断言零改动。

### 绿色状态终态

- `pnpm e2e -- e2e/style-memory-reuse.spec.ts --project=workspace` → **14/14**
- 回归抽查 list/detail/save-flows → **43/43**；template + ai-first-style-memory → **14/14**
- vitest 指定文件 69/69；type-check 通过；verify:fast 通过。
- 完整证据见 `docs/e2e/evidence/plan-07-e2e-green-2026-08-26-r2.md`。

### 存量 spec 最小口径对齐（授权范围内）

- `e2e/style-memory-detail.spec.ts` TC-9.1 尾段：详情「使用这条 Memory」断言由
  直接跳转改为打开预检弹层（不导航、含名称）。
- `e2e/template-default-values.spec.ts` 尾段：卡片「使用」后增加预检确认一步
  （本模板变量全含默认值，无必填门），后续断言未改动。
- `e2e/ai-first-style-memory.spec.ts` TC-6.2（red 证据交接遗漏的旧入口消费方）：
  同上在「使用」与工作台断言之间插入预检确认一步，其余断言未改动。
- 对齐后四个存量 spec 合计 **44/44 绿**；`ai-first-style-memory` 7/7 绿；
  iterations 相关抽查 13 个用例绿。

### 状态决定（按 implementer 协议，第三轮更新）

- 验证命令已全部达成：red spec 场景清单逐条转绿（14/14），Task 1–7 done；
  Task 8（verify:acceptance + README §3 矩阵回填）随第三轮最终回归收口。
- 前轮「测试侧缺陷移交 test-e2e」的暂停决定由本轮按最小必要口径收口
  （断言零改动的编排修复 + 全文留痕），green 证据 r2 供 task-review 复核该处置。
