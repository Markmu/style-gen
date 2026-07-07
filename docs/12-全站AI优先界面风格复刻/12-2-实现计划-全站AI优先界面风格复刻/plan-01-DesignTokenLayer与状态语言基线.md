---
feat_id: "plan-01"
title: "DesignTokenLayer 与状态语言基线"
dimension: frontend
phase: 1
status: done
depends_on: []
---

# plan-01: DesignTokenLayer 与状态语言基线

## 功能概要

- **目标**: 在 `DESIGN.md`、`globals.css`、状态 copy 和 StatePresenter 中冻结第 12 期 AI-first Evidence Workbench 的视觉与状态语言基线，供后续页面只消费共享 token 和统一状态契约。
- **完成后可观察结果**: 团队打开设计规范时，可以找到 evidence facet、readiness、Render Dock、Style Memory 卡片、状态语言三段式和禁止旧体系残留的规则。运行应用后，关键 UI 可以通过统一 CSS custom properties 渲染 AI evidence、readiness、status 和 style memory 语义。失败、排队、未登录、空态和服务受限提示都以同一种 StatePresenter 结构呈现，文案说明发生了什么、保留了什么、下一步做什么。后续 Workspace、Style Memory、Landing 不需要各自复制状态文案或硬编码旧色板。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-07, AC-08]
- **涉及架构模块**: DesignTokenLayer、StatePresenter/StatusLanguage
- **前置条件**: 现有 `docs/design/DESIGN.md`、`src/app/globals.css`、`src/lib/ui/status-copy.ts`、`src/components/ui/state-presenter.tsx` 可读；不得修改后端 API 或数据层。
- **不在范围**: 具体页面重排、Workspace evidence 交互、Render Dock 生成逻辑、Style Memory 列表迁移、真实埋点系统。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `docs/design/DESIGN.md` | 补齐 AI-first Evidence Workbench 视觉规则和禁用旧体系说明 |
| modify | `src/app/globals.css` | 扩展 evidence/readiness/style-memory/status token 与共享 utility class |
| modify | `src/lib/ui/status-copy.ts` | 更新 ProductStatus copy，覆盖排队、服务受限、可恢复失败、Style Memory 空态/无结果/未登录 |
| modify | `src/components/ui/state-presenter.tsx` | 补齐 tone、compact/full variant、行动按钮、aria-live 和 data-testid 支撑 |
| modify | `src/lib/ui/__tests__/status-copy.test.ts` | 覆盖状态文案、override 和服务受限/Style Memory 语义 |
| modify | `src/components/ui/__tests__/state-presenter.test.tsx` | 覆盖可访问性、按钮回调、compact/full 和 tone 渲染 |
| create | `e2e/ai-first-design-system.spec.ts` | 第 12 期 token/status smoke E2E，先 red 后 green |
| create | `docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md` | 第 12 期 targeted E2E 用例总入口，后续 plan 增量补充 |

## 实现规格

### 前端部分

#### 1. 设计规范增补

在 `docs/design/DESIGN.md` 增加第 12 期 AI-first 附录，内容只定义可执行 UI 规则，不改动产品范围：

- Evidence facet：色彩、构图、光线、质感、情绪、主体的 tone、chip、confidence、reference anchor 和 prompt provenance 使用规则。
- Render Dock：readiness list、参数控件、不可生成原因、服务受限、busy state、保存 Style Memory 的布局规则。
- Style Memory 卡片：来源图优先、变量数量、派生 tags/reuse intent、空态/无预览状态的表达规则。
- 状态语言：采用“发生了什么 + 保留了什么 + 下一步”三段式，覆盖 L1-L5 降级。
- 旧体系禁用：硬分割线、孤立 SVG 文本按钮、无解释禁用态、旧 Template Library 文案、旧 two-pane 视觉残留在 Phase D 前必须清理。

#### 2. CSS token 与 utility class

在 `src/app/globals.css` 保持现有 Precision Glass token 兼容，并补齐以下语义 token：

