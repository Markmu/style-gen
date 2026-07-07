---
feat_id: "plan-08"
title: "第 12 期 Targeted E2E 与视觉 QA"
dimension: frontend
phase: 4
status: done
depends_on: ["plan-05", "plan-06", "plan-07"]
---

# plan-08: 第 12 期 Targeted E2E 与视觉 QA

## 功能概要

- **目标**: 建立第 12 期最终验收门：targeted E2E、视觉回归、旧体系残留扫描和 AC-01..AC-09 覆盖证据，避免用完整 legacy `pnpm e2e` 作为唯一验收口径。
- **完成后可观察结果**: 开发者可以运行一组明确的第 12 期 targeted Playwright specs，验证 Landing、Workspace、Render Dock、Iteration Memory、Style Memory、Auth/empty/error states 的 AI-first 体验是否完整。视觉 QA 会在桌面和窄屏关键视口检查全站 shell、三栏层级、状态提示和卡片不重叠、不空白、不退回旧 Template Library/two-pane/floating generate 体系。README 和各 plan 的 red/green 证据路径会被填充，AC-01..AC-09 每条都有可追踪的测试或检查项。旧 09/10/11 期过时断言会被迁移、隔离或标注，不再干扰第 12 期验收判断。
- **依赖**: plan-05（Iteration Memory 与保存记忆入口）、plan-06（Style Memory 模板库迁移）、plan-07（Landing/Auth 与全站空态收口）
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
- **涉及架构模块**: DesignTokenLayer、AppShell、LandingExperience、WorkspaceExperience、StyleMemoryExperience、StatePresenter/StatusLanguage
- **前置条件**: plan-01 到 plan-07 均已进入 review 或具备 green 证据；targeted specs 已逐步创建。
- **不在范围**: 新建视觉测试服务、引入大型截图 SaaS、修复与第 12 期无关的 legacy 历史缺陷、把全量 `pnpm e2e` 作为唯一发布门。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md` | 该文件由 plan-01 创建；plan-08 只回填第 12 期 AC、targeted specs、red/green 证据和视觉 QA checklist |
| modify | `e2e/helpers/mock-api.ts` | 补齐 AI-first targeted specs 所需 mock：analysis/generation/templates/auth/degradation |
| modify | `e2e/helpers/workspace-actions.ts` | 统一上传、分析完成、生成完成、history restore 等 helper |
| modify | `e2e/precision-glass-home.spec.ts` | 迁移首页旧断言到 AI-first 文案或标注被新 spec 覆盖 |
| modify | `e2e/precision-glass-shell.spec.ts` | 迁移 shell/nav 断言到 Style Memory/AppShell 语义 |
| modify | `e2e/template.spec.ts` | 迁移 Template Library 旧主文案断言到 Style Memory 语义，API 命名保持 template |
| modify | `e2e/workspace-two-pane.spec.ts` | 移除或隔离旧 two-pane 主体验断言，避免与第 12 期目标冲突 |
| create | `e2e/ai-first-visual-regression.spec.ts` | 桌面/窄屏关键页面截图与布局断言 |
| modify | `docs/12-全站AI优先界面风格复刻/12-2-实现计划-全站AI优先界面风格复刻/README.md` | 回填最终 targeted E2E/视觉 QA 证据路径和状态机 |

## 实现规格

### 前端部分

#### 1. Targeted E2E 总门

最终验收命令固定为：

```bash
pnpm e2e -- e2e/ai-first-design-system.spec.ts e2e/ai-first-shell.spec.ts e2e/workspace-ai-first-evidence.spec.ts e2e/workspace-ai-first-render-dock.spec.ts e2e/workspace-ai-first-iteration-memory.spec.ts e2e/ai-first-style-memory.spec.ts e2e/ai-first-landing-states.spec.ts e2e/ai-first-visual-regression.spec.ts
```

要求：

- `docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md` 已由 plan-01 创建；本 plan 只负责回填最终证据和视觉 QA checklist。
- 每个 spec 均具备 red 证据和 green 证据。
- 每条 AC-01..AC-09 至少被一个 targeted spec 或视觉 QA checklist 覆盖。
- specs 复用现有 `mock-api.ts`、`workspace-actions.ts`，避免每个 spec 复制 mock。

#### 2. 视觉 QA spec

创建 `e2e/ai-first-visual-regression.spec.ts`：

- 视口：桌面 1440x900、常规宽屏 1280x800、窄屏 390x844。
- 页面：`/`、`/workspace` idle、`/workspace` analysis_ready、`/workspace` generation failed、`/workspace/templates` populated、empty、noResults、authRequired。
- 断言：主 UI 非空、关键 data-testid 可见、文本不重叠、按钮文本不溢出、Render Dock 不遮挡 Prompt、StatePresenter action 可见、Style Memory 卡片不退回旧文件列表。
- 可使用 Playwright screenshot 作为人工 review 附件；若 repo 未配置 snapshot baseline，先用布局/像素非空/元素几何断言，不强行引入新截图基建。

#### 3. Legacy spec 迁移/隔离

对旧 specs 做最小处理：

- `precision-glass-home.spec.ts`、`precision-glass-shell.spec.ts`、`template.spec.ts` 更新用户可见文案到 AI-first / Style Memory。
- `workspace-two-pane.spec.ts` 若仍断言旧主布局，应迁移为“旧 two-pane 不应作为主体验出现”的兼容检查，或标注由第 12 期 targeted specs 替代。
- 不删除历史 E2E 文件，除非 task-review 明确同意；优先减少对旧文案/旧布局的误报。

#### 4. 旧体系残留扫描

增加手动检查命令并记录结果：

```bash
rg -n "Template Library|workspace-two-pane-layout|floating-generate-window|Ready to Generate|GenerateHistoryBar|No templates yet" src e2e docs/e2e
```

允许残留范围：

- API/hook/repository 命名中的 `template`。
- 历史 spec 备注中说明旧用例迁移。
- 不允许作为主 UI 文案、主路由导航、主工作台组件或第 12 期 targeted specs 的预期结果。

#### 5. Evidence 回填

更新 README `## 5. 开发状态机` 和 `docs/e2e/12-e2e-用例...`：

