---
workflow_type: 'new-feature'
spec_id: 'FEAT-0005'
title: '视觉分析语义契约与确定性编译'
type: 'refactor'
created: '2026-07-18'
status: 'done'
context:
  - 'docs/FEAT-0004-structured-style-extraction.md'
  - 'docs/backup/01-1-架构文档-参考图风格再创作.md'
  - 'docs/design/DESIGN.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** 当前结构化模型既判断视觉语义又定义变量、修饰器与字段形状；提示词未完整声明数组元素契约时，模型虽提取出有效 Style DNA，仍会因字段漂移被整体降级为 fallback 并在 UI 中误显示为 legacy。

**方案：** 保留“视觉理解 → 结构化整理”两次 AI 调用和持久化 V2 Recipe，由模型只返回可观察内容与风格语义，服务端确定性生成变量、修饰器、模板和状态；原生 Gemini 使用 JSON Schema，其他 Provider 使用同一显式契约并接受本地语义校验。

## 边界

**必须：** V2 Recipe、现有分析任务表、生成 API 和旧 Recipe 兼容保持不变；稳定 ID、变量、modifier、三档模板和兼容投影只由服务端生成；有效内容与风格证据应尽量保留为 ready/partial。

**先问：** 如需新增第三次 AI 调用、切换默认 Provider、新增数据库列/数据表或升级持久化 Recipe schemaVersion，必须重新取得人工批准。

**禁止：** 不用文本长度或关键词伪造证据/置信度；不在模型输出中保留 prompt、template、contentVariables、optionalModifiers 或 UI label；不把 V2 fallback 标记为 legacy；不自动修改本地或部署环境变量。

## 需求变更

### 新增
- **REQ-1**: 结构化语义候选 SHALL 只包含 `contentDescription`、九维 `styleProfile`、`styleInvariants`、字符串型 `negativeConstraints` 和 `styleFingerprint`；系统提示 SHALL 明确每种数组元素的完整字段、枚举、基数、内容/风格边界及未知值处理。
- **REQ-2**: Gemini Structurer SHALL 使用受支持的 JSON Schema 约束响应，Provider 选择 SHALL 支持独立 `STRUCTURER_PROVIDER` 覆盖且默认继续跟随 `VISION_PROVIDER`；Replicate 路径继续使用同一语义契约和服务端校验。
- **REQ-3**: 服务端 SHALL 按主体、属性、动作、环境、辅助元素、时间天气的固定映射生成最多 8 个内容变量，并从最高可信的 atmosphere/color observation 分别生成至多一个默认关闭的 `mood`/`primary_color` modifier。
- **REQ-4**: 语义归一化 SHALL 输出字段级丢弃原因；缺少 fingerprint token、negative constraint、modifier 或部分 Style DNA 只影响 ready/partial 完整度，不得在内容摘要、至少一个内容变量、至少一个风格不变量和标准模板均可用时触发 fallback。

### 修改
- **REQ-5**: [模型生成变量、modifier 与模板字段] → [模型只提供视觉语义，Validator 和 Composer 确定性生成全部派生产物]。
- **REQ-6**: [任一非核心集合为空即丢弃完整 V2 包] → [先保留合法核心为 partial，仅核心不可用或模板无法解析时保存 fallback 信封]。
- **REQ-7**: [V2 fallback 进入通用 legacy view] → [V2 fallback 显示明确的 fallback 状态、提取原因和普通 Prompt 降级能力；只有旧扁平 Recipe 显示 legacy]。

</frozen-after-approval>

## 代码地图

- `src/lib/ai/prompts.ts`、`src/lib/ai/structured-output-schema.ts` -- 定义唯一语义候选契约和 Gemini JSON Schema。
- `src/lib/ai/providers/index.ts`、`src/lib/ai/providers/gemini-structurer.ts`、`.env.example` -- 解耦 Structurer 配置并在原生 Gemini 路径启用 Schema。
- `src/lib/visual-recipe.ts`、`src/lib/prompt-composer.ts` -- 归一化模型语义，确定性派生变量、modifier、状态和三档 Prompt。
- `src/lib/analysis-result-view-model.ts`、`src/components/workspace/recipe-card.tsx` -- 区分 V2 fallback 与 legacy，并展示可操作的失败原因。
- `src/lib/ai/__tests__/`、`src/lib/__tests__/`、`src/components/workspace/__tests__/`、`e2e/analysis-structured-style-extraction.spec.ts` -- 覆盖真实字段漂移、partial、fallback、legacy 和端到端投影。

## 任务清单