- `--evidence-color-*`、`--evidence-composition-*`、`--evidence-lighting-*`、`--evidence-texture-*`、`--evidence-mood-*`、`--evidence-neutral-*`。
- `--readiness-ready-*`、`--readiness-waiting-*`、`--readiness-blocked-*`、`--readiness-processing-*`。
- `--style-memory-*`、`--status-*` 和 `--surface-evidence-*`，避免页面直接写一次性颜色。
- 共享 class 建议收敛为 `.evidence-chip`、`.readiness-row`、`.style-memory-card`、`.status-tone-dot`、`.ai-panel`，并继续兼容 `.surface-panel`、`.btn-primary`、`.btn-secondary`、`.input-precision`。

不得引入 token build pipeline 或大型 UI 框架；全部通过 CSS variables 与 Tailwind 4 class 组合落地。

#### 3. 状态 copy 契约

更新 `src/lib/ui/status-copy.ts`，保留现有 `ProductStatus` 枚举可用性，同时让 copy 覆盖架构 §7.4 的状态映射：

- `empty`: 可根据页面 override 表达 Workspace 空态、Style Memory 空态、Landing first step。
- `queued`: 明确等待超过 60s 时当前 reference/prompt 被保留，可返回编辑。
- `processing`: 描述 AI 正在读取或生成什么，避免只写 Loading。
- `failedRecoverable`: 用于分析失败、生成失败、模板 API 失败和服务暂不可用 override。
- `authRequired`: 明确登录后继续，且工作台上下文保留。
- `noResults`: 提供清除搜索和返回工作台行动。

若确需新增 `serviceUnavailable` 状态，必须先确认不会扩大后端 contract；默认优先用 `failedRecoverable` + override 表达 L2 服务不可用。

#### 4. StatePresenter 组件契约

`StatePresenter` 保持轻量 API，不做页面业务判断：

- 支持 `compact` 与 full variant，动作按钮最多 2 个。
- `aria-live`: `failedRecoverable` 使用 `assertive`，其他状态使用 `polite`。
- tone dot 使用状态 token，不直接写旧色值。
- 允许传入 override copy，但默认 copy 必须已经可用。
- 输出稳定 `data-status` 和 `data-testid="state-presenter-tone"`，供 E2E 和组件测试验证。

#### 5. E2E 用例总入口

创建 `docs/e2e/12-e2e-用例-全站AI优先界面风格复刻.md`，先写 AC-01/AC-08 基线用例，并为后续 plan 保留分节：

- `TC-1.x` Design token/status smoke。
- `TC-2.x` AppShell/Workspace。
- `TC-3.x` Evidence/Render。
- `TC-4.x` Style Memory。
- `TC-5.x` Landing/global states。

同时创建 `e2e/ai-first-design-system.spec.ts`，red 阶段应先断言新增 token/status copy 或 StatePresenter 场景不存在而失败，green 阶段通过。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 创建第 12 期 E2E 用例总入口和 `ai-first-design-system.spec.ts` red 用例 | frontend | done | 写入 red 证据 `docs/e2e/evidence/plan-01-e2e-red-20260705.md` |
| 2 | 增补 `DESIGN.md` AI-first Evidence Workbench 规则 | frontend | done | 覆盖 evidence/readiness/style-memory/status/旧体系禁用 |
| 3 | 扩展 `globals.css` token 与共享 class | frontend | done | 保持现有 Precision Glass token 向后兼容 |
| 4 | 更新 `status-copy.ts` 状态文案和 override 契约 | frontend | done | 覆盖 L1-L5 降级和 Style Memory 状态 |
| 5 | 更新 `StatePresenter` variant、aria-live、tone 和行动按钮行为 | frontend | done | 不引入页面业务逻辑 |
| 6 | 更新 status-copy 与 StatePresenter 单元测试 | frontend | done | 覆盖默认 copy、override、compact/full、按钮回调 |
| 7 | 运行 red/green E2E、单元测试、类型检查和构建 | frontend | done | 写入 green 证据 `docs/e2e/evidence/plan-01-e2e-green-20260705.md` |

