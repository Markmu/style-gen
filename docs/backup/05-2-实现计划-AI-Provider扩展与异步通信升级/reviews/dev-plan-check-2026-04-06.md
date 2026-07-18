# 开发计划质检报告

## 检查文档

- 架构文档：`docs/05-1-架构文档-AI-Provider扩展与异步通信升级.md`
- 开发计划：`docs/05-2-实现计划-AI-Provider扩展与异步通信升级/`（格式：文件夹）

## 一、继承良好的部分

| 检查项 | 状态 | 说明 |
|---|---|---|
| 核心闭环描述 | 完整继承 | README 2.1 完整复述 Reference → Recipe → Render 闭环和两项技术升级目标 |
| P0 范围覆盖 | 完整继承 | 5 项 P0 范围均有任务承接（T01-T06） |
| 明确不做项 | 完整继承 | README 2.4 逐条列出 5 项禁止引入的内容，与架构 2.3 + 5.3 完全对齐 |
| ADR-1 Provider 接口抽象 | 完整继承 | T01 接口定义与架构 7.2 完全一致（discriminated union 返回类型） |
| ADR-2 Webhook 异步接收 | 完整继承 | T04 实现签名验证 + 回调处理；T05/T06 实现 5 分钟超时定时器 |
| ADR-3 前端保留轮询 | 完整继承 | 无前端任务，轮询机制不变 |
| ADR-4 分析链路异步化 | 完整继承 | T05 明确区分 sync/async 双分支，Webhook 处理中串接 Gemini 结构化 |
| ADR-5 Webhook 安全 | 完整继承 | T04 实现签名验证 + URL query 参数传递 taskType/taskId |
| 主流程节点覆盖 | 完整继承 | 架构 4.1 主流程的每个节点均有对应任务 |
| 关键分支覆盖 | 完整继承 | Webhook 超时、Provider 切换、分析/生成失败三种分支均有任务承接 |
| 前端状态机 | 完整继承 | 架构声明"无变更"，计划未新增前端任务，隐式保持一致 |
| Schema 字段对齐 | 完整继承 | T02 新增字段与架构 7.2 AnalysisTaskChanges/GenerationTaskChanges 一一对应 |
| API 端点对齐 | 完整继承 | 5 个现有端点 + 1 个新增 Webhook 端点，与架构 7.3 完全匹配 |
| Provider 接口签名 | 完整继承 | T01 types.ts 中 VisionProvider/ImageGenProvider 接口与架构 7.2 Schema 完全一致 |
| 状态枚举一致 | 完整继承 | pending→processing→completed/failed 不变；Webhook 幂等性（终态不可变）在 T04 体现 |
| L3 降级策略 | 完整继承 | T04 分析回调中结构化失败时降级返回原始文本 + errorStage: llm |
| Webhook 幂等性 | 完整继承 | T04 处理前检查终态，终态直接返回 200 |
| 技术栈选型 | 完整继承 | T03 安装 replicate SDK，其余保持 01-1 技术栈不变 |
| 阶段划分对齐 | 完整继承 | Plan Phase A/B/C 与架构 9.2 阶段范围对齐 |
| 风险缓解 | 完整继承 | 架构 8.6 四项风险在 T04/T05/T06/T07 中均有对应缓解措施 |
| 命名规则 | 完整继承 | provider 枚举值、externalId、Webhook 端点路径均与架构 7.6 一致 |
| 超时配置 5 分钟 | 完整继承 | T05/T06 超时定时器明确使用 `5 * 60 * 1000` |
| Webhook 处理 30s 窗口 | 完整继承 | T04 边界场景注明"Webhook 处理应在 30s 内完成" |

## 二、缺失或弱化的信息

### 1. 成功标准中完成率指标未在验证条件中量化引用 [中]

**架构文档要求**（2.4 成功标准）：
- Replicate 默认配置下分析完成率 >= 95%
- Replicate 默认配置下生成完成率 >= 95%

**开发计划现状**：T07 的全链路验证检查清单只有功能性 checkbox（如"Webhook 回调后任务变为 completed"），未引用 95% 完成率作为定量验收指标。README 输入摘要中也未列出这两项指标。

