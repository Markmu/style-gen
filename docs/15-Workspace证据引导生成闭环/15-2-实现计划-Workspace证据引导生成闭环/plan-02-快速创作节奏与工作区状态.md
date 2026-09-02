---
feat_id: "plan-02"
title: "快速创作节奏与工作区状态"
dimension: frontend
phase: 2
status: done
depends_on: ["plan-01"]
---

# plan-02: 快速创作节奏与工作区状态

## 功能概要

- **目标**: 交付新方向双速入口、Workspace v5 恢复、快速确认快照与一次性授权状态机，使快速复刻只按用户披露并确认的设置自动提交一次。
- **完成后可观察结果**: 空工作区默认停留在“分析后编辑”，用户可在选图前选择快速复刻并看到贴近复刻、平衡、参考推荐/1:1 回退策略、当前生成设置和单张生成说明。确认后相关设置在分析期间只读；分析完成且生成门通过时只提交一次，刷新或 effect 重放不会重复。分析失败、生成门阻塞、用户退出快速路径或旧快照无效时不会自动生成，当前参考与编辑内容继续保留。
- **依赖**: plan-01（快速授权/Prompt/画幅类型和纯函数）
- **关联验收标准**: [AC-01, AC-07]
- **涉及架构模块**: Workspace Session Controller、Prompt Control & Compiler
- **前置条件**: plan-01 类型与画幅策略已落地；当前 `use-workspace-state` 测试基线通过。
- **不在范围**: 完整 Prompt 控制 UI（plan-04）；GenerationTask 数据库快照（plan-03）；结果 rail/比较（plan-05）。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/hooks/use-workspace-state.ts` | v4→v5、节奏/授权/确认快照/params/首选与原子 actions |
| modify | `src/hooks/__tests__/use-workspace-state.test.tsx` | 迁移、原子授权、阻塞清理和恢复测试 |
| create | `src/components/workspace/creation-pace-selector.tsx` | 双入口与快速确认交互 |
| create | `src/components/workspace/__tests__/creation-pace-selector.test.tsx` | 披露、确认、取消、锁定和焦点测试 |
| modify | `src/components/workspace/output-card.tsx` | armed 时生成设置只读与确认快照提示 |
| modify | `src/components/workspace/__tests__/output-card.test.tsx` | 锁定、恢复与 disabled reason 测试 |
| modify | `src/app/workspace/page.tsx` | 节奏挂载、确认快照、快速 effect 与统一 submit 接线 |
| create | `e2e/workspace-evidence-guided-render-loop.spec.ts` | AC-01/AC-07 red E2E 骨架与快速路径场景 |

## 实现规格

### 前端部分

#### 1. Workspace v5 与原子 action

- v5 持久化 `creationPace`、`quickAuthorization`、`quickGenerationAuthorizationSnapshot`、Prompt controls、generation params、aspectRatioSource 与 preferred ID；瞬时选择/比较/焦点不持久化。
- v4 迁移保留参考、Prompt、变量、来源和参数；新分析 detail 默认 standard；缺合法快速快照时强制 authorization=none，不从旧 pace 推测授权。
- 提供原子 actions：确认快照+armed、consumed 同步 flush、阻塞/退出清快照+none、新方向重置；刷新恢复时 armed 必须与合法快照成对。

#### 2. 创作节奏确认

- 新方向默认 analyze_edit；快速卡在选择参考图前打开确认区/对话框，焦点进入标题，关闭回原触发器。
- 确认内容直接从拟保存 `QuickGenerationAuthorizationSnapshot` 渲染：reconstruction、standard、reference_or_fallback、当前默认 quality/model 等 generationSettings、生成 1 张。
- 确认原子持久化；取消零写入；armed 期间 intent/detail/generation settings 只读并解释如何退出快速路径。

#### 3. 快速自动提交编排

- 分析 V2 success 后，从授权快照 + Recipe 默认 invariants/variables/modifiers 派生不可变请求；画幅读取参考比并按 policy 解析，失败才 1:1。
- readiness 同时验证快照、Prompt、Recipe、Provider 支持与参数一致性；失败执行 armed→none、清快照、flush 并显示同一阻止原因。
- readiness 通过后先 consumed+flush，再调用统一 submit；effect 重放和页面重载均不得二次提交。自动请求不读取 live 草稿；失败保持 consumed，用户仅可主动重试。

#### 4. E2E-TDD

- 先创建 `workspace-evidence-guided-render-loop.spec.ts` red 场景：深入路径不生成；快速确认披露五类信息；分析后仅一次 POST；锁定字段；刷新不重放；阻塞/取消清授权且条件恢复不延迟提交；两路径证据完整度一致。
- mock API 延用 `e2e/helpers/mock-api.ts`，不得调用 live Provider/R2。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：创建快速路径 E2E 并留存失败证据 | frontend | done | 覆盖 AC-01 正常/阻塞/重放 |
| 2 | 升级 Workspace v5 与迁移测试 | frontend | done | 无合法快照不得恢复 armed |
| 3 | 实现原子授权 actions 与同步 flush | frontend | done | confirm/consume/clear/reset |
| 4 | 创建创作节奏选择与确认组件 | frontend | done | 披露、焦点、取消零写入 |
| 5 | 接线 armed 锁定与统一 readiness | frontend | done | OutputCard 与页面共享状态 |
| 6 | 实现快速 effect 与不可变请求派生 | frontend | done | 先 consumed 后 POST |
| 7 | green：组件/E2E/fast gate | frontend | done | 保存 red/green evidence |

## 验收标准

### 功能验收

- [x] AC-01 分析后编辑完成分析后停在可编辑态，不产生 generation POST。
- [x] AC-01 快速确认显示 reconstruction、standard、参考推荐/1:1 策略、当前默认生成设置和单张生成；最终请求与确认快照一致。
- [x] AC-01 快速路径只自动 POST 一次；刷新、StrictMode/effect 重放或轮询重复 success 均不重放。
- [x] AC-07 分析失败、缺内容、服务不可用、快照无效或用户退出时清除 armed 快照并说明原因；条件恢复后不延迟生成。
- [x] AC-07 取消确认和切回分析后编辑不丢参考、分析结果或当前草稿，焦点回到可理解位置。
- [x] E2E-TDD：`e2e/workspace-evidence-guided-render-loop.spec.ts` 快速路径场景先 red、实现后 green，并形成两阶段证据。

### 性能验收（架构 §8.1）

- [x] 普通 Workspace 快照写入使用 300ms 防抖；授权 confirm/consume/clear 使用同步 flush，且不把图片或方向结果写入 sessionStorage。

### 降级回归验收（架构 §8.2）

- [x] L4 分析降级/生成门阻塞提示在三栏布局中可见，不遮挡参考、证据与手动编辑入口。
- [x] L5 服务不可用时本地草稿仍可编辑，页面不声称任务已创建。
- [x] `pnpm verify:fast` 通过。

## 验证命令

```bash
pnpm vitest --run src/hooks/__tests__/use-workspace-state.test.tsx src/components/workspace/__tests__/creation-pace-selector.test.tsx src/components/workspace/__tests__/output-card.test.tsx
pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts --project=workspace
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §3.1/3.2/3.3、ADR-2、§6.1、§7.2、§8.2
- **相关代码**: `src/hooks/use-workspace-state.ts`、`src/app/workspace/page.tsx`、`src/components/workspace/output-card.tsx`、`src/lib/render-readiness.ts`
- **契约 / 数据对象**: `WorkspaceCreativeState`、`QuickGenerationAuthorizationSnapshot`、`QuickAuthorization`
- **下游消费方**: plan-04、plan-07；plan-03 独立消费 plan-01 的快照类型

## 风险与边界

- **执行顺序**: red E2E → v5/原子 actions → UI → effect → green。
- **验证失败排查方向**: sessionStorage 版本、effect 依赖、同步 flush 时序、mock 分析 success 重复回放。
- **允许修改的额外文件**: `e2e/helpers/workspace-actions.ts`（仅新增可复用节奏/确认操作 helper）。
- **暂停条件**: 发现 sessionStorage 写入无法在 POST 前同步保证，或快速路径需要服务端新幂等实体（超出 ADR-2）。
- **E2E 不适用说明**: 不适用；本功能是用户可观察主路径。
- **风险备注**: 自动失败后不可 re-arm；用户主动重试走手动路径，不复活原任务。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| v4 快照含旧 outputMode | 迁移可识别字段并默认 standard；快速授权归 none | done |
| armed 快照损坏/缺字段 | 视为 none、清快照、提示重新确认 | done |
| 分析成功事件重复触发 | submit lock + consumed 持久化只允许一次 | done |
| 用户分析期间退出快速路径 | 分析继续，清授权并解锁设置 | done |
| 自动 POST 网络失败 | 保持 consumed 与草稿，显示主动重试 | done |