## 验收标准

### 设计契约验收

- [x] AC-01 `docs/design/DESIGN.md` 可定位第 12 期 AI evidence、readiness、Render Dock、Style Memory、状态语言和控件反馈规则。
- [x] AC-01 `src/app/globals.css` 提供 evidence/readiness/style-memory/status 语义 token，后续页面无需硬编码一次性颜色。
- [x] AC-07 共享 token 不破坏现有 `.surface-panel`、`.btn-primary`、`.btn-secondary`、`.input-precision` 使用。
- [x] AC-08 `getStatusCopy` 默认 copy 和 override 能表达 queued、failedRecoverable、authRequired、noResults、Style Memory empty、service unavailable 等状态。
- [x] AC-08 `StatePresenter` 对失败态使用 `aria-live="assertive"`，其他状态使用 `polite`，并提供至少一个可继续行动。
- [x] E2E-TDD：`e2e/ai-first-design-system.spec.ts` 先 red 后 green，证据分别写入 `docs/e2e/evidence/plan-01-e2e-red-20260705.md` 与 `docs/e2e/evidence/plan-01-e2e-green-20260705.md`。

### 性能验收（架构 §8.1 目标）

- [x] AC-01 token/status 变更不引入新的阻塞式数据请求；Workspace 无 reference 时仍可直接渲染空态（架构 §8.1）。

### 降级回归验收（架构 §8.2）

- [x] AC-08 L1-L5 降级 copy 均能通过 StatePresenter 或页面 override 表达，不出现只有错误码、只有 `sr-only` 或空白面板的状态。

## 验证命令

```bash
pnpm vitest --run src/lib/ui/__tests__/status-copy.test.ts src/components/ui/__tests__/state-presenter.test.tsx
pnpm e2e -- e2e/ai-first-design-system.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.1、§2.4 AC-01/AC-07/AC-08、§4.2 DesignTokenLayer、§6.7、§7.4、§8.1、§8.2。
- **相关代码**: `docs/design/DESIGN.md`、`src/app/globals.css`、`src/lib/ui/status-copy.ts`、`src/components/ui/state-presenter.tsx`。
- **契约 / 数据对象**: `ProductStatus`、`StatusCopy`、`StatusTone`、StatePresenter props、CSS custom properties。
- **下游消费方**: plan-02 AppShell、plan-03 Workspace、plan-04 Render Dock、plan-06 Style Memory、plan-07 Landing/Auth。

## 风险与边界

- **执行顺序**: 先写 red E2E/组件测试，再改设计规范和 token，最后改状态 copy 与 StatePresenter。
- **验证失败排查方向**: 优先检查 CSS variable 命名、StatePresenter aria-live、默认 copy 是否被 override 覆盖、旧 token 是否仍兼容。
- **允许修改的额外文件**: 无。若发现需要新增 UI helper 文件，先在 plan-01 review 中说明，不要顺手扩大范围。
- **暂停条件**: 若必须新增后端状态码、远程埋点、token build pipeline 或大型 UI 框架，停止并请求用户确认。
- **E2E 不适用说明**: 不适用，本功能通过状态组件和页面 smoke 具备用户可观察行为。
- **风险备注**: `DESIGN.md` 是设计 source of truth，修改时只补第 12 期规则，不重写整份设计系统，避免影响并行 UI 工作。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 页面传入未知 override 文案 | `getStatusCopy` 保留基础 status/tone，仅覆盖定义字段 | done |
| 无 primary action 的状态 | StatePresenter 仍显示说明，不渲染空按钮容器 | done |
| failedRecoverable 无回调 | 按钮可渲染但不清空上下文，由页面决定行为 | done |
| CSS token 缺失 | E2E smoke 检查关键 token computed style，失败则阻止后续 plan | done |
| 窄屏状态文案较长 | StatePresenter 自动换行，按钮 wrap，不遮挡后续内容 | done |