- red/green evidence paths 指向实际文件。
- 若某 legacy spec 因旧断言仍失败，记录为非第 12 期 targeted gate，并说明迁移计划。
- 若第 12 期 targeted spec 失败，不得把计划推进 review。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `ai-first-visual-regression.spec.ts` red 用例和证据 | frontend | done | 证据已写入 `docs/e2e/evidence/plan-08-e2e-red-20260707.md` |
| 2 | 汇总/补齐 `docs/e2e/12-e2e-用例...` AC 覆盖矩阵 | frontend | done | AC-01..AC-09 已在用例文档 plan-08 覆盖矩阵与 green evidence 中追踪 |
| 3 | 整理 mock-api 和 workspace-actions helper | frontend | done | `workspace-actions` 已迁移到 AI-first 三栏/status/render dock 主路径；`mock-api` 已具备 targeted specs 复用能力 |
| 4 | 迁移 home/shell/template legacy 文案断言 | frontend | done | 指定 legacy specs 已迁移到 AI-first / Style Memory 语义，template API 命名保持 |
| 5 | 迁移或隔离 two-pane/floating-generate 旧断言 | frontend | done | `workspace-two-pane.spec.ts` 已改为 Phase 12 三栏兼容检查；未纳入清单的 legacy specs 在 green evidence 中标注为非 targeted gate |
| 6 | 运行旧体系残留扫描并记录结果 | frontend | done | `rg` 命中 106 行，已在 green evidence 分类记录允许/非 targeted/保留源码范围 |
| 7 | 运行第 12 期 targeted E2E bundle 和视觉 QA | frontend | done | targeted bundle 47 passed；visual spec 5 passed |
| 8 | 回填 README 状态机和证据路径 | frontend | waived | 用户规则要求 README `## 5. 开发状态机` 只能由主 agent 维护；本实现仅回填用例文档与 `docs/e2e/evidence/plan-08-e2e-green-20260707.md` |

## 验收标准

### Targeted E2E 验收

- [x] AC-01 第 12 期 E2E 总用例文档覆盖 design token/status 基线。
- [x] AC-02 targeted specs 覆盖 Workspace shell、AI 状态头、Reference Canvas、Style Intelligence、Prompt + Render、Recent iterations。
- [x] AC-03 targeted specs 覆盖 evidence facet、reference anchor、prompt provenance。
- [x] AC-04 targeted specs 覆盖 Render Dock readiness、disabled reason、service unavailable、busy state。
- [x] AC-05 targeted specs 覆盖 generation complete、history detail、restore、save Style Memory。
- [x] AC-06 targeted specs 覆盖 Style Memory populated、empty、noResults、auth/API error、Use/Duplicate/Delete。
- [x] AC-07 visual QA 覆盖 Landing、Workspace、Style Memory、Auth 的一致壳层、导航和状态语言。
- [x] AC-08 targeted specs 覆盖分析失败、生成失败、未登录、服务不可用、空态上下文保留。
- [x] AC-09 targeted specs 覆盖 Landing first step、Workspace empty、Style Memory empty 的开始入口。
- [x] E2E-TDD：`e2e/ai-first-visual-regression.spec.ts` 和第 12 期 targeted bundle 先 red 后 green，证据分别写入 `docs/e2e/evidence/plan-08-e2e-red-20260707.md` 与 `docs/e2e/evidence/plan-08-e2e-green-20260707.md`。

