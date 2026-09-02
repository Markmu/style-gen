# 15 需求调研：Viko 主流程与 Workspace 创作闭环优化

## 0. 文档说明

- **产出时间**：2026-08-30
- **研究对象**：[Viko 官网](https://viko.fun/)、Viko 官方产品文档、style-gen 当前 Workspace 可见界面与可执行代码
- **研究范围**：只聚焦“参考图进入 → 图片分析 → 提示词输出 → 图片生成 → 结果比较与继续创作”主流程，不重复评估已完成的 Iteration Memory 与第 14 期可验证 Style Memory。
- **研究目标**：识别第 14 期结束后，style-gen Workspace 下一阶段最值得建设的创作体验能力。
- **证据时点**：Viko 官方文档主要更新于 2026-07-26；本报告于 2026-08-30 再次访问其官网、产品页、定价页和主流程文档，并核对 style-gen 当前页面与代码。
- **文档定位**：本报告是后续 PRD 的研究输入，不等同于已批准需求。

### 0.1 研究方法与证据等级

| 等级 | 定义 | 本报告用法 |
| --- | --- | --- |
| A | 当前官方文档、当前产品页或本地可执行界面直接验证 | 作为当前产品事实 |
| B | 官方营销说明或演示描述 | 作为产品主张，不推断未展示细节 |
| C | 根据官方事实与 style-gen 代码作出的产品判断 | 明确标记为建议或推断 |

### 0.2 研究限制

1. 本次没有登录 Viko、没有实际扣积分提交图片，因此模型输出质量、耗时、失败率与登录后细节主要依据官方文档，不能替代同图同模型质量测试。
2. Viko 的浏览器扩展入口与 style-gen 的 Web Workspace 入口不同，本报告比较的是用户任务与交互节奏，不把入口差异直接当作功能缺陷。
3. style-gen 对照基于 2026-08-30 当前代码和 `preview=evidence-copilot` 可见状态；历史备份文档不作为当前事实。

---

## 1. 执行摘要

### 1.1 一句话结论

第 14 期已经让 style-gen 的“记忆”可信、可验证；下一阶段不应继续扩充资产库，而应建设 **Evidence-guided Render Loop（证据引导的生成闭环）**：用双速入口缩短首图时间，用创作意图而不是数据格式组织提示词，并让参考图、生成结果和对应风格规则在 Workspace 内直接比较、局部修正和再次生成。

### 1.2 本轮最重要的六个判断

1. **Viko 的主流程优势首先是节奏，而不是分析深度。** `P` 提供“先理解再生成”，`V` 提供“反推后直接出图”，用户在开始时就选择工作节奏。
2. **Viko 的提示词界面围绕创作目标组织。** 标准/高精度回答“需要多详细”，同风格变体回答“要复刻还是变化”；style-gen 当前的 Variables / Full text / JSON 更像数据表示方式。
3. **style-gen 的分析底座更适合专业创作。** 九维风格观察、文字证据、置信度、hard/soft 不变量、负向约束和提示词证据联动，比单纯自然语言解构更可审查。
4. **style-gen 已生成多档 Prompt，却没有把它们变成用户可理解的选项。** `reconstructionPrompt`、`conciseTemplate`、`standardTemplate`、`professionalTemplate` 已存在于编译层，当前 Workspace 默认只使用 `standardTemplate`。
5. **当前最大断点发生在生成结果出现之后。** 成功结果被放进阻断式弹窗，缺少参考图并排、同会话多结果、保留/淘汰语义，以及从偏差维度回到对应提示词句的修正入口。
6. **下一期应把“首图速度”和“结果修正”合成一个闭环需求。** 只增加快捷生成会放大盲试；只增加更深分析会继续拉长路径。两者需要由证据联动起来。

### 1.3 第 14 期之后，哪些旧问题已经不再是主矛盾

| 旧问题 | 当前状态 | 本轮处理 |
| --- | --- | --- |
| Iteration 只有缩略历史、无法完整回溯 | 第 13 期已补齐 Iteration Memory | 不重复建设 |
| Style Memory 缺少真实风格语义和验证依据 | 第 14 期已补齐用户验证、代表结果、保留规则和详情治理 | 不再建议另建提示词/关键词资产库 |
| 使用 Memory 后来源身份消失 | Workspace 已有 Memory Identity Bar 与来源关联 | 只要求生成结果继续保留该身份 |
| 准备状态互相矛盾 | 已有统一 Render Readiness 派生 | 后续快捷流程复用同一门控，不另建状态体系 |
| 用户不知道分析如何影响提示词 | 已有证据 facet 与 Prompt provenance 联动 | 下一步把该联动延伸到生成结果修正 |

---

## 2. Viko 当前主流程功能地图

```text
参考图进入
├── 浏览网页悬停图片
│   ├── P：只反推
│   └── V：反推并自动生成
└── 右键：反推 / 反推并生成

图片理解
├── 先判断图像类型
├── 按类型选择解构维度
│   ├── 人像：人物、动作、造型、肤调、光色、质感
│   ├── 插画：画风、线条、角色、脸部、眼睛、服装
│   ├── 海报：层级、图层、文字、图形、色彩、构图节奏
│   ├── 产品：主体、卖点、品牌情绪、材质/印刷感
│   └── 通用：类型、风格、构图、场景、细节、优先级、风险
└── 每条解构短语可保存为关键词卡

提示词输出
├── 自然语言主提示词
├── 标准精度
├── 高精度
├── 可选同风格变体提示词
├── 可直接编辑
└── 可从提示词继续生成

图片生成
├── 模型
├── 10 种画幅
├── 默认匹配参考图最接近画幅
├── 1K 输出
├── 云端任务
└── 关闭网页后仍可在 History 恢复

结果处理
├── 当前页面查看结果
├── Studio 会话画架比较当前会话结果
├── 批量 1 / 3 / 5 / 10
├── 部分成功可继续使用
├── 只补失败张数
└── Task Detail
    ├── 参考图 / 结果并排
    ├── 提示词 / 变体 / 解构 / 色卡 / 参数同页
    ├── 只修改偏离的提示词句
    └── 保存词句、提示词、作品或继续创作
```

Viko 官方将首次创作描述为：对参考图点击 `P` 得到结构化解构与可生成的自然语言提示词，再点击 Generate 选择画幅生成；点击 `V` 则跳过中间确认，直接完成“反推 + 出图”。参见[第一次创作](https://viko.fun/ja/docs/getting-started/first-creation)与[网页内生图](https://viko.fun/ja/docs/extension/generate-in-page)。

---

## 3. Viko 主流程详细拆解

### 3.1 参考图进入：先选择创作节奏

| 路径 | 用户目标 | 操作 | 中间结果 | 适用场景 |
| --- | --- | --- | --- | --- |
| P：Reverse | 先理解再决定 | 点击 P | 解构 + 主提示词，可编辑后生成 | 专业复刻、需要控制、成本敏感 |
| V：Reverse + Generate | 先看结果再调整 | 点击 V | 自动完成反推并生成 1 张 | 快速验证、低认知负担、首次体验 |

产品价值不只是少一次点击，而是用户在任务开始时明确“我要研究这张图”还是“我先要一张结果”。这避免所有用户都被迫穿过同样深度的分析界面。

### 3.2 图片分析：固定任务，动态解构语言

Viko 的[画面解构文档](https://viko.fun/ja/docs/extension/deconstruct)显示，其分析框架会根据人像、插画、海报、产品图或通用图像调整维度。这样做的主要体验收益是：用户看到的词汇与当前图像任务相关，而不是面对一套平均但抽象的统一字段。

其分析结果同时承担三个职责：

1. 解释这张图由什么组成。
2. 为自然语言提示词提供可见依据。
3. 把可复用词句拆成可收藏资产。

局限也很明确：公开文档没有展示与每条结论对应的局部视觉证据、模型置信度或 hard/soft 保持规则，因此“为什么这样判断”仍主要依赖用户相信模型输出。

### 3.3 提示词输出：按创作意图，而非结构格式切换

Viko 的[反推提示词文档](https://viko.fun/ja/docs/extension/reverse-prompt)提供两个用户容易理解的轴：

| 轴 | 选项 | 用户实际在决定什么 |
| --- | --- | --- |
| 详细程度 | 标准 / 高精度 | 是快速得到干净表达，还是覆盖机位、构图、色彩、光影、材质等细节 |
| 创作方向 | 主提示词 / 同风格变体 | 是贴近参考，还是保留核心体系同时改变少量具体维度 |

提示词保持自然语言、允许直接编辑，编辑结果会随任务保存。Viko 的优势是用户无需理解模板、变量或 JSON；不足是“变体究竟改了什么、锁住了什么”不够透明。

### 3.4 图片生成：减少低价值参数决策

Viko 在网页内生成时提供模型、画幅与 1K 输出，并默认选择最接近参考图的画幅；任务在云端执行，关闭页面后仍可从 Studio History 查看。该流程把参考图比例视为合理默认值，而不是让用户每次从 `1:1` 开始决策。

### 3.5 结果处理：结果是下一轮输入，不是流程终点

Viko 的[创作空间](https://viko.fun/ja/docs/studio/overview)与[提示词作曲器](https://viko.fun/ja/docs/studio/composer)把当前会话结果放在“会话画架”中并排查看；[任务详情](https://viko.fun/ja/docs/library/task-detail)则把参考图、结果、提示词、解构与参数放在一起。其官方建议是比较构图、姿态、光色与质感，只改偏离的提示词句，而不是重写整个提示词。

这形成了清晰循环：

```text
参考图 → 解构 → 提示词 → 结果
  ↑                         ↓
  └──── 比较偏差 ← 局部修正 ┘
```

批量任务还支持部分完成与只补失败张数，参见[失败恢复](https://viko.fun/ja/docs/studio/recovery)。这是批量能力成立后才需要建设的韧性机制，不应在单图阶段提前复制。

---

## 4. style-gen 当前 Workspace 主流程

### 4.1 当前用户路径

```text
上传参考图
→ 自动上传并自动发起分析
→ Style Intelligence 展示内容与九维风格证据
→ 用户查看/开关 Style rules，编辑变量、负向约束或完整提示词
→ Render Dock 选择画幅、质量、模型
→ 点击 Generate
→ 阻断式 Generation Dialog 等待并展示单张结果
→ Close / Regenerate
→ 底部 Recent Iterations 查看快速详情，或进入完整 Iteration Memory
→ 可把方向保存为可验证 Style Memory
```

### 4.2 当前强项

| 能力 | 当前产品价值 | 对比 Viko |
| --- | --- | --- |
| 九维 Style Profile | Visual medium、composition、camera、color、lighting、form language、material & texture、atmosphere、rendering | 更稳定、更适合跨图比较，但当前语言不随图像类型变化 |
| 文字证据与置信度 | 每条观察包含 evidence 和 model confidence | 可审查性更强 |
| Style invariants | hard/soft 规则可开关，并进入 Prompt 编译 | 比“同风格”更可控 |
| 内容与风格分离 | 主体变量与风格规则分开 | 更适合内容替换和长期复用 |
| Prompt provenance | 点击证据可定位 Prompt 中的对应表达 | 已具备局部修正的技术基础 |
| 多档 Prompt 编译 | reconstruction / concise / standard / professional | 能力已存在，但尚未转化成清晰用户选项 |
| 统一准备状态 | Prompt、变量、证据、Memory 上下文共同决定是否可生成 | 快捷流程可以安全复用 |
| Iteration + Style Memory | 执行记录与用户验证的风格资产分工明确 | 长期资产可信度高于简单提示词收藏 |

### 4.3 当前主流程断点

#### 断点 A：只有一条速度曲线

上传后一定进入自动分析，分析完成后再由用户主动生成。这个路径适合专业控制，但缺少用户预先授权的“分析完成即生成”快速路径。新用户必须先理解三栏信息架构，才能看到首张结果。

#### 断点 B：Prompt 模式是系统语言，不是创作语言

当前顶层选项为 `Variables / Full text / JSON`：

- Variables 与 Full text 是编辑方式。
- JSON 是导出/调试格式。
- 三者没有回答“我要贴近复刻还是同风格变化”“我要快速还是详细”。

同时，底层已有四种 Prompt 输出，但 Workspace 默认只消费 `standardTemplate`，用户看不到这些能力之间的差异。

#### 断点 C：默认画幅没有使用已经知道的参考图比例

页面已经获取 `referenceAspectRatio` 用于参考图布局，但生成参数仍初始化为 `1:1`。用户需要额外判断并手动切换，且很容易在不知情的情况下改变构图。

#### 断点 D：结果弹窗中断编辑上下文

生成成功后只显示单张结果以及 Regenerate / Close：

- 看不到参考图并排。
- 看不到本次锁定的不变量和改动变量。
- 看不到结果与哪条证据/提示词相关。
- 无法把多次尝试放在同一会话中横向比较。
- “Regenerate”没有先定义本轮要改变什么，容易形成盲抽。

#### 断点 E：快速历史详情仍不是创作比较界面

Workspace 内的 History Detail 展示结果、Prompt、Negative、画幅、质量和分析任务号，提供 Generate variation / Restore；但它没有在当前视图中并排展示参考图、风格规则和证据。完整信息虽然能在 Iteration Memory 找到，但离开 Workspace 会打断连续调试。

---

## 5. 主流程逐段对比

| 阶段 | Viko | style-gen 当前 | 判断 |
| --- | --- | --- | --- |
| 入口 | P / V 两种速度；浏览现场触发 | 上传后自动分析，单一路径 | Viko 更快；style-gen 控制更稳 |
| 分析组织 | 按图像类型调整语言 | 固定九维 SSOT + 证据/置信度 | style-gen 底座更强，表达可更情境化 |
| 提示词目标 | 标准/高精度，主提示词/同风格变体 | Variables/Full text/JSON | Viko 心智更直接；style-gen 可控性更强但入口技术化 |
| 提示词编辑 | 自然语言直接编辑 | 变量联动、全文编辑、JSON、证据定位 | style-gen 明显更强，但需重组层级 |
| 默认画幅 | 自动匹配最接近参考图 | 默认 1:1 | 应直接借鉴 |
| 生成过程 | 云端继续、History 同步 | 数据库异步轮询，弹窗等待 | 后端能力接近，前台表达可优化 |
| 当前会话结果 | 会话画架，可并排多结果 | 单结果弹窗 + 底部历史条 | Viko 更适合连续创作 |
| 参考/结果比较 | Task Detail 并排 | 完整 Iteration 页面可追溯，Workspace 快速详情不并排 | style-gen 信息更深，但离当前操作更远 |
| 局部修正 | 文档引导只改偏离句 | 证据与 Prompt 已可联动，尚未与结果偏差联动 | style-gen 有差异化突破机会 |
| 长期沉淀 | 词句、提示词、作品、色卡分库 | Iteration Memory + 用户验证 Style Memory | style-gen 结构更克制、可信，不应照搬多资产库 |

---

## 6. 建议的下一方向：Evidence-guided Render Loop

### 6.1 目标

让用户在 Workspace 内用最少步骤完成：

```text
选择创作节奏
→ 得到可理解的分析与提示词
→ 生成首张结果
→ 参考图与结果并排判断
→ 指出哪一维需要调整
→ 系统定位并修改对应规则/变量/提示词
→ 再次生成并比较
→ 将满意结果沉淀到既有 Iteration / Style Memory
```

核心指标不是“看了多少分析字段”，而是：**多快得到第一张可评估结果，以及用户能否说清下一轮只需要改什么。**

### 6.2 P0：双速创作入口

在用户选择参考图之前或上传确认时提供两个明确入口：

| 模式 | 建议名称 | 行为 | 约束 |
| --- | --- | --- | --- |
| 深入模式 | Analyze & edit | 沿用当前流程：分析完成后停在 Workspace，用户检查再生成 | 默认推荐给复用 Memory 或已有明确控制意图的用户 |
| 快速模式 | Quick recreate | 用户在开始时明确授权；分析完成、统一 readiness 通过后，自动用推荐设置生成 1 张 | 必须在执行前说明会产生一次生成；失败后回到可编辑状态，不循环自动重试 |

两种模式必须生成同一个 `VisualRecipeV2`、保留相同证据并进入相同 Iteration 记录。快捷模式只压缩交互，不创建简化数据分支。

### 6.3 P0：把 Prompt 顶层切换改成创作意图

建议顶层使用两个轴：

**创作意图**

- `Close reconstruction`：使用 `reconstructionPrompt`，保留参考内容与风格，用于验证分析质量。
- `Same-style creation`：使用变量化模板，默认保留已启用 invariants，允许更换主体/场景。

**表达详细度**

- `Fast`：对应 concise。
- `Balanced`：对应 standard，默认。
- `Detailed`：对应 professional。

现有 `Variables / Full text` 下沉为编辑方式；`JSON` 移到 Advanced / Export，不再占据主选择位。

这不是删除专业能力，而是先让用户决定“做什么”，再决定“怎么编辑”。

### 6.4 P0：同风格变化必须透明

不要直接复制 Viko 的单个“变体提示词”按钮。style-gen 应利用 invariants 和 variables，把变化计划写清楚：

```text
Keep
✓ soft diffused lighting
✓ muted warm-gray palette
✓ fine paper grain

Change
• Subject: ceramic bottle → running shoe
• Scene: studio tabletop → outdoor concrete platform
• Composition: keep centered / allow wider negative space
```

生成前显示 Keep / Change 摘要；点击任一项回到对应证据、规则或变量。这样既获得变体速度，又保留 style-gen 的可解释优势。

### 6.5 P0：参考图画幅作为推荐默认值

完成上传后，将图片宽高比映射到支持列表中距离最近的画幅，并显示：

`4:5 · Recommended from reference`

规则：

1. 用户本次主动选择优先于推荐。
2. 从 Iteration 恢复时使用原参数。
3. 从 Style Memory 使用但上传了新参考图时，提示是否沿用旧参数或匹配新图。
4. 无法读取尺寸时回退到上次用户设置，再回退 `1:1`。

### 6.6 P0：用 Session Result Rail 替代成功弹窗

生成进行中可以保留轻量任务状态，但成功后结果进入 Workspace 内持久的“当前会话结果轨道”，不再用阻断式成功弹窗终止编辑。

首版单次仍只生成 1 张，但允许保留本会话最近 3–5 次结果：

```text
┌ Reference ┐   ┌ Result 01 ┐  ┌ Result 02 ┐  ┌ Result 03 ┐
│            │   │ selected  │  │           │  │           │
└────────────┘   └───────────┘  └───────────┘  └───────────┘
                   [Compare] [Keep] [Use as reference] [More]
```

每张结果至少提供：

- 与参考图比较。
- 设为当前选择/keeper。
- 在当前设置上再次生成。
- 使用该结果作为新参考图。
- 保存为或更新 Style Memory 的代表结果。
- 打开完整 Iteration 详情。

“Keep”只表达当前会话选择，不自动改为 Style Memory 的用户已验证；验证仍沿用第 14 期明确确认规则。

### 6.7 P0：结果偏差 → 对应规则/提示词的局部修正

在 Reference / Result 比较视图中提供已有九维的轻量检查：

```text
What drifted?
[Composition] [Color] [Lighting] [Texture] [Atmosphere] [Other]
```

用户选中某维度后：

1. 高亮该维度的证据观察。
2. 高亮 Prompt provenance 中对应句段。
3. 展示启用的 invariant 与可编辑值。
4. 给出动作：Strengthen / Relax / Replace / Disable。
5. 生成前在 Change 摘要中说明本轮改变。

首版不要自动给整张图打“风格保持分”。先记录用户指出的偏差和修改动作，避免用不可解释的相似度分数覆盖专业判断。

### 6.8 P1：生成 2 / 4 张与部分失败恢复

在 Session Result Rail 稳定后，再增加单次数量 `1 / 2 / 4`：

- 每张结果有独立状态和 Iteration 身份。
- 成功结果立即可用，不因其中一张失败而整批失败。
- 重试只补失败张数。
- 明确展示预计生成次数/成本（若未来引入额度）。

不建议直接复制 Viko 的 10 张或游戏式揭晓。style-gen 的任务是比较证据保持，不是制造随机开卡刺激。

### 6.9 P1：固定九维之上的图像类型 Lens

保持九维 `VisualRecipeV2` 作为 SSOT，不根据图像类型改变存储契约；仅在展示层增加 Lens：

| Lens | 优先展示/重命名的观察 |
| --- | --- |
| Portrait | 姿态、肤调、镜头、光线、造型质感 |
| Poster | 信息层级、排版节奏、图形语言、色彩系统、印刷质感 |
| Product | 产品轮廓、材质、卖点聚焦、品牌氛围、布光 |
| Illustration | 线条、形状语言、角色脸部、渲染、色彩 |

Lens 只改变排序、分组和用户语言，不破坏现有证据、Prompt provenance、Iteration 与 Style Memory 兼容性。

---

## 7. 建议优先级与拆分

### 7.1 唯一推荐的下一期主题

**第 15 期建议主题：Workspace 证据引导生成闭环。**

建议作为一个内聚需求处理以下内容：

1. 双速入口与快捷生成授权。
2. Prompt 创作意图 / 详细度切换。
3. 参考图画幅推荐。
4. Session Result Rail 与参考/结果比较。
5. 结果偏差到证据/规则/Prompt 的局部修正。

这五项共同解决“更快得到首图，并能更准确地完成下一轮”的同一个用户任务。若只允许做一个更小 MVP，则优先顺序是：

```text
Session Result Rail + Reference Compare
→ 结果偏差联动证据/Prompt
→ Prompt 意图化
→ 画幅推荐
→ Quick recreate
```

原因：当前分析和生成都已可用，最大的真实浪费发生在结果出现后无法就地比较和定向修正。

### 7.2 后续阶段

| 阶段 | 能力 | 前置条件 |
| --- | --- | --- |
| 15A | Session Result Rail、参考/结果比较、局部修正 | 当前单图生成与 provenance |
| 15B | Prompt 意图化、详细度、透明 Keep/Change | 四档 Prompt 与 invariants |
| 15C | Quick recreate、自动画幅 | 统一 readiness 与显式生成授权 |
| 16 候选 | 2/4 张生成、部分失败补全 | Session Result Rail 稳定 |
| 后续候选 | 图像类型 Lens | 收集不同图像类别的真实分析样本 |

### 7.3 不建议现在做

1. 浏览器插件和网页悬浮入口：获客与场景价值高，但不是 Workspace 当前主流程的首要断点。
2. 独立关键词册、提示词册、作品集、色卡册：会与已形成的 Iteration / Style Memory 双记忆模型竞争。
3. 10 张大批量与游戏式揭晓：在比较、选择和失败恢复能力尚未建立前只会增加噪声与成本。
4. 自动风格总分：第 14 期明确不做自动审计，本期应先收集用户偏差反馈，再验证是否存在可信评分模型。
5. 动作参考：属于独立控制能力，不是当前 Reference → Evidence → Render 主链路的必要补全。

---

## 8. PRD 输入建议

### 8.1 建议问题定义

当前 Workspace 已能生成可信的风格证据和可编辑提示词，也能记录与沉淀结果；但用户在分析完成后仍需理解技术化 Prompt 模式和手动参数，生成成功后又被单结果弹窗打断，无法在当前上下文中比较参考、判断偏差、定位对应规则并完成下一轮。因此，创作闭环仍依赖反复打开历史和凭感觉改写提示词。

### 8.2 建议核心用户故事

1. 作为只想先看结果的用户，我希望在开始时授权“分析后直接生成”，同时仍能在结果出现后查看完整证据。
2. 作为需要控制复刻程度的用户，我希望选择“贴近复刻”或“同风格创作”，而不是先理解 Variables / JSON。
3. 作为从参考图开始的用户，我希望系统默认推荐最接近参考图的画幅，避免无意改变构图。
4. 作为连续调试风格的用户，我希望在 Workspace 内并排比较参考图和本会话结果，不用反复打开历史页。
5. 作为发现结果偏差的用户，我希望选择偏离的维度并直接定位对应证据、规则和提示词句，以便只改必要部分。
6. 作为得到满意结果的用户，我希望将其设为当前 keeper，并沿用第 14 期规则把它明确保存为 Style Memory 的代表结果。

### 8.3 建议成功指标

| 指标 | 定义 | 目标方向 |
| --- | --- | --- |
| Time to first evaluable result | 从完成参考图选择到第一张成功结果可比较 | 下降 |
| Analysis-ready → Generate 转化 | 分析完成后在同一会话发起生成的比例 | 上升 |
| Targeted revision rate | 再次生成前明确选择偏差维度或修改变量/规则的比例 | 上升 |
| Blind regenerate rate | 未改变 Prompt、变量、规则或参数直接再次生成的比例 | 下降 |
| In-workspace comparison rate | 成功结果后使用参考/结果比较的比例 | 上升 |
| Result-to-Memory validation | 从满意结果进入代表结果确认的比例 | 上升，但不能以自动验证冒充 |

### 8.4 需在 PRD 阶段确认的问题

1. Quick recreate 是否默认关闭，以及新用户首次是否推荐。
2. 快速模式在模型/额度可见后如何展示一次生成的预计成本。
3. `Close reconstruction` 是否允许参考图内容变量可编辑，还是保持只读复刻语义。
4. Session Result Rail 的会话边界：刷新、切换 Memory、恢复 Iteration 时如何处理。
5. keeper 是否只保存在前端会话，还是需要服务端字段；不要与 Style Memory 的 representative result 混为一谈。
6. 偏差选择首版记录到 Iteration 元数据，还是仅作为临时编辑动作。
7. `professionalTemplate` 当前与模型能力的实际输出差异是否足以作为用户可感知档位，需要用同图样本验证。

---

## 9. 结论

Viko 再次验证了一个关键规律：反推产品的价值不在于把分析字段展示得更多，而在于让分析快速进入生成、让结果快速回到可修改表达。style-gen 已经拥有更可信的证据与记忆底座，下一步应把这些底座用于创作现场：

> 不只告诉用户参考图是什么风格，还要让用户更快得到一张结果，并准确指出下一轮只需要改哪条风格规则。

因此，建议下一期从“Workspace 证据引导生成闭环”开始，而不是继续增加新的资产类型或外围入口。

---

## 10. 主要证据来源

- [Viko 产品能力](https://viko.fun/product)
- [Viko 第一次创作](https://viko.fun/ja/docs/getting-started/first-creation)
- [Viko 画面解构](https://viko.fun/ja/docs/extension/deconstruct)
- [Viko 反推提示词](https://viko.fun/ja/docs/extension/reverse-prompt)
- [Viko 网页内生图](https://viko.fun/ja/docs/extension/generate-in-page)
- [Viko 创作空间](https://viko.fun/ja/docs/studio/overview)
- [Viko 提示词作曲器](https://viko.fun/ja/docs/studio/composer)
- [Viko 失败恢复](https://viko.fun/ja/docs/studio/recovery)
- [Viko 任务详情](https://viko.fun/ja/docs/library/task-detail)
- [Viko 定价](https://viko.fun/pricing)
- style-gen 当前实现：`src/app/workspace/page.tsx`、`src/components/workspace/recipe-card.tsx`、`src/components/workspace/structured-prompt-editor.tsx`、`src/components/workspace/output-card.tsx`、`src/components/workspace/generation-dialog.tsx`、`src/components/workspace/history-detail-dialog.tsx`、`src/lib/evidence-facets.ts`、`src/lib/prompt-composer.ts`