**建议**：在 `T07-端到端验证-integration.md` 的全链路验证检查清单中增加统计验证项，例如"连续提交 N 次分析任务，completed 比例 >= 95%"。或至少在 README 2.1 输入摘要中完整列出架构定义的 5 项成功标准原文，证明已感知。

### 2. 性能耗时目标未在任务验证中显式引用 [低]

**架构文档要求**（8.1）：
- Replicate 分析耗时 <= 60 秒
- Replicate 生成耗时 <= 120 秒

**开发计划现状**：T05/T06 设置了 5 分钟超时兜底，但 60s/120s 的预期耗时目标未在任何任务的预期结果或验证条件中引用。T07 的全链路验证也未检查实际耗时是否在预期范围内。

**建议**：在 `T07-端到端验证-integration.md` 的全链路验证检查清单中增加耗时观察项，例如"分析链路实际耗时 <= 60s（含 Webhook 回调 + 结构化）"。这不需要自动化断言，但应作为手动验收的观察指标。

### 3. Rate Limit 规则未在计划中显式声明保持不变 [低]

**架构文档要求**（8.3）："保持原有限流策略不变（上传 10 次/小时，分析 10 次/小时，生成 20 次/小时）"

**开发计划现状**：README 2.4 架构约束中列出了 5 项"不引入/不做"，但未提及限流策略保持不变。T05/T06 改造 API 路由时也未在"不在范围"中声明"限流逻辑不变"。

**建议**：在 README 2.4 架构约束中追加一条："保持现有 Rate Limit 策略不变（上传 10/h，分析 10/h，生成 20/h）"。这是防御性声明，避免执行者在改造 API 时无意修改限流逻辑。

## 三、合理扩展

| 扩展项 | 评价 |
|---|---|
| `findByIdInternal()` 函数（T02） | 合理。Webhook 回调无 userId 上下文，需要不校验 userId 的查询函数。架构隐含此需求但未显式提出 |
| `buildWebhookUrl()` 可配置 baseUrl（T05） | 合理。`WEBHOOK_BASE_URL` 环境变量解决开发环境 ngrok 需求，架构未显式提到但是实际必要 |
| `webhook-utils.ts` 共享模块（T06） | 合理。T05/T06 复用 `buildWebhookUrl` 和 `startTimeoutTimer`，避免代码重复 |
| Provider 切换集成测试（T07） | 合理。架构未要求此测试但对验证 ADR-1 的正确性有价值 |
| `.env.example` 更新（T07） | 合理。补充文档化新增环境变量 |
| T01 工厂 Replicate 分支先 throw（T01） | 合理。允许 T01 独立验证而无需等待 T03，渐进式集成 |

## 四、维度拆分与共享代码质量评估

| 任务 | 维度文件 | 拆分合理性 | 自包含性 | 共享代码引用 | 备注 |
|---|---|---|---|---|---|
| T01 | backend | 合理（service 模块） | 是 | — | 提供 Provider 接口供 T03/T05/T06 消费 |
| T02 | backend | 合理（data 模块） | 是 | — | 提供 Schema + Repository 供 T04/T05/T06 消费 |
| T03 | backend | 合理（service 模块） | 是 | 交接上下文引用 T01 types.ts | — |
| T04 | backend | 合理（service 模块） | 是 | 交接上下文引用 T02 findByIdInternal | — |
| T05 | backend | 合理（service 模块） | 是 | 引用 T01 工厂 + T02 repository | — |
| T06 | backend | 合理（service 模块） | 是 | 引用 T05 共享 webhook-utils | — |
| T07 | integration | 合理（跨模块验证） | 是 | 消费所有上游任务产出 | — |

维度拆分基于架构模块类型判断，无硬编码目录约定。全部 backend 模块为 service/data 类型，T07 为 integration 类型，无需 frontend 维度（架构明确前端不变）。

## 五、增量更新质量评估

不适用 — 首次生成，无增量更新。

## 六、任务粒度评估

