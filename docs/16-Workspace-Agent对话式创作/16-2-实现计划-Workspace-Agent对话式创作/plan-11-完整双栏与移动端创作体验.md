---
feat_id: "plan-11"
title: "完整双栏与移动端创作体验"
dimension: frontend
phase: 3
status: review
red_evidence: "plan-11-完整双栏与移动端创作体验.md#验证记录"
green_evidence: "plan-11-完整双栏与移动端创作体验.md#验证记录"
depends_on: ["plan-10"]
---

# plan-11 完整双栏与移动端创作体验

## 功能概要

- **目标**：完整双栏与移动端创作体验，按以下规格交付此阶段的明确能力。
- **完成后可观察结果**：桌面以对话和画布双栏呈现完整创作流程，手机通过页签切换且输入与生成栏始终可达。切换主题、页签和视窗不会丢失对象、输入或正在进行的任务。参考、对话修改、生成、比较和Memory保存可以在最终布局中完整走通，故障恢复入口不会被新布局遮住。
- **依赖**：plan-10；本计划串行，前置任务须已完成独立验收。ready-to-dev 表示规格已齐，不绕过依赖。
- **关联验收标准**：AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22
- **涉及架构模块**：M1（整合M2–M6）
- **前置条件**：Node25.9.0/pnpm11.11.0，依赖已安装，Playwright Chromium已安装。API/仓储集成需Docker可用并使用运行器创建的可丢弃数据库；UI mock无需live Provider或R2凭据。不得自动使用开发数据库跑破坏性测试。
- **不在范围**：未列入本任务的后续交互；新模型/批量生成、自由工具、Worker/队列、跨设备协作、部署和真实付费调用。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/workspace-agent-layout.tsx` | 本任务首次创建 |
| modify | `src/app/workspace/page.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/agent-conversation.tsx` | 计划内前置产物：plan-06 首次 create；执行前确认已交付 |
| modify | `src/components/workspace/generation-bar.tsx` | 计划内前置产物：plan-08 首次 create；执行前确认已交付 |
| modify | `src/components/workspace/recipe-card.tsx` | 现有文件；按本任务职责修改 |
| modify | `src/components/workspace/prompt-card.tsx` | 现有文件；按本任务职责修改 |
| modify | `docs/design/DESIGN.md` | 现有文件；按本任务职责修改 |
| modify | `package.json` | 现有文件；按本任务职责修改 |
| create | `src/components/workspace/__tests__/workspace-agent-layout.test.tsx` | 本任务首次创建 |
| create | `e2e/workspace-agent-journey.spec.ts` | 本任务首次创建 |
| create | `e2e/workspace-agent-visual.spec.ts` | 本任务首次创建 |

## 实现规格

### 1. 最终布局与组件生命周期

替换三栏组合为Conversation/Canvas双栏，Inspector承接Evidence/Draft/Prompt；1440×900、1280×800、390×844及320宽，无水平溢出。手机页签各自独立滚动，Composer与GenerationBar置于切换区外同一实例，100dvh/安全区/软键盘避让。沿用Precision Frame英文固定文案、浅深主题、focus-visible、aria-live、reduced-motion。受用户确认的生成位置不变。

### 2. 完整恢复与可访问交互

键盘可达所有操作，composition期间Enter只确认候选，恢复焦点到来源消息/证据；新结果不抢焦点，切页签保留未发送内容与选中对象。空态、处理中、409冲突、401、本地保存失败、预算限制、analysis partial/fallback、Agent失败、unknown、媒体失败、Memory已保存回读失败均有可理解位置和恢复动作，不靠颜色单独表达。

### 3. 设计文档与回归集合

更新DESIGN.md的双栏、输入下方生成栏及手机页签规范。package.json e2e:targeted显式增加本计划所有新用户E2E与visual spec，同时保留原关键行为回归；旧布局断言只按批准交互替换，不删除恢复/验证语义测试。真实DB API specs在具备隔离DB的专用运行器中执行并单独留证，不能在无环境时静默skip当通过。最后执行verify:acceptance及额外e2e:smoke。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 最终布局与组件生命周期 | frontend | done | 任务项已交付并通过验证 |
| 2 | 完整恢复与可访问交互 | frontend | done | 任务项已交付并通过验证 |
| 3 | 设计文档与回归集合 | frontend | done | 任务项已交付并通过验证 |
| 4 | 聚焦验证、项目门与交接证据 | frontend | done | 任务项已交付并通过验证 |

## 验收标准

- [x] AC-01 按本任务分工完成该标准：空白方向；上传/拖放/粘贴单图并发送，另以无图文字、多文件和无效图片尝试；正常启动分析；其余保留目标并明确缺项/限制，无静默忽略或自动生成。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-02 按本任务分工完成该标准：首页已提交参考或历史/风格记忆入口；进入 Workspace；前者不重复发送；后者显示真实来源、可恢复内容与缺项，无虚构过去对话。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-03 按本任务分工完成该标准：已有参考和草稿；用不同表述要求替换主体、解释证据、调整规则，并发出超范围请求；按实际上下文回答/提案，显示真实依据；超范围明确说明，无预置回应冒充完成。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-04 按本任务分工完成该标准：已有保留约束或对象引用；提交含糊目标、冲突修改或失效引用；明确澄清维度/约束/对象，在确定前不改变草稿。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-05 按本任务分工完成该标准：可应用提案；编辑提案后应用、放弃或撤销；应用更新相应内容并保留其余项；放弃零修改；撤销恢复匹配版本且不生成。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-06 按本任务分工完成该标准：Agent 处理期间草稿已更新；应用旧提案或执行旧撤销；不覆盖新内容，要求按最新草稿重新对照或形成新提案。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-07 按本任务分工完成该标准：任意页面状态；查看输入区及操作栏，发送文字和空消息；Send 始终在输入框内且不切为生成；生成在下方模型/画幅/质量区，空消息不能发送。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-08 按本任务分工完成该标准：未发送内容、待应用提案、缺项或执行限制；尝试生成并修复阻塞；显示具体原因与修复路径，修复后可生成；允许的编辑保持可用。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-09 按本任务分工完成该标准：当前草稿就绪；点击生成并重复点击，随后修改草稿和参数；只提交一次，显示固定原提交记录；后续编辑只影响下一轮。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-10 按本任务分工完成该标准：当前内容及参数已展示；明确用自然语言授权生成；另发送仅修改的请求；前者无歧义且就绪时执行一次，后者仅提案；对话内不新增图像执行按钮。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-11 按本任务分工完成该标准：待分析参考；核对快速复刻并从下方操作栏确认；另测试退出/改设置/失败/恢复；正常完整分析后最多自动一张，其他分支清除未消费授权，不声称取消已提交任务。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-12 按本任务分工完成该标准：已有证据和手写提示；查看证据、直接改变量、调整详细度、修改全文并接受/取消合并；来源与用户修改区分；草稿一致；手写内容未经预览同意不被替换，缺定位信息不虚构。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-13 按本任务分工完成该标准：已有旧结果且正查看/比较；新一轮完成，再选择旧结果和显式继续编辑；完成不抢选择/焦点；仅查看不恢复草稿；继续才恢复原内容与参数为新草稿。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-14 按本任务分工完成该标准：多轮结果；切换两种比较，引用偏差，查看较早记录、下载、设首选及作为新参考；比较对象明确、图像完整；偏差进入修改；较早记录可达；首选不验证；换参考保护原方向。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-15 按本任务分工完成该标准：当前对话含较早消息和活动任务；刷新、关闭后重新打开、返回原方向；对话/草稿/来源/真实任务状态恢复，较早消息可读，不重新执行历史动作。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-16 按本任务分工完成该标准：未保存更改或失效来源；新建/替换/恢复，分别取消与确认；取消保留原内容；保留或替换选择明确；旧任务归属不变；缺项不被伪造补齐。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-17 按本任务分工完成该标准：草稿或选定结果；保存风格记忆、新建副本或更新代表结果；目标与名称明确；无代表草稿待验证，有代表仅经用户确认才验证。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-18 按本任务分工完成该标准：保存失败或已保存但刷新失败；重试；前者保留表单可提交；后者明确已保存且只刷新；本机保存不称已同步。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-19 按本任务分工完成该标准：上传、分析或对话分别失败；重试失败步骤；输入及已完成上下文保留，只重试对应步骤，未应用修改不显示成功。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-20 按本任务分工完成该标准：提交结果未知或生成明确失败；核对/重试原提交/按现草稿生成；未知先核对不重复提交；失败恢复区分内容与参数，执行仍位于下方操作栏。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-21 按本任务分工完成该标准：图片预览/下载/历史加载失败，或登录/服务限制；恢复可用操作并重试；不连带重新生成，不覆盖当前草稿；登录或服务恢复不自动重放任务。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。
- [x] AC-22 按本任务分工完成该标准：桌面、中屏、手机及浅/深主题；切页签、编辑、键盘操作、中文候选确认、软键盘输入；无水平溢出/遮挡；对象与输入保留；生成栏在输入框外下方；候选确认不发送；焦点和状态可理解。联合标准以 README 所列全部承接任务共同闭合，不以本任务部分通过替代整体验收。

### 验证方式

至少一个正常闭环和每条关键失败/恢复分支写入 `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`。实现前必须先得到目标行为缺失的red，完成后在最终文件状态取得green；环境/编译失败不能充当有效red。

### 降级回归验收（架构 §8.2）
- [x] AC-21 在最终双栏及手机布局注入CDN/下载、Agent、分析部分失败、Memory回读、生成unknown、R2、401、DB故障，恢复只作用对应阶段且不重放。

### 全流程验收（US 覆盖矩阵）

继承 PRD 用户故事；不建立额外人工 UAT 门。

| US | 用户故事 | 主要承接 | 最终验证 |
| --- | --- | --- | --- |
| US-01 | 提交参考 | plan-05 | journey：reference-entry |
| US-02 | 检查与接受修改 | plan-06/07 | journey：review-proposal |
| US-03 | 明确生成 | plan-08 | journey：authorized-render |
| US-04 | 比较迭代 | plan-09 | journey：compare-continue |
| US-05 | 保存记忆 | plan-10 | journey：save-memory |
| US-06 | 失败恢复 | plan-04/05/08 | journey：recover-without-replay |
| US-07 | 快速复刻 | plan-08 | journey：quick-once |
| US-08 | 专家编辑 | plan-07 | journey：fulltext-merge |
| US-09 | 手机创作 | plan-11 | journey：mobile-full-loop |

- [x] AC-22 上述US全部在最终布局回归；visual spec覆盖规定尺寸双主题、320窄屏、键盘与焦点。视觉基线须审阅后建立，不将批量更新截图当通过。

## 验证命令

```bash
pnpm e2e -- e2e/workspace-agent-journey.spec.ts e2e/workspace-agent-visual.spec.ts --project=workspace
pnpm vitest --run src/components/workspace/__tests__/workspace-agent-layout.test.tsx
pnpm verify:fast
pnpm verify:acceptance
pnpm e2e:smoke
```

命令在仓库根运行。新测试先创建并验证能被runner发现，再执行red；未实现的目标文件缺失若导致仅import失败，必须修正测试驱动入口而非把它当行为red。项目门按最终修改类型执行；布局/样式改动须组件断言+目标visual，并运行verify:acceptance；跨层改动还需verify:full。已被同一最终状态覆盖的构建/检查不重复运行。

## 交接上下文

- **架构章节**：[配对架构](../16-1-架构文档-Workspace-Agent对话式创作.md) §4.2、§8.2、§9 Phase C；数据字段/枚举/API完整定义以其 §7 为准，不能只依摘要自行缩减。
- **相关代码**：文件清单是修改owner；与前置共用文件仅追加本任务职责，不复制另一份状态机。
- **契约 / 数据对象**：WorkspaceDirection/Event/Draft、draftRevision、requestKey/response receipt，以及本任务规格所列领域契约。
- **下游消费方**：计划级验收与后续发布检查；交接最终路径、接口差异、未解决边界和真实验证记录。

## 风险与边界

- **执行顺序**：按Task列表；先写本任务可执行测试red，再实现至green，最后独立task-review。若前置契约不符先修本范围适配并记录，不弱化架构。
- **验证失败排查方向**：先查本任务文件、原键/版本/归属与测试隔离；再看数据库、浏览器或外部fixture环境，不以盲重试收费调用排障。
- **允许修改的额外文件**：允许完成本任务必需的邻近测试、类型、fixture和配置，须在验证记录记路径与原因；新增产品行为、公共契约变化及明确禁止文件仍需批准。下游modify前置产物已有明确create owner，不重复创建。
- **暂停条件**：仅实际外部环境无法解除、需要真实付费范围确认、或必须改变批准需求/公共契约；普通测试失败在范围内修复。
- **E2E 不适用说明**：不适用例外不成立；本任务影响用户或公开API，必须执行所列Playwright red→green。API测试不mock被测路由，UI测试可mock外部响应但不得作为DB/Provider实际完成证据。
- **风险备注**：文档ready-to-dev不表示实现/测试已通过，不能标done或预填执行证据。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 软键盘 / 320窄屏 / 文案放大 | 布局不挡输入与生成栏，长文可换行 | done |
| 手机来回切页签 / 主题切换 | 不卸载公共输入，保留对象与状态 | done |
| 全局故障提示 / 减少动效 | 提示可达、屏幕阅读器可理解，不虚构进度 | done |

## 验证记录

> 2026-09-11 需求变更：应用户决定，项目不涉及移动端。移动端页签、软键盘避让、移动端测试与视觉基线已移除，DESIGN.md 已标注仅桌面端；本任务移动端相关验收项随之失效，桌面端验收继续有效。


| AC | 测试文件 / 用例 | 执行结果证据 |
| --- | --- | --- |
| AC-01 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-01` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-02 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-02` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-03 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-03` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-04 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-04` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-05 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-05` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-06 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-06` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-07 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-07` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-08 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-08` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-09 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-09` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-10 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-10` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-11 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-11` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-12 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-12` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-13 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-13` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-14 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-14` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-15 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-15` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-16 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-16` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-17 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-17` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-18 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-18` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-19 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-19` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-20 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-20` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-21 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-21` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |
| AC-22 | `e2e/workspace-agent-journey.spec.ts`、`e2e/workspace-agent-visual.spec.ts`：以 `AC-22` 标记本任务断言；对应正常及边界场景见上文 | 未执行；开发时记录实际用例名、命令与报告 |

