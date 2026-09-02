---
feat_id: "plan-01"
title: "Prompt 编译与画幅基础"
dimension: mixed
phase: 1
status: done
depends_on: []
---

# plan-01: Prompt 编译与画幅基础

## 功能概要

- **目标**: 建立第 15 期共享的类型、确定性 Prompt 文档、规则 adjustment、来源 segment 和唯一画幅算法，为快速路径、Prompt UI、结果比较及服务端快照提供同一契约。
- **完成后可观察结果**: 给定同一份 V2 Recipe 与控制快照，系统稳定产出同一段 Prompt 和可定位来源；三档表达都保留全部已启用规则，只改变补充观察与表达密度。用户对真实规则执行加强、放宽、替换或禁用时，模型事实不变而生成文本与摘要按规则更新。参考图比例能够确定性映射到最近支持画幅，用户/历史值可覆盖推荐，fal Provider 不再静默回退未知比例。
- **依赖**: 无
- **关联验收标准**: [AC-01, AC-02, AC-03, AC-05]
- **涉及架构模块**: Prompt Control & Compiler、Workspace Session Controller、Analysis & Generation Routes
- **前置条件**: V2 Recipe、现有 `prompt-composer`、fal Provider 与相邻测试基线通过。
- **不在范围**: Workspace 交互组件；sessionStorage v5；GenerationTask 数据库字段与 API；结果 rail。

## 文件清单

### 后端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/types/models.ts` | 新增 Prompt 控制、调整、编译 segment、快速授权和方向 DTO 类型 |
| modify | `src/lib/prompt-composer.ts` | 实现 `composePromptDocument` 并保持既有导出兼容 |
| modify | `src/lib/__tests__/prompt-composer.test.ts` | 两意图、三档、segment 与兼容性测试 |
| create | `src/lib/prompt-adjustments.ts` | 规则调整、维度聚合、摘要与自定义全文回退纯函数 |
| create | `src/lib/__tests__/prompt-adjustments.test.ts` | 四动作、零/单/多规则与 range/append 测试 |
| create | `src/lib/generation/aspect-ratio.ts` | 共享画幅白名单、最近值算法、来源优先级与校验 |
| create | `src/lib/generation/__tests__/aspect-ratio.test.ts` | 最近值、并列、回退和覆盖优先级测试 |
| modify | `src/lib/ai/providers/fal-image-gen.ts` | 完整映射公开画幅并拒绝未知值 |
| modify | `src/lib/ai/providers/__tests__/fal-image-gen.test.ts` | portrait 映射和未知值拒绝测试 |

## 实现规格

### 后端部分

#### 1. 类型与不可变边界

- 在 `src/types/models.ts` 定义架构 §7.2 的 `CreationPace`、`QuickAuthorization`、`PromptIntent`、`PromptDetailLevel`、`PromptEditorMode`、`InvariantAdjustment`、`PromptControlSnapshot`、`QuickGenerationAuthorizationSnapshot`、`CompiledPromptSegment`、`CompiledPrompt`、`DirectionIterationListItem` 与 `DirectionIterationFeed`。
- `QuickGenerationAuthorizationSnapshot` 固定 `reconstruction / standard / reference_or_fallback`，`generationSettings` 排除 `aspectRatio`；所有数组和 record 保持扁平，禁止把权限事实放入客户端快照。
- `InvariantAdjustment` 只引用 Recipe 中真实 `invariantId`；模型 Recipe/evidence 不可被 adjustment 写回。

#### 2. Prompt 文档编译

- `composePromptDocument(recipe, controls)`：reconstruction 使用原内容，same_style 使用变量模板；按 Recipe 维度原序稳定输出并去重。
- 三档均包含全部 enabled hard/soft invariants、当前变量与 enabled modifiers：concise 不加未覆盖 observation；standard 每维至多一条置信度 ≥0.7 的最高项；professional 加入全部 ≥0.5 的未覆盖项，同分按 Recipe 原序。
- 每个文本片段生成 sourceKind/sourceId/dimension/startIndex/endIndex；既有 PromptOutputs 调用方通过兼容导出继续工作。

#### 3. adjustment 与摘要

- 同一 invariant 只保留一个最新 adjustment：strengthen、relax、replace、disable 使用架构 §6.2 的确定文案语义；replace trim 后非空且 ≤200 字符。
- “保留”取未禁用 invariants；“改变”比较变量当前值和默认值，先 trim、压缩空格、忽略大小写。
- 自定义全文命中 segment/range 时局部替换或删除；未命中且非 disable 时追加 `Adjustments:`；未命中 disable 只关闭规则并返回“未找到可删除表达”状态。

