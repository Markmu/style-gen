---
title: '结构化风格提取包与多档 Prompt'
type: 'feature'
workflow_type: 'new-feature'
spec_id: 'FEAT-0004'
created: '2026-07-13'
status: 'done'
context:
  - 'docs/01-0-需求设计-参考图风格再创作.md'
  - 'docs/01-1-架构文档-参考图风格再创作.md'
  - 'docs/10-0-需求设计-分析后模板变量自动填充.md'
  - 'docs/10-1-架构文档-分析后模板变量自动填充.md'
  - 'docs/design/DESIGN.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** 当前分析结果仍是扁平 Recipe 和单份 Prompt，内容、风格、置信度与观察依据混杂，用户难以判断哪些规则应保留，也无法稳定复用同一风格生成不同内容。

**方案：** 将分析产物升级为版本化的结构化风格提取包，先分离内容事实与可迁移风格，再由同一份结构化数据派生复原 Prompt、三档可复用风格模板、风格指纹和 Negative Prompt，并在工作台提供证据、锁定项与变量编辑入口。

## 边界

**必须：** V2 `VisualRecipe` 仍是分析结果的 source of truth，放入现有 `recipe` JSONB；现有 `AnalysisTask.promptText/negativePromptText/analysisTemplate*` 只保存兼容投影，旧扁平 Recipe 只通过 adapter 读取。沿用“视觉理解 → 结构化整理”两阶段调用、现有分析任务状态和生成 API；默认标准模板必须带参考图默认值并可直接生成；旧 Recipe、旧历史记录和 L1–L4 降级链必须继续可读可用。

**先问：** 如需新增第三次 AI 调用、独立数据表或非 JSONB 数据列，改变 `/api/generation` 请求契约、历史恢复语义或工作台三栏主布局，必须先获得人工批准。

**禁止：** 不自动保存到 Style Memory；不做多图联合分析、风格相似度检索/聚类、批量变量组合、模型专属 Prompt 方言、生成历史中的档位/勾选过程回放，或对艺术家身份与版权归属的推断；不得用文本长度、关键词命中数或虚构图像坐标伪装成模型证据与置信度。

## 需求变更

### 新增
- **REQ-1**: ready/partial 分析 SHALL 产出 `schemaVersion: 2` 的完整结构化风格提取包，包含 `contentDescription`、`styleProfile`、`styleInvariants`、`contentVariables`、`optionalModifiers`、`negativeConstraints`、`styleFingerprint` 和 `promptOutputs`；fallback 只保存版本、状态和原因信封。
- **REQ-2**: `contentDescription` SHALL 覆盖摘要、主体、主体属性、动作/状态、环境、辅助元素和时间/天气；`styleProfile` SHALL 覆盖视觉媒介、构图、镜头、色彩、光影、造型语言、材质纹理、氛围和渲染。
- **REQ-3**: 每项可执行风格结论 SHALL 使用统一 observation 契约，包含稳定 ID、结论值、1–3 条文字观察依据与 `0–1` 模型置信度；本期 evidence 不含图像坐标，前端不得把文字依据展示为参考图上的空间定位。
- **REQ-4**: ready 结果 SHALL 给出 5–10 个与主体/场景解耦的风格不变量，partial 可少于 5 个；硬锚点必须至少有一条依据且置信度不低于 `0.70`，`0.50–0.69` 的有效候选降为软修饰，低于 `0.50` 或无依据的候选丢弃；所有有效不变量默认启用。
- **REQ-5**: `styleFingerprint` SHALL 同时包含精简 token 列表和 `realism`、`abstraction`、`contrast`、`saturation`、`softness`、`detailDensity`、`symmetry`、`depth`、`atmosphericIntensity` 九个键；ready 时均为 `0–1`，partial 时无法可信判断的维度为 `null`。复制文本由前端按 tokens 顺序以逗号连接，不另存字段；本期不用于搜索或排序。
- **REQ-6**: 结构化模型 SHALL 只输出语义字段；服务端 `prompt-composer` SHALL 在校验后确定性生成并写回复原 Prompt、精简/标准/专业三档模板和兼容字段，禁止模型文本与组合器文本并存为两个 source of truth。
- **REQ-7**: 内容变量 SHALL 覆盖本图可识别的主体、主体属性、动作、环境、辅助元素和时间/天气及默认值；情绪与主色覆盖作为默认关闭的 optional modifier，画幅比继续使用现有生成参数。
- **REQ-8**: 精简版 SHALL 包含当前内容变量和已启用硬锚点；标准版 SHALL 再包含已启用软修饰；专业版 SHALL 再包含置信度不低于 `0.50` 且未被不变量覆盖的 Style DNA 细节。三档均按内容、构图/镜头、色彩、光影、媒介、材质、氛围、渲染顺序组合；启用 optional modifier 时，三档均在对应维度位置用该变量替换原有 Style DNA 与硬/软锚点片段，底层 Recipe 和锚点开关不变，关闭后恢复原片段；`negativeConstraints` 只写入 `negativePromptText`，不得重复拼入正向 Prompt。
- **REQ-9**: 工作台 SHALL 将分析结果组织为“内容分析、Style DNA、风格不变量、Prompt 输出”四个可扫描区域；用户可查看文字证据/置信度、启停风格锚点、编辑变量并切换复原/精简/标准/专业/结构化输出，不发起额外 AI 调用。
- **REQ-10**: 复原 Prompt 和结构化 JSON SHALL 保持分析原始事实不受锚点/变量修改影响；结构化 JSON 只可查看/复制，复原 Prompt 可生成但需先“编辑为自定义文本”才能修改。
- **REQ-11**: 三档模板正文 SHALL 是不可直接改写的系统派生视图，变量值与锚点开关是其编辑入口；“编辑为自定义文本” SHALL 克隆当前正向 Prompt 到唯一独立文本草稿，后续切档不得覆盖该草稿，也不得反向写入 V2 Recipe。

