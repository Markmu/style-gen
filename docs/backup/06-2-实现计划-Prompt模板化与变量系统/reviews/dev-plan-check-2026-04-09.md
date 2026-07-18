# 开发计划质检报告

## 检查文档
- **架构文档**: `docs/06-1-架构文档-Prompt模板化与变量系统.md`
- **开发计划**: `docs/06-2-实现计划-Prompt模板化与变量系统/`（格式：文件夹）

## 一、继承良好的部分

| 检查项 | 状态 | 说明 |
|---|---|---|
| 核心闭环（Recipe → Template → Render） | 完整继承 | README 输入摘要完整引用，首版验证目标一致 |
| P0 范围 7 项全覆盖 | 完整继承 | T01-T04 分别承接数据持久化、保存入口、编辑器、变量插入、Drawer、加载、删除 |
| P1 预留 2 项有对应任务 | 完整继承 | 变量向导→T05，重命名/复制→T05 |
| 明确不做 7 项均未出现 | 完整继承 | 预设库/分类标签/导入导出/分享/批量/ComfyUI/版本历史 均未在任务中出现 |
| ADR-1~ADR-7 全部继承 | 完整继承 | 每条 ADR 在对应任务的实现规格或架构约束中均有体现 |
| 主流程 6 个关键节点 | 完整继承 | 保存→对话框→输入→确认→Drawer→加载→向导 全链路覆盖 |
| 关键分支 6 个场景 | 完整继承 | 变量异常警告(T04)、删除确认(T03)、名称重复409(T02)、空内容拦截(T03)、向导跳过(T05)、空状态引导(T03) |
| 前端状态机三组转移 | 完整继承 | workspace↔Dialog(modal) / workspace↔Drawer(non-modal) / workspace↔Wizard(互斥) 均在 T04/T05 中实现 |
| 模块地图 7 个模块全映射 | 完整继承 | 每个模块都有对应任务和文件清单 |
| 过度设计避免列表 7 项 | 完整继承 | 未引入模板引擎/版本表/分类体系/导入导出/共享权限/类型系统/服务端渲染 |
| 数据模型 Schema 字段对齐 | 完整继承 | PromptTemplate 9 字段与架构 7.2 完全一致 |
| ID 策略 / 命名规则 / 术语映射 | 完整继承 | ULID + camelCase(JSON)/snake_case(DB) + 术语映射表完整 |
| API 端点数量与操作 | 定整继承 | P0 四端点 POST/GET list/GET detail/DELETE 完整；P1 两端点 PUT/duplicate 在 T05 |
| 错误处理策略（8.2） | 完整继承 | 保存失败保留内容、409 同名提示、删除失败保列表、L1 超时/L2 503 分级 |
| 安全策略（8.3）6 项 | 完整继承 | 认证(auth)+归属校验(userId WHERE)+输入校验+Rate Limit(30/hr)+XSS防护+无API Key |
| 成本控制（8.4） | 完整继承 | 正确识别为纯 DB 操作无外部计费 |
| 技术栈完全复用 | 完整继承 | 无新增 npm 依赖，全部复用现有技术栈 |
| 阶段划分 Phase A/B/C | 完整继承 | A: T01+T02 / B: T03+T04 / C: T05 与架构 9.2 一致 |
| 风险缓解措施 4 项 | 完整继承 | 非法变量名/超长内容/同名多次出现/含 {{ 的值 均有应对 |
| 维度拆分合理性 | 完整继承 | T01/T02 纯 backend、T03/T04 纯 frontend、T05 integration 拆分正确 |
| 共享代码归属清晰 | 完整继承 | 类型定义(T01产→T02-T05消)、解析器(T01产→T03/T05消)、Repo(T01产→T02/T05消)、组件Props(T03产→T04消) |
| 接口契约一致性 | 完整继承 | T02 下游契约与 T03/T04 上游消费内联格式一致；T03 Props 与 T04 使用方式一致 |
| 文件修改链完整 | 完整继承 | page.tsx 被 T04(create modify) 和 T05(modify) 均标注；template-drawer.tsx 被 T03(create) 和 T05(modify) 均标注 |
| 数据流贯通 | 完整继承 | 保存/加载/删除/向导四条链路在任务交接处无断链 |

## 二、缺失或弱化的信息

### 1. 列表分页方式偏差（offset → cursor-based） [严重程度: 高]

**架构文档要求**：
> 6.2 加载模板链路步骤 2：「前端调用 `GET /api/templates?page=1&pageSize=20`」
> 7.3 API 边界列表接口 query 参数：「page, pageSize（默认 20）」

**开发计划现状**：
T02 实现规格第 5 节将列表接口改为 cursor-based 分页：
```
Query: cursor?: string (ISO 8601), limit?: number (default 10, max 50)
Response: { items: TemplateListItem[], hasMore: boolean, nextCursor: string | null }
```

**影响**：
- 架构文档明确指定 offset-based 分页（`page=1&pageSize=20`），实现计划改为 cursor-based（`cursor&limit=10`）
- 默认每页条数从 20 改为 10
- 响应格式从扁平数组 `[{...}]` 变为包装结构 `{items, hasMore, nextCursor}`
- 这是一个合理的工程改进（cursor-based 对时间序列数据更优），但**未在开发计划中记录此变更决策及原因**

**建议**：
- 在 T02 实现规格中增加一段「架构偏离说明」，解释为何从 offset-based 改为 cursor-based（如：templates 按 createdAt 倒序，cursor-based 避免偏移量漂移问题）
- 或回退为架构文档的 offset-based 方案以保持严格对齐
- 修改文件：`T02-模板API端点-backend.md` 第 5 节

### 2. 列表响应格式与架构定义不一致 [严重程度: 中]

**架构文档要求**（7.3 响应格式约定）：
> 列表：`200 [{ id, name, variableCount, createdAt }]`（不含 content）

**开发计划现状**：
T02 返回 `{ items: [...], hasMore: boolean, nextCursor: string | null }` 包装结构。

**影响**：
- 前端消费方（T03 TemplateDrawer）需要解构 `.items` 而非直接使用响应体
- 如果未来有其他消费者期望架构文档的扁平格式，会产生兼容问题
- T03 的交接上下文已正确内联了新的包装格式，所以内部不自洽风险较低

**建议**：
- 与上一项关联，若决定采用 cursor-based 方案，则此格式变更是合理配套
- 确保 T03 交接上下文中明确注明响应需要取 `.items` 字段（当前已做 ✓）

### 3. 前端埋点事件未承接 [严重程度: 中]

**架构文档要求**（8.5 可观测性 - 前端埋点）：
> 覆盖最小埋点集：`template_save_clicked`、`template_saved`、`template_loaded`、`template_deleted`、`wizard_applied`（P1）

**开发计划现状**：
5 个埋点事件中，**没有任何任务文件提及前端埋点的实现**。T03（SaveDialog/Drawer）、T04（集成）、T05（向导）的 Task 列表、实现规格、验证命令中均无埋点相关条目。

**影响**：
- 首版无法通过埋点数据分析用户行为（如模板保存率、加载率、删除率）
- 无法满足架构 8.5 定义的告警阈值判断基础（错误率统计依赖事件数据）

**建议**：
- 在 T03 的 Task 列表中增加一项：「关键操作埋点：template_save_clicked / template_saved / template_loaded / template_deleted」
- 在 T05 的 Task 列表中增加一项：「向导应用埋点：wizard_applied」
- 埋点实现方式可采用简单的 `console.log` 或统一的事件分发函数（与现有模式保持一致），不需要引入分析 SDK
- 修改文件：`T03-模板UI组件-frontend.md`、`T05-P1变量向导与增强-integration.md`

### 4. 并发目标未落地到任务验证条件 [严重程度: 低]

**架构文档要求**（2.4 成功标准 & 8.1 性能目标）：
> 首版预期并发：<= 20 个同时在线用户

**开发计划现状**：
README 输入摘要的「现有代码快照」和「架构约束」中均未显式引用此指标。没有任何任务的预期结果或验证命令中包含并发相关验证。

**影响**：
- 低。纯数据库操作的模板功能在 < 20 并发下几乎不会有性能瓶颈
- Rate Limit 实现（30 次/小时/IP）已隐式提供了过载保护
- 此指标更适合作为部署阶段的容量规划参考，而非代码层验证目标

**建议**：
- 可选择在 README「架构约束」中补充一行注释说明并发假设
- 或标记为部署阶段验证项，不计入代码层缺失
- 修改文件：`README.md` 架构约束章节（可选）

### 5. 告警规则未承接（部署/运营层 Gap）[严重程度: 低 — 不计入缺失统计]

**架构文档要求**（8.5 可观测性 - 告警）：
> 模板操作错误率连续 1 小时超过 5% 时触发告警

**开发计划现状**：
无任何任务承接告警规则配置。

**判定**：部署/运营层 Gap。告警规则通常通过监控平台（如 Grafana/Prometheus/Datadog）配置，不属于代码开发任务范畴。应用日志已在 T02 的 `log()` 函数中结构化输出，为后续告警配置提供了数据基础。

**落实阶段**：部署阶段 / 运维配置

## 三、合理扩展

| 扩展项 | 评价 |
|---|---|
| cursor-based 分页替代 offset-based | 工程上更优的选择——templates 按 createdAt 倒序游标分页避免了大数据集下的 OFFSET 性能问题；只需补充变更说明即可 |
| 内存级 Rate Limit（Map 滑动窗口） | 合理的首版方案——< 20 并发下无需 Redis，代码简洁；预留了升级路径 |
| 错误码扩展 retryable 字段 | 在架构 `{ error, code }` 基础上增加了 `retryable` 布尔字段，与现有 analysis API 的错误格式保持一致，属于合理增强 |
| Repository 分页泛型 `TemplatePaginatedResult<T>` | 泛型设计使同一分页结果类型可复用于不同投影查询，提升类型安全性 |
| T03 组件使用原生 fetch 而非 React Query | 与 workspace 页面现有模式保持一致，降低学习成本；注释中说明了原因 |
| T04 采用 overlay Drawer 方案 | 提供了 fallback 方案 B（grid 扩展为 4 列），体现工程务实态度 |
| T05 duplicateTemplate 的 copy 名称去重逻辑 | 处理了 "(copy)" → "(copy 2)" → "(copy 3)" 的边界情况，比架构文档描述更完善 |
| T01 变量解析器前后端共享 | 利用 Next.js server/client 边界对纯函数无限制的特性，避免重复实现 |

## 四、维度拆分与共享代码质量评估

| 任务 | 维度文件 | 拆分合理性 | 自包含性 | 共享代码引用 | 备注 |
|---|---|---|---|---|---|
| T01 | backend | 合理 | 是 | — | 纯数据层，无下游消费 |
| T02 | backend | 合理 | 是 | 已引用 T01 类型/Repo/解析器 | 下游契约完整内联 |
| T03 | frontend | 合理 | 是 | 已内联 T02 API 契约 + T01 解析器函数签名 | Props 接口完整定义 |
| T04 | frontend | 合理 | 是 | 已内联 T03 组件 Props 契约 + ws state 接口 | 消费侧契约完整 |
| T05 | integration | 合理 | 是 | 已引用 T01-T04 全部产出 | 跨维度协调清晰 |

## 五、增量更新质量评估

| 检查项 | 状态 | 说明 |
|---|---|---|
| in-progress/done 任务保护 | 通过 | 所有任务均为 draft，无需保护 |
| 变更记录完整性 | 通过 | 有 2026-04-09 全量重写记录，基于架构文档重新生成 |
| deprecated 任务处理 | 通过 | 无 deprecated 任务 |
| 依赖图一致性 | 通过 | T01→T02→T03→T04→T05 无悬空依赖 |
| 编号连续性 | 通过 | T01-T05 连续编号 |

## 六、任务粒度评估

| 任务 | Task 数 | 职责数 | 粒度判断 | 建议 |
|---|---|---|---|---|
| T01 | 7 | 1（Schema + Repo + 解析器 + 测试） | 合理 | — |
| T02 | 7 | 1（4 端点 + Rate Limit + 降级） | 合理 | — |
| T03 | 3 | 2（SaveDialog + Drawer） | 合理 | — |
| T04 | 7 | 1（工作区集成） | 合理 | — |
| T05 | 7 | 3（向导 UI + 增强 API + Workspace 集成） | 偏大但可接受 | P1 增强阶段，职责相关性强，暂不拆分 |

## 七、跨任务交接完整性

| 共享概念 | 涉及任务 | 交接状态 | 说明 |
|---|---|---|---|
| PromptTemplate / TemplateVariable 类型 | T01(产) → T02/T03/T04/T05(消) | 完整 | 每个消费方均在交接上下文中引用 T01 |
| template-parser.ts（extractVariables/replaceVariables/hasVariables） | T01(产) → T03/T05(消) | 完整 | T03/T05 交接上下文均内联函数签名 |
| API 端点契约（POST/GET/DELETE） | T02(产) → T03/T04(消) | 完整 | T03/T04 均内联完整的请求/响应格式 |
| TemplateSaveDialogProps / TemplateDrawerProps | T03(产) → T04(消) | 完整 | T04 交接上下文内联完整 Props 接口 |
| workspace state (promptText/setPromptText) | 现有代码(产) → T04(消) | 完整 | T04 引用 use-workspace-state.ts |
| page.tsx | T04(modify) + T05(modify) | 完整 | T05 文件清单标注 page.tsx 为 modify |
| template-drawer.tsx | T03(create) + T05(modify) | 完整 | T05 文件清单标注为 modify |
| PUT/duplicate API 契约 | T05 自产自消 | 完整 | 新增端点契约在 T05 内部一致 |

## 八、部署/运营层 Gap（不计入缺失统计）

| 架构要求 | 说明 | 落实阶段 |
|---|---|---|
| 并发 <= 20 用户容量规划 | 纯 DB 操作，< 20 并发无压力 | 部署阶段验证 |
| 错误率 > 5% 告警规则 | 需监控平台配置阈值和通知渠道 | 运维配置阶段 |
| PostgreSQL 存储成本 <$0.01/月 | 无需特殊控制策略 | 运营观察 |

## 九、总结

06 实现计划整体质量**良好**，架构文档的核心闭环、P0/P1 范围、7 条 ADR、状态机、模块职责、数据模型、安全策略等关键信息均被完整继承。维度拆分合理，共享代码归属清晰，跨任务交接无断链。

主要发现 **1 项高优先级问题**（分页方式偏差）、**2 项中优先级问题**（响应格式差异、前端埋点缺失）、**2 项低优先级建议**（并发目标、告警规则）。其中分页方式从 offset-based 改为 cursor-based 属于**合理的工程改进**，仅需补充变更说明即可将严重程度降为"合理扩展"。

## 十、Contract 预检

| 检查项 | 状态 | 说明 |
|---|---|---|
| README 状态枚举 | 通过 | `review_ready` ∈ {draft, review_ready, in_execution, in_review, accepted, released} |
| 任务状态枚举 | 通过 | 全部 `draft` ∈ {draft, ready-to-dev, in-progress, review, done, deprecated} |
| 步骤状态枚举 | 通过 | 全部 `todo` ∈ {todo, done, waived} |
| waived 原因完整性 | 通过 | 无 waived 步骤 |
| README 必备章节 | 通过 | 9 个章节全部存在（概览/输入摘要/模块地图/依赖图/阶段摘要/任务总览/未决策项/执行前置/变更记录） |
| 任务文件必备章节 | 通过 | T01-T05 均 11 个章节齐全 |
| 状态一致性 | 通过 | README 任务总览 `(draft)` 与各任务文件 `status: draft` 一致 |

**继承完整度**：**92%**

**优先补充建议**（按影响排序）：

1. **[必须]** 在 T02 中补充分页方式变更说明（offset → cursor-based 的原因），或将默认 limit 从 10 调整为 20 以对齐架构文档
2. **[建议]** 在 T03/T05 的 Task 列表中各增加 1 项前端埋点任务（覆盖架构 8.5 定义的 5 个事件）
3. **[可选]** 在 README 架构约束中备注并发假设 <= 20 用户