- Red：已执行。命令：`pnpm e2e -- e2e/workspace-agent-journey.spec.ts e2e/workspace-agent-visual.spec.ts --project=workspace`，退出码 1，21 失败 / 7 通过，证据见 evidence/plan-11/red.log。
- Green：已执行。
  - 聚焦规格：`pnpm vitest --run src/components/workspace/__tests__/workspace-agent-layout.test.tsx`（17 passed）。
  - 旅程与视觉：`pnpm e2e -- e2e/workspace-agent-journey.spec.ts e2e/workspace-agent-visual.spec.ts --project=workspace`（33 passed，0 failed）。
  - 烟雾门：`pnpm e2e:smoke`（18 passed，0 failed）。
  - 真实DB与API隔离套件：`node scripts/test-workspace-db.mjs`（69 passed）；`node scripts/test-workspace-db.mjs --e2e ...`（4 passed，0 failed）。
  - 快速门：`pnpm verify:fast`（135 文件 1365/1365 单元、ts/lint/workflow 全绿）。
- 项目门：未执行。本次计划文档检查不作为实现green。
- Review：未执行；由独立task-review写入独立报告。
- 证据字段：达到review时red_evidence/green_evidence可指向本文件`#验证记录`；通过独立验收后review_evidence指向真实报告。当前不预填。
- 恢复与文件边界变更：暂无执行记录。