### 修改
- **REQ-12**: [前端根据扁平 Recipe 文本长度和关键词推导 evidence confidence] → [前端直接消费模型输出的 evidence 与 confidence；旧 Recipe 才使用明确标记为 legacy 的无数值降级展示]。
- **REQ-13**: [单份自动模板表达内容和风格] → [内容变量只承载可替换事实，风格不变量承载跨内容复用规则；修改主体/场景不得隐式改写已启用的风格锚点]。
- **REQ-14**: [结构化整理异常时整体退回普通文本] → [按独立 `extractionStatus` 优先保留可校验节点；无法形成可用标准模板时才沿用当前 fallback 文本、原因说明和可编辑/可生成能力]。
- **REQ-15**: [保存模板固定承接当前自动模板或手工文本] → [模板模式保存当前精简/标准/专业模板及变量值，自定义文本模式继续保存当前文本为无变量模板；复原 Prompt 与结构化 JSON 状态禁用保存，但可先克隆为自定义文本]。
- **REQ-16**: [模板正文与完整文本都可直接改写] → [系统派生模板正文保持只读，变量/锚点负责结构化修改；任意自由文本编辑先克隆到独立自定义文本模式，保留现有精修能力且不污染分析事实]。

## 最小数据契约

以下是持久化和 API 返回契约；结构化模型只返回其中的语义候选字段，Validator 计算 `extractionStatus/extractionReasons`，Composer 生成 `promptOutputs` 后才形成完整 V2 Recipe。

```typescript
type ExtractionStatus = "ready" | "partial" | "fallback";
type StyleDimension =
  | "visualMedium" | "composition" | "camera" | "color" | "lighting"
  | "formLanguage" | "materialTexture" | "atmosphere" | "rendering";

interface StyleObservation {
  id: string;
  value: string;
  evidence: string[];
  confidence: number;
}

interface ContentDescription {
  summary: string;
  subject?: string;
  subjectAttributes: string[];
  actionOrState?: string;
  environment?: string;
  supportingElements: string[];
  timeOrWeather?: string;
}

interface StyleInvariant extends StyleObservation {
  kind: "hard" | "soft";
  dimension: StyleDimension;
  sourceObservationIds: string[];
}

interface ContentVariable {
  name: string;
  label: string;
  defaultValue: string;
  sourceField:
    | "subject" | "subject_attributes" | "action" | "environment"
    | "supporting_elements" | "time_weather";
}

interface OptionalModifier {
  name: "mood" | "primary_color";
  label: string;
  defaultValue: string;
  dimension: "atmosphere" | "color";
  enabledByDefault: false;
}

interface PromptOutputs {
  reconstructionPrompt: string;
  conciseTemplate: string;
  standardTemplate: string;
  professionalTemplate: string;
}

interface VisualRecipeV2Success {
  schemaVersion: 2;
  extractionStatus: "ready" | "partial";
  extractionReasons: string[];
  contentDescription: ContentDescription;
  styleProfile: Record<StyleDimension, StyleObservation[]>;
  styleInvariants: StyleInvariant[];
  contentVariables: ContentVariable[];
  optionalModifiers: OptionalModifier[];
  negativeConstraints: string[];
  styleFingerprint: {
    tokens: string[];
    scores: Record<
      "realism" | "abstraction" | "contrast" | "saturation" | "softness"
      | "detailDensity" | "symmetry" | "depth" | "atmosphericIntensity",
      number | null
    >;
  };
  promptOutputs: PromptOutputs;
}

interface VisualRecipeV2Fallback {
  schemaVersion: 2;
  extractionStatus: "fallback";
  extractionReasons: string[];
  promptOutputs: null;
}

type VisualRecipeV2 = VisualRecipeV2Success | VisualRecipeV2Fallback;
```

