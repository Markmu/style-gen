---
feat_id: "FEAT-05"
title: "模板库资产浏览体验"
dimension: frontend
phase: 3
status: ready-to-dev
depends_on: ["FEAT-01", "FEAT-02", "FEAT-04"]
---

# FEAT-05: 模板库资产浏览体验

## 功能概要

- **目标**: 将模板库重绘为轻量资产浏览空间，统一搜索、卡片、空态、错误态、Use Template、复制/删除浮层和回到工作台的使用流程。
- **完成后可观察结果**: 用户进入模板库后可以快速浏览和比较模板；搜索无结果有清晰恢复入口；卡片 hover/focus 显示 Use Template 和更多操作；使用模板后回到工作台并看到模板内容进入可继续编辑的位置。
- **依赖**: FEAT-01, FEAT-02, FEAT-04
- **关联验收标准**: [AC-02, AC-03, AC-05, AC-06, AC-07, AC-08]
- **涉及架构模块**: TemplateLibraryExperience, WorkspaceExperience, StatePresenter
- **前置条件**: FEAT-04 已统一工作台模板加载和失败提示。
- **不在范围**: 新增模板 API、改动模板 schema、自动生成模板预览图、移动端资产库专项适配。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/templates/page.tsx` | 模板库页面壳层、搜索、加载、空态、错误态和 grid 重绘 |
| modify | `src/components/workspace/template-card.tsx` | 卡片表面、hover/focus、Use Template、overflow menu、删除确认统一 |
| modify | `src/components/workspace/template-save-dialog.tsx` | 保存模板浮层轻质化，与模板库卡片口径一致 |
| modify | `src/components/workspace/template-wizard.tsx` | 变量向导状态和按钮统一 |
| modify | `src/hooks/use-template-search.ts` | 如需要，仅补充搜索状态暴露，不改变 API 语义 |
| modify | `src/components/workspace/__tests__/template-card.test.tsx` | 若不存在则创建，覆盖卡片 hover/action 状态 |
| create | `e2e/precision-glass-templates.spec.ts` | 模板库浏览、空结果、Use Template、失败恢复 E2E |

## 实现规格

### 前端部分

#### 1. 模板库页面

- 页面复用 FEAT-02 工作区壳层，Library 高亮。
- 搜索区使用 `input-precision`，清空按钮为图标按钮，有 accessible label。
- 加载态使用轻量 skeleton，不使用深色块。
- 空结果状态使用 StatePresenter，提供清空搜索和返回工作台。
- 错误态只影响模板列表区域，提供重试，不阻断导航。

#### 2. 模板卡片

- 卡片密度适合资产浏览，边界轻，预览区域统一 media lens。
- hover/focus 显示 Use Template 和 overflow menu；键盘 focus 也能触达主要操作。
- 复制/删除 processing 状态明确；删除确认浮层使用轻质 floating。
- 模板变量 chip 使用 Precision Chips。

#### 3. Use Template 回到工作台

- 点击 Use Template 后继续使用 `/workspace?templateId=:id`，不改 URL contract。
- 工作台加载模板失败时保留当前内容，并展示可恢复入口。
- 含变量模板继续打开 `TemplateWizard`，无变量模板写入 Prompt。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写模板库 E2E red spec | frontend | todo | 浏览、搜索空态、Use Template、失败恢复 |
| 2 | 重绘模板库页面壳层和搜索区 | frontend | todo | 轻质资产浏览空间 |
| 3 | 重绘加载、空态、错误态 | frontend | todo | 消费 StatePresenter |
| 4 | 重绘 TemplateCard 和 overflow menu | frontend | todo | hover/focus/processing/error |
| 5 | 重绘保存模板浮层和变量向导 | frontend | todo | 与模板库浮层口径一致 |
| 6 | 更新或创建模板卡片组件测试 | frontend | todo | 覆盖 Use Template、菜单、复制/删除状态 |
| 7 | 跑通模板库 E2E green | frontend | todo | 1280px / 1440px 验证 |
| 8 | 运行类型检查和构建 | frontend | todo | 保证模板库可构建 |

## 验收标准

### 前端验收

- [ ] AC-02 模板库导航、表面层级、卡片质感、图片承载和文字层级与首页/工作台一致。
- [ ] AC-03 搜索框、清空按钮、模板卡片、Use Template、overflow menu、删除确认均有清晰状态。
- [ ] AC-05 模板库以资产浏览方式呈现，支持搜索和卡片比较。
- [ ] AC-05 空结果有清晰提示，并提供清空搜索或返回工作台。
- [ ] AC-05 Use Template 后回到工作台，并能看到模板内容进入可继续编辑位置。
- [ ] AC-06 模板搜索失败、模板加载失败只影响当前区域，保留上下文并提供恢复入口。
- [ ] AC-07 1280px / 1440px 下模板搜索、grid、卡片操作区域稳定。
- [ ] AC-08 无模板、搜索无结果、加载、错误、处理中、删除确认文案统一可行动。
- [ ] E2E-TDD：`e2e/precision-glass-templates.spec.ts` 先 red 后 green。
- [ ] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-05-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-05-e2e-green-{date}.md`。

### 性能验收

- [ ] 搜索仍使用既有 debounce 和 React Query，不新增高频请求。
- [ ] 模板卡片 grid 不一次性引入重型图片处理或动画依赖。

### 降级回归验收

- [ ] 模板搜索失败显示重试，不影响导航和回到工作台。
- [ ] 模板加载失败不清空工作台当前 Prompt、参考图或历史恢复状态。
- [ ] 删除/复制失败在卡片或浮层内反馈，不造成整页失败。

## 验证命令

```bash
pnpm e2e -- e2e/precision-glass-templates.spec.ts
pnpm vitest --run src/components/workspace/__tests__/template-card.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-05/AC-06/AC-07/AC-08、§6.3、§8.2
- **相关代码**: `src/app/workspace/templates/page.tsx`、`src/components/workspace/template-card.tsx`、`src/components/workspace/template-save-dialog.tsx`、`src/components/workspace/template-wizard.tsx`、`src/hooks/use-template-search.ts`
- **契约 / 数据对象**: `TemplateListState`、`ProductStatus`、`StatusCopy`
- **下游消费方**: 无；本功能承接模板浮层、保存模板弹窗和变量向导的视觉统一，完成后进入 dev-plan-check / auto-dev 后续验收链路。

## 风险与边界

- **执行顺序**: 先 E2E red，再模板库页面，再卡片和浮层，最后测试。
- **验证失败排查方向**: 检查模板 API mock、search debounce、router push 到 `/workspace?templateId=`、TemplateWizard 文案。
- **允许修改的额外文件**: `e2e/helpers/mock-api.ts`，仅限模板列表/详情 mock。
- **暂停条件**: 如果 Use Template 需要改变 URL contract 或模板 API 响应结构，暂停并报告。
- **E2E 不适用说明**: 不适用；本功能必须有模板库用户流程 E2E。
- **风险备注**: 模板库真实数据依赖登录和 DB，E2E 应优先使用 mock，真实链路作为补充。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 搜索无结果 | StatePresenter 显示清空搜索和返回工作台 | todo |
| 模板列表加载失败 | 列表区域错误 + 重试，不阻断页面 | todo |
| Use Template 详情加载失败 | 工作台保留当前内容并提示可重试/重新选择 | todo |
| 卡片 hover 不可用于键盘 | focus-visible 同样展示主要操作入口 | todo |
| 删除确认误触 | 使用 alertdialog，取消和确认状态清晰 | todo |