#### 4. 画幅算法与 Provider

- 唯一公开画幅顺序为 `1:1, 4:3, 16:9, 3:4, 9:16`；距离 `abs(log(reference/candidate))`，并列按数组顺序。
- 来源优先级：restore > user > reference > fallback；无尺寸且无高优值时 1:1/fallback，不标推荐。
- fal 显式将 3:4/9:16 映射为 `portrait_4_3`/`portrait_16_9`；未知值在调用 Provider 前抛可识别校验错误。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 定义第 15 期共享类型 | backend | done | 与架构 §7.2 一致，保持兼容字段 |
| 2 | red：补 Prompt 三档和 invariant 集合测试 | backend | done | 先证明当前 composer 不满足新契约 |
| 3 | 实现 composePromptDocument 与 segments | backend | done | 保留既有导出消费方 |
| 4 | 实现 adjustment/摘要/全文降级纯函数 | backend | done | 四动作与真实 invariant 约束 |
| 5 | red：补画幅算法与 fal 映射测试 | backend | done | 含 4:5→3:4、并列、未知值 |
| 6 | 实现共享画幅模块与 fal 映射 | backend | done | 禁止 Provider 静默回退 |
| 7 | green：运行聚焦测试与类型检查 | backend | done | 所有新增/存量用例通过 |

## 验收标准

### 契约验收

- [x] AC-02 同一控制快照在 concise/standard/professional 下的 enabled invariant ID 集合完全一致；仅 observation 数与表达密度变化。
- [x] AC-02 手动全文命中/未命中、切换前后所需状态均能由纯函数稳定表达，不覆盖原 Recipe。
- [x] AC-05 strengthen/relax/replace/disable 仅更新对应 invariant adjustment；零规则不产生虚假目标。
- [x] AC-03 reference/user/restore/fallback 优先级、最近比例、并列与 1:1 回退全部有自动化测试。
- [x] AC-01 `QuickGenerationAuthorizationSnapshot` 的 intent/detail/policy 在类型层不可写成其他值。

### 性能验收（架构 §8.1）

- [x] Prompt 重编译与摘要派生在 10 个 invariants、20 个变量下单次 ≤50ms（Vitest 性能断言使用宽松隔离基线，避免墙钟 flake）。

### E2E 适用性

- [x] 本功能为共享纯函数/Provider 契约，独立 E2E 不适用；用户行为由 plan-02/04/05 的 `e2e/workspace-evidence-guided-render-loop.spec.ts` 覆盖，当前功能必须先提供其可导入契约。
- [x] `pnpm type-check` 与 `pnpm verify:fast` 通过。

## 验证命令

```bash
pnpm vitest --run src/lib/__tests__/prompt-composer.test.ts src/lib/__tests__/prompt-adjustments.test.ts src/lib/generation/__tests__/aspect-ratio.test.ts src/lib/ai/providers/__tests__/fal-image-gen.test.ts
pnpm type-check
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.2、§6.3、§7.2、ADR-3、§8.1
- **相关代码**: `src/lib/prompt-composer.ts`、`src/lib/visual-recipe.ts`、`src/lib/prompt-provenance.ts`、`src/lib/ai/providers/fal-image-gen.ts`
- **契约 / 数据对象**: `PromptControlSnapshot`、`QuickGenerationAuthorizationSnapshot`、`CompiledPrompt`、`InvariantAdjustment`、共享画幅常量
- **下游消费方**: plan-02、plan-03、plan-04、plan-05

## 风险与边界

- **执行顺序**: 先类型与 red 测试，再 composer/adjustment，最后画幅与 Provider。
- **验证失败排查方向**: 先检查存量 composer 导出兼容、Recipe 原序与 Provider 画幅枚举；性能失败需隔离并确认非测试环境抖动。
- **允许修改的额外文件**: 无。
- **暂停条件**: 发现现有 Provider 公开支持列表与架构定义冲突，或 V2 Recipe 无稳定 invariant ID。
- **E2E 不适用说明**: 纯内部契约，行为 E2E 由下游功能承担。
- **风险备注**: 禁止引入 LLM 二次改写；所有编译必须确定性、无外部调用。

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| adjustment 引用未知 invariant | 返回校验错误，不编译虚假规则 | done |
| 同一 invariant 重复 adjustment | 以最后一次显式动作覆盖，输出唯一 segment | done |
| 参考尺寸为 0/NaN | 进入 fallback 1:1，不显示推荐 | done |
| Provider 收到未知画幅 | 调用前拒绝，不回退 square | done |
| 旧 composer 调用方 | 兼容导出结果保持可用，存量测试不红 | done |