约束：以下基数约束只适用于 ready/partial 成功包；fallback 仅校验信封。Validator 按维度和归一化顺序分配稳定 ID，ID 匹配 `[a-z][a-z0-9_]{0,63}` 且包内唯一；每个 invariant 的 `sourceObservationIds` 含 1–3 个已存在的 Style DNA observation ID，Professional 档以该引用关系排除重复 observation；`mood` modifier 固定映射 `atmosphere`，`primary_color` 固定映射 `color`；结论/默认值为 1–500 字符；每条 evidence 为 1–240 字符且每项 1–3 条；每个 Style DNA 维度最多 5 项；内容变量 1–8 个；不变量 1–10 个；排除项 1–20 个；fingerprint token 在 ready 为 3–12 个、partial 为 1–12 个；`extractionReasons` 最多 10 条且每条 1–240 字符；各 Prompt/模板不超过 6000 字符；confidence 必须为有限的 `0–1` 数值，fingerprint score 还可在 partial 时为 `null`。

状态判定：归一化后，若摘要、至少 1 个内容变量、至少 1 个风格不变量和无未解析变量的标准 Prompt 均有效，则可用；其中至少 4 个 Style DNA 维度非空、5–10 个不变量且九维 fingerprint 完整为 `ready`，否则为 `partial`。无法形成上述可用核心或标准 Prompt 时只持久化 fallback 信封；非法可选节点直接丢弃并写入 `extractionReasons`。兼容 `analysisTemplateStatus` 与 `extractionStatus` 同值，`analysisTemplateReason` 为 reasons 摘要；fallback 任务仍为 `completed`，仅 Provider/解析/核心校验失败设置 `errorStage="llm"`，参考图本身信息不足但响应合法时 `errorStage=null`。

投影规则：ready/partial 时，`promptText` 为标准模板按默认值渲染的完整文本，`negativePromptText` 为排除项逗号连接，`analysisTemplateContent` 为标准模板，`analysisTemplateVariables` 为标准模板实际引用的内容变量/已启用 optional modifier；fallback 时沿用现有普通 `promptText`，Negative Prompt 为空且模板字段为空。V2 到旧扁平视图的 adapter 使用：`imageSummary=summary`；`subject=主体+属性+动作`；`scene=环境+辅助元素+时间天气`；`composition/cameraLanguage/lighting/color/texture/mood` 取对应 Style DNA 文本；`styleTags/visualKeywords` 取 fingerprint tokens；`mustKeep` 取 hard invariant；`replaceable` 取内容变量默认值；fallback 映射为无 Recipe 视图。读取历史扁平 Recipe 时使用反向 legacy view adapter，不伪造 V2 evidence/confidence。V2 只持久化初始分析事实和系统输出，用户档位、锚点与草稿只进入 workspace 状态。

</frozen-after-approval>

## 验证命令

```bash
pnpm vitest --run src/lib/__tests__/visual-recipe-v2.test.ts src/lib/__tests__/prompt-composer.test.ts src/lib/__tests__/evidence-facets.test.ts src/lib/ai/__tests__/structurer.test.ts src/components/workspace/__tests__/recipe-card.test.tsx src/components/workspace/__tests__/structured-prompt-editor.test.tsx
pnpm type-check
pnpm lint
pnpm e2e -- e2e/analysis-structured-style-extraction.spec.ts
pnpm test
```

