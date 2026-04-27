---
feat_id: "FEAT-03"
title: "首页 Precision Glass 体验"
dimension: frontend
phase: 3
status: review
depends_on: ["FEAT-01", "FEAT-02"]
---

# FEAT-03: 首页 Precision Glass 体验

## 功能概要

- **目标**: 重绘首页首屏、产品预览、上传入口、价值区和底部 CTA，让用户第一屏就能理解产品价值并开始创作。
- **完成后可观察结果**: 首页首屏同时呈现产品价值、主行动、真实产品对象预览和上传入口；上传错误在上传区内恢复；页面不再像长说明营销页，而是快速进入 Reference -> Recipe -> Render 的创作入口。
- **依赖**: FEAT-01, FEAT-02
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-06, AC-07, AC-08]
- **涉及架构模块**: LandingExperience, DesignTokenLayer, StatePresenter
- **前置条件**: FEAT-01 token 可用，FEAT-02 header 入口可用。
- **不在范围**: 新增营销长页、改变上传业务流程、移动端专项适配。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/page.tsx` | 调整首页结构和首屏节奏 |
| modify | `src/components/landing/hero.tsx` | 重绘 Hero、主行动、产品预览 |
| modify | `src/components/landing/upload-entry.tsx` | 上传入口玻璃化、错误/校验/登录状态统一 |
| modify | `src/components/landing/value-section.tsx` | 价值区轻量化，避免卡片堆叠过重 |
| modify | `src/components/landing/stats-section.tsx` | 状态/能力预览统一表面层级 |
| modify | `src/components/landing/bottom-cta.tsx` | 底部 CTA 与主行动语气一致 |
| modify | `src/components/landing/footer.tsx` | 底部信息轻量化 |
| modify | `src/components/landing/__tests__/hero.test.tsx` | 更新首屏关键内容断言 |
| modify | `src/components/landing/__tests__/upload-entry.test.tsx` | 覆盖上传错误和登录状态文案 |
| create | `e2e/precision-glass-home.spec.ts` | 首页首屏、上传入口、宽屏布局、状态反馈 E2E |

## 实现规格

### 前端部分

#### 1. 首页首屏

- Hero H1 表达产品核心能力，而不是泛营销话术。
- 首屏包含主行动按钮、模板入口或次行动、产品视觉预览和上传入口。
- 产品预览必须体现 Reference / Recipe / Render 的真实对象，不使用纯装饰渐变替代。
- 首屏底部在常规宽屏下露出下一段内容提示，避免首屏变成封闭海报。

#### 2. 上传入口

- 保留点击、拖放、文件类型/大小校验、登录判断和 `useFileStore` 跳转逻辑。
- default / hover / dragover / validating / uploading / error 状态接入 FEAT-01 共享状态。
- 上传失败、校验失败、未登录限制在上传区域内说明原因和恢复动作。

#### 3. 价值区与状态预览

- 价值区减少厚重卡片堆叠，使用留白、轻表面和功能意图表达。
- 状态预览文案使用 `StatusCopy` 口径，覆盖分析中、生成中、失败可恢复。
- Bottom CTA 与 Hero 主行动保持同一语气，不新增复杂说明。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写首页 E2E red spec | frontend | done | 断言首屏价值、预览、上传入口和 Precision Glass 关键 token |
| 2 | 重绘 Hero 和产品预览 | frontend | done | 保留进入工作台和模板库入口 |
| 3 | 重绘 UploadEntry 状态 | frontend | done | 覆盖拖放、校验、登录、错误恢复 |
| 4 | 重绘价值区、状态预览、底部 CTA、Footer | frontend | done | 降低卡片噪音，统一文案 |
| 5 | 更新 landing 组件测试 | frontend | done | 文案、按钮、上传错误、登录状态 |
| 6 | 跑通首页 E2E green | frontend | done | 1280px 和 1440px 验证 |
| 7 | 运行类型检查和构建 | frontend | done | 保证首页可构建 |

## 验收标准

### 前端验收

- [ ] AC-01 首页首屏能看到产品价值、主行动、产品视觉预览和上传入口。
- [ ] AC-01 首页视觉符合 Precision Glass，不依赖复杂说明或多重按钮撑场。
- [ ] AC-02 首页导航、表面层级、图片承载和按钮反馈与工作台/模板库同源。
- [ ] AC-03 上传区和 CTA 具备 default / hover / pressed / focus-visible / processing / error 状态。
- [ ] AC-06 上传失败或校验失败保留上下文，并在上传区提供重新选择入口。
- [ ] AC-07 1280px / 1440px 下首屏主次比例稳定，无横向溢出。
- [ ] AC-08 首页空态、错误、上传中和登录限制文案简洁可行动。
- [ ] E2E-TDD：`e2e/precision-glass-home.spec.ts` 先 red 后 green。
- [ ] E2E 证据：red / green 结果分别记录到 `docs/e2e/evidence/FEAT-03-e2e-red-{date}.md` 和 `docs/e2e/evidence/FEAT-03-e2e-green-{date}.md`。

### 性能验收

- [ ] 首页主要行动和上传入口不因装饰资源阻塞。
- [ ] 不引入远程装饰图作为关键渲染阻塞资源。

### 降级回归验收

- [ ] 未登录上传仍触发既有登录流程或给出明确登录入口。
- [ ] 文件无法跨登录保留时，工作台仍显示可继续上传的空态。

## 验证命令

```bash
pnpm e2e -- e2e/precision-glass-home.spec.ts
pnpm vitest --run src/components/landing/__tests__/hero.test.tsx src/components/landing/__tests__/upload-entry.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §2.4 AC-01、§6.1、§4.2 LandingExperience、§8.1
- **相关代码**: `src/app/page.tsx`、`src/components/landing/*`、`src/components/landing/use-file-store.tsx`
- **契约 / 数据对象**: `StatusCopy`、`ProductStatus`
- **下游消费方**: 无；与 FEAT-04 共享上传入口体验口径。

## 风险与边界

- **执行顺序**: 先写 E2E red，再 Hero，再 UploadEntry，再下方区块，再测试。
- **验证失败排查方向**: 检查登录 mock、file input 可访问性、首页文案断言和 CSS token。
- **允许修改的额外文件**: `e2e/helpers/mock-api.ts`，仅限复用认证/上传 mock。
- **暂停条件**: 若首页上传入口需要改变文件跨页面传递机制，暂停并报告，因为架构要求业务链路不变。
- **E2E 不适用说明**: 不适用；本功能必须有首页 E2E。
- **风险备注**: 首页不能退化成长篇营销页，首屏必须服务快速开始创作。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 非图片或超限文件 | 上传区内展示原因和重新选择入口 | done |
| 未登录上传 | 提供登录入口，不丢失页面上下文 | done |
| hover/dragover 反馈不明显 | 使用共享交互 class 和 accent 意图 | done |
| 1280px 首屏内容过高 | 调整间距，保留下一段内容提示 | done |
