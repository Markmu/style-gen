---
feat_id: "plan-07"
title: "Landing/Auth 与全站空态收口"
dimension: frontend
phase: 4
status: done
depends_on: ["plan-02", "plan-06"]
---

# plan-07: Landing/Auth 与全站空态收口

## 功能概要

- **目标**: 将 Landing、登录入口、Workspace 空态、Style Memory 空态和全站失败/受限状态收口到同一套 AI-first 视觉语言和状态行动路径，完成从“营销/模板页面”到“Reference -> Evidence -> Render”产品入口的迁移。
- **完成后可观察结果**: 用户首次进入首页时，第一屏就能理解 AI 会读取参考图、拆解 evidence、帮助编辑 prompt 并生成 render；上传参考图和浏览 Style Memory 是明确的第一步。未登录用户看到的登录入口与全站 shell 一致，不像另一个产品。Workspace 无参考图、无分析结果、Style Memory 空库、搜索无结果、服务失败或登录受限时，页面都保留上下文并给出继续行动，而不是空白面板或旧式错误文案。用户在首页、工作台和 Style Memory 间切换时，导航、按钮、状态点、标签和主要操作反馈保持一致。
- **依赖**: plan-02（AppShell 与 AI 状态头）、plan-06（Style Memory 模板库迁移）
- **关联验收标准**: [AC-07, AC-08, AC-09]
- **涉及架构模块**: LandingExperience、AppShell、StatePresenter/StatusLanguage、WorkspaceExperience、StyleMemoryExperience
- **前置条件**: plan-01 状态语言、plan-02 shell/nav、plan-06 Style Memory 页面可用；现有 landing upload handoff `useFileStore` 可用。
- **不在范围**: 完整移动端 step workflow、营销长页重写、账号体系新增、支付/权限系统、新后端状态页。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/page.tsx` | 首页接入 AI-first 产品入口和共享 shell |
| modify | `src/components/landing/hero.tsx` | 首屏展示 Reference -> Evidence -> Render 预览和开始创作/浏览记忆入口 |
| modify | `src/components/landing/upload-entry.tsx` | 保留 file handoff，视觉和行动文案对齐 AI-first |
| modify | `src/components/landing/value-section.tsx` | 收口为 evidence/readiness/style memory 价值说明，避免旧营销堆叠 |
| modify | `src/components/landing/bottom-cta.tsx` | 行动入口对齐开始创作/浏览 Style Memory |
| modify | `src/components/auth/auth-header.tsx` | 全站 nav/登录入口最终文案与 active 状态收口 |
| modify | `src/components/auth/login-button.tsx` | 登录按钮状态、加载和错误反馈对齐 plan-01 token |
| modify | `src/components/workspace/upload-zone.tsx` | remediation 补记：Workspace 上传空态旧三步文案收口到 Reference -> Evidence -> Render / readiness / Style Memory |
| modify | `src/components/landing/__tests__/hero.test.tsx` | 覆盖 Reference -> Evidence -> Render 和入口 |
| modify | `src/components/landing/__tests__/upload-entry.test.tsx` | 覆盖 file handoff 与按钮文案 |
| modify | `src/components/landing/__tests__/value-section.test.tsx` | 覆盖 AI-first 文案和旧文案移除 |
| modify | `src/app/__tests__/page.test.tsx` | 覆盖首页第一屏和 shell |
| create | `e2e/ai-first-landing-states.spec.ts` | Landing/Auth/global states targeted E2E |

## 实现规格

### 前端部分

#### 1. Landing first viewport

首页第一屏必须是可用产品入口，而不是单纯营销长页：

- H1/主文案围绕 `Reference -> Evidence -> Render`，解释 AI 会理解参考图、拆解风格、辅助编辑并生成。
- 主行动：上传参考图开始创作；次行动：浏览 Style Memory。
- `UploadEntry` 仍只把 File 写入 `useFileStore` 并导航 `/workspace`，不提前调用分析 API。
- 预览区域展示真实产品状态或轻量 UI 预览，避免纯装饰性渐变/抽象 SVG。
- 首屏要在常规桌面和窄屏保留下一段内容的可见提示，不遮挡按钮。

#### 2. Landing supporting sections

`value-section` / `bottom-cta` 收口为三个产品能力：

- Evidence：AI 如何读取色彩、构图、光线、质感、情绪。
- Readiness：生成前如何判断变量、风格信号和服务状态。
- Style Memory：如何复用已保存风格方向。

避免新增与本期无关的营销 promise、后端能力或账号付费文案。

#### 3. Auth/header final pass

`AuthHeader` / `LoginButton`：

- 登录入口与 AppShell visual token 一致。
- 未登录/受限状态通过 StatePresenter 或一致 copy 表达，提供登录和返回工作台。
- 导航中 `Style Memory` 与 `/workspace/templates` 保持一致 active。
- 不修改 NextAuth provider 或 session contract。

#### 4. 全站空态与错误状态收口

对 Landing、Workspace 空态、Style Memory 空态/无结果、authRequired、failedRecoverable 做 final pass：

- 每个状态说明发生了什么、保留了什么、下一步。
- Workspace failure 不清空 reference/prompt/history/template context。
- Style Memory 空态提供从工作台保存或上传参考图开始。
- 服务不可用不隐藏编辑和保存能力。

#### 5. E2E red/green

`e2e/ai-first-landing-states.spec.ts` 覆盖：

- 首页第一屏有 Reference -> Evidence -> Render 预览、上传入口、Style Memory 入口。
- 上传入口 handoff 到 `/workspace` 并触发现有 pending file 流程。
- 未登录/受限状态显示 login/back action。
- Workspace empty 和 Style Memory empty/noResults 使用统一状态语言。
- 旧主文案 `Template Library`、旧 two-pane/孤立生成文案不作为主路径出现。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 `ai-first-landing-states.spec.ts` red 用例和证据 | frontend | done | red 证据已存在：`docs/e2e/evidence/plan-07-e2e-red-20260707.md` |
| 2 | 改造 Landing hero 为 Reference -> Evidence -> Render 产品入口 | frontend | done | 保留上传和浏览 Style Memory 行动 |
| 3 | 更新 UploadEntry handoff 文案与视觉 | frontend | done | 不提前调用分析 API |
| 4 | 收口 value/bottom CTA 文案和布局 | frontend | done | 聚焦 evidence/readiness/style memory |
| 5 | 最终调整 AuthHeader/LoginButton nav 和登录反馈 | frontend | done | 不改 NextAuth contract |
| 6 | 全站空态/错误态 final pass | frontend | done | Workspace/Style Memory/Landing 使用统一状态语言 |
| 7 | 更新 landing/auth/page 组件测试 | frontend | done | 覆盖入口、handoff、旧文案移除 |
| 8 | 运行 red/green E2E、组件测试、类型检查和构建 | frontend | done | green 证据已存在：`docs/e2e/evidence/plan-07-e2e-green-20260707.md` |

## 验收标准

### Landing/Auth/状态验收

- [x] AC-07 Landing、Workspace、Style Memory、登录入口使用同一套 AI-first shell、surface、button、status 和 nav active 规则。
- [x] AC-08 未登录、服务不可用、失败、空态和无结果均保留上下文并提供可继续行动。
- [x] AC-09 首页第一屏解释 AI 如何理解参考图、拆解风格、辅助编辑并生成新结果。
- [x] AC-09 首页提供上传参考图开始创作和浏览 Style Memory 的明确入口。
- [x] AC-09 Workspace 无参考图/无分析结果和 Style Memory 空库均给出开始创作或创建第一条记忆的路径。
- [x] E2E-TDD：`e2e/ai-first-landing-states.spec.ts` 先 red 后 green，证据分别写入 `docs/e2e/evidence/plan-07-e2e-red-20260707.md` 与 `docs/e2e/evidence/plan-07-e2e-green-20260707.md`。

### 性能验收（架构 §8.1 目标）

- [x] AC-09 Landing 首屏不新增阻塞式数据请求；上传入口只做 file handoff（架构 §8.1）。

### 降级回归验收（架构 §8.2）

- [x] AC-08 L4 authRequired 和 L5 empty/noResults 在 Landing/Workspace/Style Memory 中使用统一 StatePresenter 或状态语言，不显示死空态。

## 验证命令

```bash
pnpm vitest --run src/app/__tests__/page.test.tsx src/components/landing/__tests__/hero.test.tsx src/components/landing/__tests__/upload-entry.test.tsx src/components/landing/__tests__/value-section.test.tsx
pnpm e2e -- e2e/ai-first-landing-states.spec.ts
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-07/AC-08/AC-09、§3.1、§6.1、§6.7、§7.4、§8.2。
- **相关代码**: `src/app/page.tsx`、`src/components/landing/hero.tsx`、`src/components/landing/upload-entry.tsx`、`src/components/landing/value-section.tsx`、`src/components/auth/auth-header.tsx`、`src/components/auth/login-button.tsx`。
- **契约 / 数据对象**: `useFileStore` pending file、route `/workspace`、route `/workspace/templates`、`ProductStatus`。
- **下游消费方**: plan-08 targeted E2E/visual QA 使用本功能作为全站一致性验收入口。

## 风险与边界

- **执行顺序**: 先 red E2E，再改 Landing hero/upload，再收口 auth/global states，最后测试。
- **验证失败排查方向**: 检查 `useFileStore` handoff、route 跳转、Style Memory link、旧 Template Library 文案、空态是否丢失 action。
- **允许修改的额外文件**: `src/components/workspace/upload-zone.tsx`（task-review blocker remediation：Workspace 空态 final pass 遗漏文件，需清理旧三步生成文案）。
- **暂停条件**: 若需要新增移动端 step workflow、账号体系、远程配置或营销 CMS，停止并请求确认。
- **E2E 不适用说明**: 不适用，本功能为首页和全站状态用户可见体验。
- **风险备注**: Landing 可以更强表达产品能力，但不能引入架构未承诺的新后端能力或像素级复刻要求。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 首次进入首页 | 展示 Reference -> Evidence -> Render 和两个清晰行动 | done |
| 上传后跳转工作台 | `useFileStore` handoff，Workspace 消费 pending file | done |
| 用户未登录 | 显示 login/back action，不清空 workspace context | done |
| Style Memory 空库 | 提供从工作台保存或上传参考图开始 | done |
| 窄屏首屏 | 文案和按钮不重叠，下一段内容有可见提示 | done |