## 代码地图

- `src/types/models.ts` -- 当前扁平 `VisualRecipe`、分析任务与模板变量契约，需要增加 V2 类型和 legacy 兼容联合类型。
- `src/lib/ai/prompts.ts`、`src/lib/ai/structurer.ts` -- 当前两阶段提示和严格 JSON 校验入口，需要完成内容/风格分类、证据、置信度与 V2 校验。
- `src/lib/ai/webhook-handler.ts`、`src/app/api/analysis/route.ts` -- 同步与异步分析完成路径，必须写入相同 V2 产物和兼容字段。
- `src/lib/db/schema.ts`、`src/lib/repositories/analysis-task-repository.ts` -- `recipe` JSONB 的类型与任务持久化边界；应复用现有列，不引入新表。
- `src/lib/evidence-facets.ts`、`src/lib/prompt-provenance.ts` -- 当前派生证据和启发式置信度，需要改为 V2 数据优先并保留 legacy adapter。
- `src/lib/template-parser.ts` -- 现有确定性变量解析/替换器，应复用并补充 V2 变量与未解析标记测试。
- `src/hooks/use-workspace-state.ts`、`src/app/workspace/page.tsx` -- 工作台分析包、档位、锚点和变量草稿的状态接入与跨页面恢复。
- `src/components/workspace/reference-card.tsx`、`src/components/workspace/recipe-card.tsx` -- 当前 Reference/Style Intelligence 入口，需要移除硬编码色板/伪空间 anchor，并承载内容、Style DNA、文字证据和风格不变量。
- `src/components/workspace/prompt-card.tsx`、`src/components/workspace/unified-prompt-editor.tsx` -- 多档输出切换、确定性模板渲染、文本编辑隔离和保存来源。
- `src/lib/ai/__tests__/`、`src/lib/__tests__/`、`src/components/workspace/__tests__/`、`e2e/` -- Schema、组合器、兼容、交互和全链路回归覆盖。

## 任务清单

- [x] `src/types/models.ts`、`src/lib/visual-recipe.ts`、`src/lib/analysis-result-view-model.ts` -- 定义 V2 结构、字段上限、稳定锚点 ID、legacy adapter 和四区 view model，保证旧任务可恢复。
- [x] `src/lib/ai/prompts.ts`、`src/lib/ai/structurer.ts` -- 重写视觉观察/结构化指令并实现语义候选校验、置信度降级、ready/partial/fallback 归一化和 V2 最终组装。
- [x] `src/lib/prompt-composer.ts` -- 由结构化包和 observation 引用关系确定性生成复原 Prompt、三档模板和兼容字段，保证默认值渲染后无未解析变量且 Professional 不重复不变量内容。
- [x] `src/app/api/analysis/route.ts`、`src/lib/ai/webhook-handler.ts`、`src/lib/repositories/analysis-task-repository.ts` -- 抽取共享分析完成/降级落库逻辑，统一同步与异步 API 返回，不改变任务状态和生成接口。
- [x] `src/lib/evidence-facets.ts`、`src/lib/prompt-provenance.ts`、`src/lib/template-parser.ts` -- 接入 V2 文字证据/置信度，验证 V2 变量替换，并为 legacy Recipe 提供无伪置信度的降级视图。
- [x] `src/hooks/use-workspace-state.ts`、`src/app/workspace/page.tsx` -- 持久化当前档位、启用锚点和变量值，并隔离旧任务、新分析与手动文本草稿。
- [x] `src/components/workspace/reference-card.tsx`、`src/components/workspace/recipe-card.tsx`、`src/components/workspace/prompt-card.tsx`、`src/components/workspace/unified-prompt-editor.tsx` -- 移除伪证据视觉，实现四区信息结构、多档只读派生视图、锚点/变量联动、自定义文本克隆与 Style Memory 保存承接。
- [x] `src/lib/ai/__tests__/`、`src/lib/__tests__/`、`src/components/workspace/__tests__/`、`e2e/analysis-structured-style-extraction.spec.ts` -- 覆盖 V2 校验、组合规则、降级、legacy 恢复、编辑隔离、保存和生成请求。

## 验收标准