- [x] `src/lib/ai/prompts.ts`、`src/lib/ai/structured-output-schema.ts` -- 重写语义提示并建立紧凑 JSON Schema，删除模型对派生字段的所有权。
- [x] `src/lib/ai/providers/index.ts`、`src/lib/ai/providers/gemini-structurer.ts`、`.env.example` -- 增加可选 Structurer Provider 配置并验证 Schema 调用参数。
- [x] `src/lib/visual-recipe.ts`、`src/lib/prompt-composer.ts` -- 实现确定性内容变量/modifier 编译、精确归一化原因和 partial-first 状态门。
- [x] `src/lib/analysis-result-view-model.ts`、`src/components/workspace/recipe-card.tsx` -- 为 V2 fallback 提供独立、非 legacy 的诊断视图。
- [x] `src/lib/ai/__tests__/`、`src/lib/__tests__/`、`src/components/workspace/__tests__/`、`e2e/analysis-structured-style-extraction.spec.ts` -- 补齐契约、真实 Provider 漂移和 UI 回归测试。

## 验证命令

- `pnpm vitest --run src/lib/ai/__tests__/prompts.test.ts src/lib/ai/providers/__tests__/gemini-structurer.test.ts src/lib/ai/providers/__tests__/replicate-structurer.test.ts src/lib/ai/__tests__/structurer.test.ts src/lib/__tests__/visual-recipe-v2.test.ts src/lib/__tests__/prompt-composer.test.ts src/components/workspace/__tests__/recipe-card.test.tsx` -- 验证语义契约、Provider、编译器与 fallback UI。
- `pnpm type-check` -- 验证类型契约。
- `pnpm lint` -- 验证静态规则。
- `pnpm e2e -- e2e/analysis-structured-style-extraction.spec.ts --project=workspace` -- 验证分析到模板编辑的完整投影。
- `pnpm test` -- 完整单元与组件回归。

## 验收标准

- [x] Given 模型返回有效内容、九维 Style DNA 和风格不变量但不返回变量/modifier, when Validator 处理候选, then 服务端生成稳定内容变量、至多两个唯一 modifier 和无未解析标记的标准模板。
- [x] Given 原生 Gemini Structurer 被调用, when 请求生成结构化结果, then 请求包含 JSON MIME type 与语义候选 JSON Schema；given 未配置 `STRUCTURER_PROVIDER`, then Provider 仍跟随 `VISION_PROVIDER`。
- [x] Given 同一份内容和 styleProfile 输入被重复处理, when 编译派生产物, then 变量名称、标签、默认值、顺序、modifier 和 Prompt 输出完全一致且不需要额外 AI 调用。
- [x] Given 候选缺少 fingerprint tokens、negative constraints、modifier 或部分风格维度, when 内容、至少一个 invariant 和标准模板可用, then 结果为 partial 而不是 fallback，并记录具体缺失原因。
- [x] Given 候选沿用真实漂移形态（变量使用 `value`、modifier 重复、negative constraints 为对象）, when 新流程处理, then 已废弃派生字段不会污染 Recipe，非法排除项被精确报告，合法 Style DNA 不会因此丢失。
- [x] Given 已保存的 V2 fallback, when Workspace 展示 Style Intelligence, then 状态显示 fallback 和提取原因而非 Legacy analysis；given 旧扁平 Recipe, then 仍按 legacy 正常显示和生成。

## 验证记录

- Red: `pnpm vitest --run src/lib/ai/__tests__/prompts.test.ts src/lib/ai/providers/__tests__/gemini-structurer.test.ts src/lib/ai/providers/__tests__/factory.test.ts src/lib/__tests__/visual-recipe-v2.test.ts src/components/workspace/__tests__/recipe-card.test.tsx` — 预期失败（5 files，7 tests），覆盖派生字段所有权、JSON Schema、Provider 覆盖、partial-first 和 V2 fallback 诊断。
- Green: `pnpm vitest --run src/lib/ai/__tests__/prompts.test.ts src/lib/ai/providers/__tests__/gemini-structurer.test.ts src/lib/ai/providers/__tests__/replicate-structurer.test.ts src/lib/ai/providers/__tests__/factory.test.ts src/lib/ai/__tests__/structurer.test.ts src/lib/__tests__/visual-recipe-v2.test.ts src/lib/__tests__/prompt-composer.test.ts src/components/workspace/__tests__/recipe-card.test.tsx` — 8 files，73 tests 通过。
- Green: `pnpm type-check` — 通过。
- Green: `pnpm lint` — 通过；仅有仓库既有 warnings。
- Green: `pnpm e2e -- e2e/analysis-structured-style-extraction.spec.ts --project=workspace` — 3/3 通过；同时将 Replace 断言限定到主 app shell，消除既有重复 test id 的严格模式歧义。
- Regression: `pnpm test` — 92 files，675 tests 通过。
- Integration: 使用任务 `01KXRBA4NDFZ97SDTHHEJGZKCE` 的原始视觉分析进行不落库重放 — Replicate/Gemini 返回 V2 partial、6 个变量和可解析标准模板，不再整体 fallback；缺失 negative constraints 被保留为明确 partial 原因。