| 任务 | Task 数 | 文件数 | 粒度判断 | 建议 |
|---|---|---|---|---|
| T01 | 6 | 5 | 合理 | — |
| T02 | 6 | 4 | 合理 | — |
| T03 | 6 | 5 | 合理 | — |
| T04 | 7 | 3 | 合理 | — |
| T05 | 9 | 2 | 合理（覆盖 sync/async 双路径） | 接近上限但职责聚焦于单一 API 改造 |
| T06 | 9 | 2 | 合理（同 T05） | 接近上限但职责聚焦于单一 API 改造 |
| T07 | 5 | 5 | 合理 | — |

无任务超过 10 步上限。T05/T06 各 9 步但职责聚焦于单一 API 路由的双模式改造，不建议拆分。

## 七、跨任务交接完整性

| 共享概念 | 涉及任务 | 交接状态 | 说明 |
|---|---|---|---|
| VisionProvider / ImageGenProvider 接口 | T01(create) → T03/T05/T06(consume) | 完整 | T01 提供契约摘要，T03/T05/T06 交接上下文均引用 |
| Schema 新增字段 + findByIdInternal | T02(create) → T04/T05/T06(consume) | 完整 | T02 提供契约摘要含完整函数签名 |
| Webhook URL 格式 | T04(define) → T05/T06(construct) | 完整 | T04 交接上下文明确 URL 格式，T05/T06 的 buildWebhookUrl 与之一致 |
| buildWebhookUrl + startTimeoutTimer | T05(create) → T06(consume) | 完整 | T06 交接上下文明确引用 `@/lib/ai/webhook-utils`，T06 允许修改该文件 |
| providers/index.ts | T01(create) → T03(modify) | 完整 | T03 文件清单标注 modify，交接上下文引用 T01 |

无数据流断链或交接缺口。

## 八、部署/运营层 Gap（不计入缺失统计）

| 架构要求 | 说明 | 落实阶段 |
|---|---|---|
| 日预算上限 $50 | 需 Replicate 平台 Spend Limit + 外部监控 | 部署阶段 |
| 首版并发 <= 20 用户 | 灰度阶段控制，非代码层实现 | 部署阶段 |
| L2 降级（运维手动切换环境变量） | 需重新部署/重启，非代码实现 | 运营 SOP |
| Replicate Spend Limit 配置 | 架构 8.4 建议同时配置，需在 Replicate 控制台操作 | 部署阶段 |

## 九、总结

本实现计划对架构文档的继承质量 **优秀**。7 个逻辑任务完整覆盖了架构文档定义的所有模块、运行链路和 ADR 约束。Provider 接口定义与架构 Schema 完全一致，Webhook 安全机制（签名验证 + 幂等性 + 超时兜底）覆盖完整，备选 Provider（Gemini/fal.ai）的同步链路保留逻辑清晰。

发现 1 个中等优先级弱化项（成功标准完成率未量化引用）和 2 个低优先级弱化项（耗时目标未显式引用、Rate Limit 保持不变未声明）。均可通过小幅修补解决，不影响开发计划的可执行性。

## 十、Contract 预检

| 检查项 | 状态 | 说明 |
|---|---|---|
| README 状态枚举 | 通过 | `review_ready` ∈ plan.readme_frontmatter_status |
| 任务状态枚举 | 通过 | 所有任务文件 `ready-to-dev` ∈ plan.task_file_status |
| 步骤状态枚举 | 通过 | 所有 Task 列表步骤使用 `todo`；边界场景使用 `todo` / `waived` |
| waived 原因完整性 | 通过 | T02 唯一 `waived` 项"开发阶段本地 DB，不涉及超时"已写明原因 |
| 状态一致性 | 通过 | 所有文件 `ready-to-dev` 状态下 Task 步骤均为 `todo`，无矛盾 |
| README 必需章节 | 通过 | 9 个必需章节全部存在 |
| 任务文件必需章节 | 通过 | 所有 T*.md 文件包含 11 个必需章节（含边界场景检查） |

**继承完整度**：约 95%

**优先补充建议**（按影响排序）：

1. 在 T07 或 README 中引入成功标准的定量完成率指标（95% 分析/生成完成率）
2. 在 README 2.4 架构约束中追加 Rate Limit 保持不变的声明
3. 在 T07 全链路验证中增加耗时观察项（分析 <= 60s，生成 <= 120s）