- [x] Given 一张信息充分的参考图, when 分析完成, then 返回 `schemaVersion: 2` 的内容/风格分层、5–10 个风格不变量、观察依据、`0–1` 置信度、内容变量默认值、九维风格指纹和完整 Prompt 输出包。
- [x] Given 结构化模型返回置信度 `0.65` 且有文字依据的 hard 候选、以及低于 `0.50` 或无依据的候选, when Validator 归一化, then 前者降为 soft、后者被丢弃并记录原因，最终状态按剩余有效核心重新计算。
- [x] Given 分析结果中的主体和场景是具体内容, when 系统形成硬风格锚点, then 主体/场景不会仅因在原图中显著而被默认固化，硬锚点描述的是可跨内容复用的构图、色彩、光影、媒介、材质或镜头规则。
- [x] Given V2 分析完成且用户未编辑任何内容, when 工作台进入 ready, then 默认选中标准模板，所有变量已有参考图默认值，Prompt 无未解析标记且 GENERATE 可用。
- [x] Given 用户在模板模式只把主体变量从 A 改为 B, when Prompt 重组, then 内容描述更新为 B，已启用的风格锚点、证据、置信度和其他默认值保持不变。
- [x] Given 已启用 hard H、soft S、额外 Style DNA D 且 optional modifier 默认关闭, when 依次组合精简/标准/专业模板, then 三者分别包含 `H`、`H+S`、`H+S+D`，字段顺序固定、排除项只进入 Negative Prompt 且全程不触发 AI 请求。
- [x] Given 三档模板原本包含蓝色色彩片段且 `primary_color` modifier 已启用并改为红色, when Prompt 重组, then 三档均在色彩位置只使用红色变量值，复原 Prompt、Recipe 和原色彩锚点开关不变；when 关闭 modifier, then 蓝色色彩片段恢复。
- [x] Given 用户停用一个风格锚点或修改变量, when 当前可复用 Prompt 更新, then 复原 Prompt、结构化 JSON 和 V2 分析事实不被改写。
- [x] Given 用户克隆当前 Prompt 为自定义文本并编辑, when 切换输出档位后再返回自定义文本, then 手工草稿保持不变且不反向更新变量、锚点或 Recipe。
- [x] Given 用户选择复原 Prompt 或任一可复用模板并点击生成, when 请求发往 `/api/generation`, then `promptText` 是当前选定输出，`negativePromptText` 是当前排除项文本，现有请求结构、轮询和结果弹窗行为不变；结构化 JSON 状态的 GENERATE 禁用并说明原因。
- [x] Given 用户查看 Style Intelligence, when 展开任一 Style DNA 结论, then 可看到结论、文字观察依据与模型置信度，参考图上不出现伪造定位；legacy Recipe 只显示无数值的旧版提示。
- [x] Given V2 归一化后标准 Prompt 可用但只有 1–4 个不变量或少于 4 个 Style DNA 维度, when API 返回分析结果, then 状态为 partial 且只展示可信项；given 标准 Prompt 无法形成, when 返回结果, then 状态为 fallback 并保留普通 Prompt、原因、编辑和生成能力。
- [x] Given 用户恢复旧分析或旧生成历史, when 记录只包含扁平 Recipe 和单份 Prompt, then 工作台可正常展示、编辑与再次生成，不要求迁移历史数据。
- [x] Given 用户调整档位、锚点、变量或自定义草稿, when 刷新当前 workspace, then 会话状态恢复；when Replace Reference, then 这些 V2 派生编辑状态全部清空。
- [x] Given 用户在模板模式或自定义文本模式保存 Style Memory, when 保存成功, then 前者保存当前可复用模板及变量默认值，后者保存当前文本为无变量模板；复原 Prompt 与结构化 JSON 状态不提供保存操作。

## 验证记录

- 2026-07-15 `pnpm vitest --run ...`：FEAT 定向测试通过（V2 Validator、composer、evidence、structurer、Recipe UI、structured prompt editor）。
- 2026-07-15 `pnpm type-check`：通过。
- 2026-07-15 `pnpm lint`：通过；仅保留仓库既有 warnings。
- 2026-07-15 `pnpm e2e -- e2e/analysis-structured-style-extraction.spec.ts --project=workspace`：3/3 通过。
- 2026-07-15 `pnpm test`：完整 Vitest 回归通过（92 files，669 tests）。
- 额外执行 `pnpm build`：编译、lint 与类型检查通过；静态生成 `/` 时被既有首页 `useSearchParams` 缺少 Suspense boundary 阻断，非 FEAT-0004 改动路径。
