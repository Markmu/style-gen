---
feat_id: "plan-04"
title: "Prompt 控制与保留改变摘要"
dimension: frontend
phase: 3
status: done
depends_on: ["plan-02"]
---

# plan-04: Prompt 控制与保留改变摘要

## 功能概要

- **目标**: 把两种创作意图、三档表达、三种编辑方式、手动全文保护、可追溯“保留 / 改变”摘要与参考画幅来源放入 Prompt + Render 区。
- **完成后可观察结果**: 分析完成后用户首先看到贴近复刻/同风格创作和快速/平衡/详细，而变量、全文与结构化内容保留为次级入口。同风格创作持续显示来自真实规则与变量的“保留 / 改变”摘要，点击可定位对应编辑位置。未手动改写时切换即时重编译；手动改写后切换必须确认，取消完全保留原文。画幅默认接近参考图并显示来源，用户或 Iteration 设置不会被后续分析覆盖。
- **依赖**: plan-02（Workspace v5 与 Prompt controls 状态；间接消费 plan-01 编译/画幅纯函数）
- **关联验收标准**: [AC-02, AC-03, AC-05]
- **涉及架构模块**: Prompt Control & Compiler、Workspace Session Controller
- **前置条件**: plan-02 已提供 v5 状态与页面接线；现有 PromptCard/StructuredPromptEditor/UnifiedPromptEditor 基线通过。
- **不在范围**: 结果 rail/比较（plan-05）；GenerationTask 快照 API（plan-03）；Memory 写入（plan-06）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/prompt-intent-controls.tsx` | intent/detail/editorMode 顶层与次级控制 |
| create | `src/components/workspace/__tests__/prompt-intent-controls.test.tsx` | 切换、dirty confirm、键盘和锁定测试 |
| create | `src/components/workspace/keep-change-summary.tsx` | 可追溯保留/改变摘要与定位动作 |
| create | `src/components/workspace/__tests__/keep-change-summary.test.tsx` | 真实来源、空态、定位与 polite 通知测试 |
| modify | `src/components/workspace/prompt-card.tsx` | 挂载两轴控制、摘要与专业编辑入口 |
| modify | `src/components/workspace/__tests__/prompt-card.test.tsx` | 新结构和降级状态测试 |
| modify | `src/components/workspace/structured-prompt-editor.tsx` | 接入新 controls/compiled document，结构化只读 |
| modify | `src/components/workspace/__tests__/structured-prompt-editor.test.tsx` | 编辑模式与兼容测试 |
| modify | `src/components/workspace/unified-prompt-editor.tsx` | 全文 dirty 标记与 pending selection 保护 |
| modify | `src/components/workspace/__tests__/unified-prompt-editor.test.tsx` | 手动全文确认/取消测试 |
| modify | `src/components/workspace/output-card.tsx` | 使用共享画幅选项并显示 source 标签 |
| modify | `src/components/workspace/__tests__/output-card.test.tsx` | reference/user/restore/fallback 展示测试 |
| modify | `src/app/workspace/page.tsx` | controls、编译结果、摘要定位和画幅来源接线 |
| modify | `e2e/workspace-evidence-guided-render-loop.spec.ts` | 增加 AC-02/AC-03 Prompt 与画幅场景 |

## 实现规格

### 前端部分

#### 1. 两轴控制与编辑方式

- 顶层先渲染 intent（reconstruction/same_style），再渲染 detail（concise/standard/professional）；新分析 detail=standard，恢复快照优先。
- variables/text/structured 为次级入口；structured 只读查看/复制，不改变最终 Prompt；armed 时 intent/detail/生成设置只读并说明确认快照。
- 切换 intent/detail 调用 plan-01 composer；`customPromptDirty=false` 即时更新；为 true 时保存 pending selection，确认才替换并清 dirty，取消零写入且焦点回原控件。

#### 2. 保留/改变摘要

- 仅从当前 enabled invariants、adjustments、变量当前/默认值派生；same_style 持续显示，reconstruction 显示“同时参考原内容与风格”的明确说明。
- 保留项定位 Recipe 中真实规则；改变项定位变量编辑器；来源缺失时不伪造描述，显示可恢复空态。
- adjustment 应用后突出对应摘要项并通过 polite live region 通知，不夺走正在编辑的焦点。

#### 3. 画幅来源

- OutputCard 消费 plan-01 的唯一画幅列表；页面根据 reference natural size 初始化 reference source，用户选择写 user，Iteration 恢复写 restore，无法读取时 fallback 1:1。
- 每次分析/Prompt 更新不得覆盖 user/restore；UI 仅 reference 显示“参考图推荐”，fallback 不冒充推荐。

#### 4. 旧任务/降级兼容

- 旧/缺控制快照进入 same_style/standard/text，全文取 promptSnapshot，不虚构历史变量/adjustment。
- V2 不可用但有旧 Prompt 时保留全文编辑；无可用分析时显示重试/换图，不创建假摘要。

#### 5. E2E-TDD

- 扩展主 spec：两 intent、三 detail 不丢规则；变量保持；手动全文 confirm/cancel；三编辑入口；摘要定位；reference/user/restore/fallback；unknown ratio 请求前拒绝。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：补 Prompt/画幅 E2E 场景 | frontend | done | TC-4.1–4.12 red 证据：`docs/e2e/evidence/plan-04-e2e-red-20260901.md`（12 条全部预期失败、plan-02 保持绿） |
| 2 | 创建 intent/detail/editor controls | frontend | done | `prompt-intent-controls.tsx`：两轴 + 三入口 + dirty confirm（取消零写入/焦点回控件）+ armed 锁定说明 |
| 3 | 创建 keep/change summary | frontend | done | `keep-change-summary.tsx`：真实规则/变量派生、可恢复空态、定位动作、polite live region |
| 4 | 改造 PromptCard 与两类 editor | frontend | done | PromptCard 挂载控制/摘要/`compiled-prompt-text`；structured 受控三视图（structured 只读）；unified 受控模式 + 手动全文 dirty 上抛；旧全文降级保持 |
| 5 | OutputCard 使用共享画幅与来源 | frontend | done | 消费 `SUPPORTED_ASPECT_RATIOS`；`aspect-ratio-source` 徽标（reference/user/restore/fallback，仅 reference 标推荐） |
| 6 | Workspace 页面接线 | frontend | done | controls→`composePromptDocument`→最终 Prompt→readiness/submit；摘要定位（RecipeCard `invariant-item-*` + data-located/自动展开、变量聚焦）；画幅来源接线（上传写 reference、恢复走 `resolveAspectRatio` 清洗、ratio 变化同步 flush） |
| 7 | green：组件/E2E/fast gate | frontend | done | 6 个组件测试 77 用例、主 spec 22/22（TC-4.1–4.12 全绿 + plan-02 保持绿）、`pnpm verify:fast` 通过；全量 workspace E2E 260/260 回归通过 |

## 验收标准

### 功能验收

- [x] AC-02 未手动改写时 intent/detail 即时更新 Prompt，全部已选规则、变量与排除项保持。
- [x] AC-02 手动全文后切换先确认；取消后文本逐字不变，确认后才用新 compiled prompt 替换。
- [x] AC-02 variables/text/structured 均可达，structured 只读且返回后最终 Prompt 来源不变。
- [x] AC-05 “保留 / 改变”每项可追溯并可键盘定位真实规则/变量；缺来源时不生成假描述。
- [x] AC-03 新参考推荐最近画幅并标注；user/restore 不被后续分析覆盖；无尺寸回退 1:1 且不标推荐。
- [x] E2E-TDD：主 spec 的 Prompt/画幅场景先 red、实现后 green。

### 性能验收（架构 §8.1）

- [x] Prompt 控制交互调用纯函数重编译，常规 Recipe 主线程响应 ≤50ms，无额外 AI 请求。

### 降级回归验收（架构 §8.2）

- [x] L1 segment 无命中时显示明确降级；L4 V2 降级时全文编辑仍可用，摘要不伪造。
- [x] 旧 Prompt 快照、空变量、空 invariant 与自定义全文都保持可编辑且不会崩溃。
- [x] `pnpm verify:fast` 通过。

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/prompt-intent-controls.test.tsx src/components/workspace/__tests__/keep-change-summary.test.tsx src/components/workspace/__tests__/prompt-card.test.tsx src/components/workspace/__tests__/structured-prompt-editor.test.tsx src/components/workspace/__tests__/unified-prompt-editor.test.tsx src/components/workspace/__tests__/output-card.test.tsx
pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts --project=workspace
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.2、§6.3、§3.2 手动全文分支、§7.6 术语
- **相关代码**: `src/components/workspace/prompt-card.tsx`、`structured-prompt-editor.tsx`、`unified-prompt-editor.tsx`、`output-card.tsx`
- **契约 / 数据对象**: `PromptControlSnapshot`、`CompiledPrompt`、`AspectRatioSource`
- **下游消费方**: plan-05、plan-07

## 风险与边界

- **执行顺序**: red E2E → controls/summary → editor 接线 → ratio source → green。
- **验证失败排查方向**: editor 内部 state 与 Workspace v5 双写、dirty 标记时序、摘要定位 ref、restore source 优先级。
- **允许修改的额外文件**: `src/components/workspace/text-mode-editor.tsx`、`template-variable-panel.tsx`（仅为定位/dirty 回调所需的最小 props）。
- **暂停条件**: 需要删除现有变量/全文能力，或结构化模式必须变成可编辑才能继续。
- **E2E 不适用说明**: 不适用；本功能有用户可观察 UI。
- **风险备注**: 所有用户文案与层级遵循 DESIGN.md，不在此功能改造三栏布局。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- | --- |
| customPromptDirty 后取消切换 | pending selection 清除，原文本与 controls 不变 | done |
| Recipe 无 invariants | 摘要显示无保留规则，不伪造项 | done |
| 参考比例读取失败 | 1:1 fallback，不显示参考推荐 | done |
| 从 Iteration 恢复旧画幅 | restore 优先，参考图加载不覆盖 | done |
| 旧任务无 promptControlSnapshot | same_style/standard/text + promptSnapshot | done |