### 视觉 QA 验收

- [x] 1440x900、1280x800、390x844 下关键页面非空、关键元素不重叠、按钮文字不溢出。
- [x] Workspace 三栏、Render Dock、HistoryStrip、StatePresenter、Style Memory 卡片在截图/几何断言中可见且不遮挡。
- [x] 旧主文案 `Template Library`、旧 two-pane 主布局、旧 floating generate 主入口不再作为第 12 期主体验出现。

### 性能验收（架构 §8.1 目标）

- [x] 第 12 期 targeted specs 未发现新增阻塞式数据请求；readiness 和 evidence 派生无网络请求。

### 可观测性验收（架构 §8.5）

- [x] 关键 UI 状态具备稳定 `data-testid` 或 aria label：workspace layout、reference-card、recipe-card、prompt-card、output-card、history-strip、state-presenter、style-memory card。

## 验证命令

```bash
pnpm e2e -- e2e/ai-first-design-system.spec.ts e2e/ai-first-shell.spec.ts e2e/workspace-ai-first-evidence.spec.ts e2e/workspace-ai-first-render-dock.spec.ts e2e/workspace-ai-first-iteration-memory.spec.ts e2e/ai-first-style-memory.spec.ts e2e/ai-first-landing-states.spec.ts e2e/ai-first-visual-regression.spec.ts
rg -n "Template Library|workspace-two-pane-layout|floating-generate-window|Ready to Generate|GenerateHistoryBar|No templates yet" src e2e docs/e2e
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-01..AC-09、§8.1、§8.2、§8.5、§9 Phase D。
- **相关代码**: `e2e/` targeted specs、`e2e/helpers/mock-api.ts`、`e2e/helpers/workspace-actions.ts`、`docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md`、本实现计划 README。
- **契约 / 数据对象**: Playwright targeted E2E bundle、red/green evidence docs、AC traceability matrix、data-testid/aria labels。
- **下游消费方**: task-review、release-readiness、后续 legacy E2E 迁移工作。

## 风险与边界

- **执行顺序**: 先创建 visual regression red，用 targeted specs 补齐 mock/helper，再迁移 legacy 文案断言，最后跑完整 targeted bundle。
- **验证失败排查方向**: 优先检查 mock API、旧文案断言、viewport 几何、StatePresenter data-testid、未登录状态 mock。
- **允许修改的额外文件**: `src/components/workspace/prompt-card.tsx`（修复 plan-08 red evidence 中 `unified-prompt-editor` 溢出到 Render Dock 的真实布局约束）；`src/components/workspace/unified-prompt-editor.tsx`、`src/components/workspace/text-mode-editor.tsx`、`src/components/workspace/template-mode-editor.tsx`（让编辑器及其 textarea 在 compact 模式遵守父容器高度，避免几何重叠）；`src/components/workspace/output-card.tsx`（压缩 Render Dock readiness 布局，避免 dock 高度遮挡 Prompt）；`src/components/workspace/template-card.tsx`（为 Style Memory 卡片补稳定 `data-testid="style-memory-card"` 与 source 标记，满足最终视觉 QA 可观测性）；`src/components/workspace/left-sidebar.tsx`（为 Generate/Style Memory 导航文字补稳定文本容器，修复 plan-08 visual QA 按钮文字溢出）；`src/components/workspace/__tests__/generate-panel.test.tsx`（补 localStorage 清理，保证 plan-08 必跑 `pnpm test` 的 legacy 单测隔离）。
- **暂停条件**: 若必须把完整 legacy `pnpm e2e` 当唯一验收门、引入外部视觉回归 SaaS 或大规模删除历史 specs，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能就是第 12 期 E2E/视觉验收门。
- **风险备注**: legacy specs 的历史价值仍保留；第 12 期验收以 targeted bundle 为准，旧套件迁移失败需单独记录，不应掩盖本期 AC 结果。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| targeted spec 失败 | 不推进 review，记录失败截图和修复 owner；当前 targeted bundle 47 passed | done |
| legacy spec 仍旧断言旧布局 | 指定 legacy 文件已迁移或隔离；未纳入本 plan 的旧 specs 在 green evidence 中说明不是第 12 期 gate | done |
| 视觉 QA 无截图基线 | 使用几何/非空/重叠断言和 Playwright failure artifact；未新增截图基建 | done |
| 旧文案扫描命中 API 命名 | 已在 green evidence 标注允许范围、非 targeted legacy specs 和保留源码范围，不要求重命名 API | done |
| 窄屏布局拥挤 | visual QA 覆盖 390x844 不破版；完整 mobile step flow 不纳入本期 | done |
