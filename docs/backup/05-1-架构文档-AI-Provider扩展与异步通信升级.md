---
workflow_type: arch-gen
status: done
last_step: 6
completed_steps: [step1, step2, step3, step4, step5, step6]
input_documents: [05-0-需求设计-AI-Provider扩展与异步通信升级.md]
open_questions: []
---

# 架构设计文档：AI Provider 扩展与异步通信升级

_本文件只保留当前版本真正影响实现的架构决策、边界和契约；DDL、目录树、环境变量、实施故事等内容默认不放入正文。_

## 1. 系统摘要

在已有 **Reference → Recipe → Render** 核心闭环基础上，完成两项技术升级：① 视觉分析和图像生成引入 Replicate 作为可配置的默认 Provider；② 后端通过 Replicate Webhook 异步接收结果，释放服务端长连接占用。

核心变更锚点：**Provider 可切换 + Webhook 异步接收**

前端通信方式不变，仍使用 React Query 轮询任务状态。本次属于现有功能的技术迭代，不改变用户操作流程和业务模型，不新增领域对象。

## 2. 范围、非目标与成功标准

### 2.1 P0 范围

- 视觉分析阶段支持 Replicate Provider，设为默认
- 图像生成阶段支持 Replicate Provider，设为默认
- 通过环境变量配置项可分别切换回 Gemini（视觉分析）和 fal.ai（图像生成）
- 新增 Webhook 端点接收 Replicate 异步回调，更新任务状态
- 回调超时自动标记任务失败

### 2.2 P1 预留

- 前端展示更细粒度进度信息（如生成进度百分比）

### 2.3 明确不做

- 结构化整理阶段的 Provider 切换（仍用 Gemini）
- SSE / WebSocket 等长连接实时推送（保留轮询）
- 自动降级机制（某 Provider 失败自动切换到备选）
- 前端界面上的 Provider 选择
- 多 Provider 注册中心 / 动态发现

### 2.4 成功标准

| 指标 | 首版目标 |
| --- | --- |
| Replicate 默认配置下分析完成率 | >= 95% |
| Replicate 默认配置下生成完成率 | >= 95% |
| 切换为 Gemini/fal.ai 后功能正常 | 100% |
| 回调超时场景任务标记失败 | 100% |
| 前端轮询检测到结果延迟 | <= 轮询间隔（分析 2s / 生成 3s） |

## 3. 关键架构决策（ADR）

### ADR-1：Provider 接口抽象 + 环境变量切换

- **选择**：为视觉分析和图像生成各定义一个 TypeScript 接口（`VisionProvider`、`ImageGenProvider`），通过工厂函数读取环境变量（`VISION_PROVIDER`、`IMAGE_GEN_PROVIDER`）实例化对应实现。首版各有两个实现：Replicate 和 Gemini/fal.ai
- **理由**：需求只需两个 Provider 可切换，接口 + 工厂足够。不用注册中心和动态发现——首版只有两个实现，硬编码 switch 即可，配置驱动
- **演进余地**：后续新增 Provider 只需实现接口 + 在工厂添加一个分支，不影响调用方

### ADR-2：Replicate 异步回调接收结果（替代服务端同步等待）

- **选择**：使用 Replicate 原生 Webhook 机制接收预测结果。创建预测时传入 `webhook` URL 和 `webhook_events_filter: ["completed"]`，Replicate 完成后回调服务端。Gemini/fal.ai 保留原有同步调用模式
- **理由**：Replicate 原生支持 Webhook，无需轮询 Replicate API。服务端不再为等待 AI 结果长时间占用连接。比轮询 Replicate 接口节省资源
- **风险与对策**：Webhook 可能丢失或延迟——设置 5 分钟超时定时器，超时未收到回调则标记任务失败；任务记录中存储 `externalId`（Replicate prediction ID），支持人工排查

### ADR-3：前端保留 React Query 轮询

- **选择**：前端继续使用现有 React Query 轮询模式获取任务状态，不引入 SSE / WebSocket 等长连接方案
- **理由**：现有轮询机制已验证稳定，分析 2s / 生成 3s 的轮询间隔对用户体验影响可接受。长连接方案增加前后端复杂度（连接管理、心跳、断连恢复、Serverless 平台兼容性），首版 ROI 不成立
- **演进余地**：后续如需更低延迟的推送，可引入 SSE 替代轮询，后端 Webhook 和前端 hooks 的接口不变

### ADR-4：分析链路异步化（Replicate 模式）

- **选择**：当视觉分析使用 Replicate 时，`POST /api/analysis` 改为异步模式——创建任务 + 提交 Replicate 预测后立即返回 taskId。Webhook 收到视觉分析结果后，在 Webhook 处理函数中同步调用 Gemini 结构化整理（耗时 < 10s），然后更新任务。当使用 Gemini 时保留原有同步模式
- **理由**：Replicate 视觉分析耗时不可控（可能 > 30s），不适合在 HTTP 请求内同步等待。Webhook 处理函数中串接结构化整理是可行的——Gemini 结构化调用耗时短（< 10s），不会导致 Webhook 处理超时
- **演进余地**：如果结构化整理也迁移到 Replicate，可以让第一个 Webhook 触发第二个 Replicate 预测，形成 Webhook 链

### ADR-5：Webhook 安全与任务关联

- **选择**：Webhook 端点通过 Replicate 签名验证（`X-Replicate-Signature` + `REPLICATE_WEBHOOK_SECRET`）确保请求合法。Replicate 创建预测时通过 webhook URL query 参数传递 `taskType`（analysis/generation）和 `taskId`，Webhook 处理函数据此关联到正确的任务记录
- **理由**：签名验证是防伪造的标准做法。用 URL query 参数传递任务标识比维护独立映射表更简单——Replicate Webhook URL 支持自定义参数
- **风险与对策**：需确保 Webhook URL 中的 taskId 不可被外部猜测利用——签名验证已覆盖此风险

### 3.x 待确认问题

无。

| 编号 | 问题描述 | 结论 |
| --- | --- | --- |
| Q1 | Replicate 上用于视觉分析的具体模型 | 已确认：`google/gemini-2.5-flash` |
| Q2 | Replicate 上用于图像生成的具体模型 | 已确认：`black-forest-labs/flux-2-dev` |

## 4. 用户流程与状态

### 4.1 主流程

用户操作流程不变。变化集中在后端处理方式：

```
用户上传参考图 → 浏览器直传 R2
  → POST /api/analysis（创建任务 + 提交 Replicate 预测）→ 返回 taskId
    → 前端轮询 GET /api/analysis/:id
      → Replicate 完成 → Webhook 回调服务端
        → Webhook 处理：接收视觉结果 → 调用 Gemini 结构化 → 更新任务
          → 前端下次轮询检测到 completed → 展示 Recipe + Prompt

用户编辑 Prompt → POST /api/generation → 返回 taskId
  → 前端轮询 GET /api/generation/:id
    → Replicate 完成 → Webhook 回调 → 更新任务
      → 前端下次轮询检测到 completed → 展示生成图片
```

Gemini/fal.ai 备选模式：分析走同步（请求内完成），生成走 fire-and-forget。前端轮询行为完全一致。

### 4.2 关键分支

| 分支 | 入口 / 触发条件 | 架构处理方式 |
| --- | --- | --- |
| Webhook 回调失败/超时 | 5 分钟未收到 Replicate 回调 | 定时器触发，标记任务 failed，前端轮询检测到 failed |
| 使用 Gemini/fal.ai 备选 | 环境变量配置切换 | 分析走同步模式，生成走 fire-and-forget，前端轮询行为不变 |
| 分析/生成失败 | Provider 返回错误或内部异常 | 更新任务 failed，前端轮询检测到错误，展示重试入口 |

### 4.3 工作区前端状态机

状态机与 01-1 架构文档完全一致，无变更：

```
idle → uploading → analyzing → analysis_ready → generating → generation_ready

analyzing → analysis_ready：轮询检测到 completed
generating → generation_ready：轮询检测到 completed
* → error：轮询检测到 failed
```

关键规则（不变）：
- `error` 不清空已有稳定结果
- 同一步骤只保留一个有效任务
- 前端轮询间隔：分析 2 秒，生成 3 秒

## 5. 系统上下文与模块职责

### 5.1 系统上下文

```
+------------------+       +-------------------------------------------+       +---------------------+
|                  |       |           Next.js 应用                    |       |                     |
|   浏览器         | ◄───► |   前端页面（首页 + 工作区）                |       |   对象存储（R2）    |
|  （React Query   |       |   API Routes                             | ◄───► |   参考图 + 生成图   |
|    轮询状态）    |       |     ├ Upload API                         |       +---------------------+
|                  | ────► |     ├ Analysis API                       |
+------------------+  直传 |     ├ Generation API                     |       +---------------------+
        |          +─────► |     ├ Task Query API                     | ◄───► |   PostgreSQL        |
        |            R2    |     └ Webhook API                        |       |   任务 + 资产 + 配方 |
                           +-------------------------------------------+       +---------------------+
                                   |          |          |
                                   ▼          ▼          ▼
                           +-------------+ +--------+ +-----------+
                           | Replicate   | | Gemini | | fal.ai    |
                           | (视觉/生图) | | (视觉/ | | (生图     |
                           |  Webhook ──►|─┘ 结构化)| |  备选)    |
                           +-------------+ +--------+ +-----------+
```

### 5.2 模块职责

| 模块 | 职责 | 上游输入 | 下游输出 |
| --- | --- | --- | --- |
| Provider 工厂 (`ai/providers/`) | 根据配置实例化 VisionProvider / ImageGenProvider | 环境变量配置 | Provider 实例 |
| Provider 实现层 | 各 Provider 的具体调用逻辑。含 4 个实现：Replicate Vision（`google/gemini-2.5-flash`）、Replicate ImageGen（`black-forest-labs/flux-2-dev`）、Gemini Vision（现有）、fal.ai ImageGen（现有） | 图片 URL / Prompt + 参数、Webhook URL | 分析文本 / 图片 URL / externalId |
| Webhook API (`/api/webhooks/replicate`) | 验证签名、解析回调、触发后续处理、更新任务状态 | Replicate 回调请求 | 任务状态更新 |
| Analysis API（改造） | Replicate 模式下异步提交 + 返回 taskId；Gemini 模式保留同步 | 浏览器请求 | taskId / 同步结果 |
| Generation API（改造） | Replicate 模式下异步提交 + 返回 taskId；fal.ai 模式保留 fire-and-forget | 浏览器请求 | taskId |
| Task Query API | 提供分析任务和生成任务的状态查询（不变） | 前端轮询请求 | 任务状态 + 结果数据 |

### 5.3 需要刻意避免的过度设计

| 不引入的内容 | 原因 |
| --- | --- |
| Provider 注册中心 / 动态发现 | 首版只有两个 Provider 实现，工厂函数 switch 足够 |
| SSE / WebSocket 长连接 | 前端轮询已验证稳定，长连接增加复杂度且 ROI 不成立（ADR-3）|
| EventEmitter / Redis Pub/Sub 事件总线 | 无长连接需要桥接，不需要进程内事件分发 |
| Provider 自动降级 / 熔断器 | 首版通过配置手动切换，不做自动降级 |
| Webhook 重试队列 | Replicate 自带重试机制，服务端只需幂等处理 |

## 6. 运行链路

### 6.1 分析链路（Replicate 模式）

1. 浏览器调用 `POST /api/upload/presign`，获取预签名 URL 和 `assetId`
2. 浏览器直传参考图到 R2
3. 浏览器调用 `POST /api/analysis`，传入 `assetId`、`fileUrl`、图片元数据
4. API 创建 Asset 记录和 AnalysisTask 记录（status: pending, provider: replicate）
5. API 调用 Replicate SDK 创建预测，传入图片 URL + Webhook URL（含 taskId），获取 prediction ID
6. API 将 `externalId` 写入 AnalysisTask，更新 status: processing，立即返回 `{ id, status }`
7. 前端开始轮询 `GET /api/analysis/:id`（间隔 2s）
8. Replicate 完成视觉分析后回调 `POST /api/webhooks/replicate?taskType=analysis&taskId={taskId}`
9. Webhook 处理函数验证签名，提取视觉分析结果文本
10. Webhook 处理函数同步调用 Gemini 结构化整理，获取 VisualRecipe + Prompt
11. Webhook 处理函数更新 AnalysisTask（status: completed，写入 recipe、promptText 等）
12. 前端下次轮询检测到 completed，停止轮询，展示结果

实现原则：
- 步骤 5-6 在同一请求中完成，API 返回后不再占用连接
- 步骤 9-11 在 Webhook 处理函数中串行完成。Gemini 结构化调用耗时 < 10s，不会导致 Webhook 处理超时
- 步骤 5 提交预测时启动 5 分钟超时定时器（`setTimeout`），超时未收到回调则标记任务 failed
- 分析失败时记录 `errorStage`（vision / llm），前端据此展示不同提示

### 6.2 分析链路（Gemini 备选模式）

1-3. 同上
4. API 创建 Asset 记录和 AnalysisTask 记录（status: pending, provider: gemini）
5. API 同步调用 Gemini 视觉理解 → 同步调用 Gemini 结构化整理（保留 01-1 原有逻辑）
6. API 更新 AnalysisTask（status: completed），返回完整结果

实现原则：
- Gemini 模式保留原有同步链路，无额外变更
- 前端轮询行为与 Replicate 模式一致（首次轮询即可获取结果）

### 6.3 生成链路（Replicate 模式）

1. 用户确认或编辑 Prompt，设置生成参数
2. 浏览器调用 `POST /api/generation`，传入 Prompt、参数
3. API 创建 GenerationTask 记录（status: pending, provider: replicate）
4. API 调用 Replicate SDK 创建生图预测，传入 Prompt + Webhook URL（含 taskId）
5. API 将 `externalId` 写入 GenerationTask，更新 status: processing，返回 `{ id, status }`
6. 前端开始轮询 `GET /api/generation/:id`（间隔 3s）
7. Replicate 完成后回调 `POST /api/webhooks/replicate?taskType=generation&taskId={taskId}`
8. Webhook 处理函数验证签名，提取生成图片 URL
9. Webhook 处理函数下载图片 → 上传到 R2 → 创建 Asset 记录
10. Webhook 处理函数更新 GenerationTask（status: completed，关联 resultAssetId）
11. 前端下次轮询检测到 completed，停止轮询，展示结果

实现原则：
- 图片转存（步骤 9）在 Webhook 处理函数中完成，不额外创建后台任务
- 同样设置 5 分钟超时定时器
- 每次生成记录完整 Prompt 快照

### 6.4 生成链路（fal.ai 备选模式）

1-2. 同上
3. API 创建 GenerationTask（status: pending, provider: fal）
4. API 立即返回 `{ id, status }`
5. 后台 fire-and-forget 调用 fal.ai 生成（保留 01-1 原有逻辑）
6. 完成后更新任务，前端轮询检测到结果

## 7. 领域对象与关键契约

### 7.1 核心对象

本次不新增领域对象。在现有 AnalysisTask 和 GenerationTask 上扩展 Provider 相关字段：

| 对象 | Source of Truth | 本次变更 |
| --- | --- | --- |
| Asset | PostgreSQL `assets` 表 | 不变 |
| AnalysisTask | PostgreSQL `analysis_tasks` 表 | 新增 `provider`、`externalId`、`modelName` 字段 |
| GenerationTask | PostgreSQL `generation_tasks` 表 | 新增 `provider`、`externalId` 字段 |
| VisualRecipe | `analysis_tasks.recipe` JSON 字段 | 不变 |

### 7.2 新增 / 变更 Schema

```typescript
// Provider 接口定义（新增）

/** 视觉分析 Provider 接口 */
interface VisionProvider {
  readonly name: 'replicate' | 'gemini';

  /**
   * 同步模式（Gemini）：直接返回分析结果文本
   * 异步模式（Replicate）：提交预测任务，返回 externalId，结果通过 Webhook 接收
   */
  analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;     // 异步模式需要
  }): Promise<
    | { mode: 'sync'; result: string }
    | { mode: 'async'; externalId: string }
  >;
}

/** 图像生成 Provider 接口 */
interface ImageGenProvider {
  readonly name: 'replicate' | 'fal';

  /**
   * 同步模式（fal.ai）：直接返回生成结果
   * 异步模式（Replicate）：提交预测任务，返回 externalId
   */
  generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<
    | { mode: 'sync'; imageUrl: string; width: number; height: number }
    | { mode: 'async'; externalId: string }
  >;
}

// analysis_tasks 表变更（新增字段）
interface AnalysisTaskChanges {
  provider: 'replicate' | 'gemini';    // 新增：使用的 Provider
  externalId: string | null;           // 新增：Replicate prediction ID
  modelName: string;                   // 新增：具体模型名称
}

// generation_tasks 表变更（新增字段）
interface GenerationTaskChanges {
  provider: 'replicate' | 'fal';       // 新增：使用的 Provider
  externalId: string | null;           // 新增：Replicate prediction ID
  // modelName 已存在，不变
}
```

### 7.3 API 边界

现有端点变更：

| 接口 | 方法 | 变更说明 |
| --- | --- | --- |
| `/api/analysis` | POST | Replicate 模式下改为异步返回 `{ id, status }`；Gemini 模式保留同步返回完整结果 |
| `/api/analysis/:id` | GET | 不变 |
| `/api/generation` | POST | Replicate 模式下提交预测后返回；fal.ai 模式保留 fire-and-forget |
| `/api/generation/:id` | GET | 不变 |

新增端点：

| 接口 | 方法 | 用途 | 说明 |
| --- | --- | --- | --- |
| `/api/webhooks/replicate` | POST | 接收 Replicate 异步回调 | 入参：Replicate Webhook payload + query params（taskType, taskId）；验证 `X-Replicate-Signature`；处理完成/失败结果 |

共 6 个端点（原有 5 个 + 新增 1 个），每个对应首版用户流程中的具体交互。

### 7.4 状态流转

分析任务和生成任务状态机不变：

```
pending → processing → completed
pending → processing → failed
```

变化在于状态转换的驱动者：

| 转换 | 之前 | 之后（Replicate 模式） |
| --- | --- | --- |
| pending → processing | Analysis API 请求内 / Generation API fire-and-forget | API 提交 Replicate 预测后更新 |
| processing → completed | API 请求内完成 / fire-and-forget 完成 | Webhook 处理函数更新 |
| processing → failed | API 请求内失败 / fire-and-forget 失败 | Webhook 失败回调 或 超时定时器触发 |

规则（不变）：任务进入终态（completed / failed）不可变更。重试通过创建新任务实现。

Webhook 幂等性：Webhook 处理前先检查任务状态，若已为终态则跳过处理，返回 200。

### 7.5 数据边界

在 01-1 基础上无变更。

| 存储层 | 存储内容 | 职责边界 |
| --- | --- | --- |
| 对象存储（R2） | 参考图原图、生成结果图 | 只存文件，不存业务状态 |
| PostgreSQL | Asset 元数据、AnalysisTask（含 Provider/externalId）、GenerationTask | 业务数据的 source of truth |
| 浏览器内存 | 当前工作区状态、用户编辑中的 Prompt | 会话级临时状态，刷新即丢失 |

### 7.6 命名与标识规则

沿用 01-1 命名规则，补充本次新增术语：

| 业务概念 | 代码 / API 术语 | 说明 |
| --- | --- | --- |
| Provider 名称 | `provider` | 枚举值：`replicate`、`gemini`、`fal` |
| 外部预测 ID | `externalId` | Replicate prediction ID，非 Replicate Provider 时为 null |
| Webhook 端点 | `/api/webhooks/replicate` | 不缩写为 `/api/wh/` |

## 8. 非功能需求、风险与运行策略

### 8.1 性能与吞吐量目标

| 指标 | 目标 | 说明 |
| --- | --- | --- |
| Replicate 分析耗时 | <= 60 秒 | Replicate 视觉分析 + Gemini 结构化（Webhook 处理内） |
| Replicate 生成耗时 | <= 120 秒 | 取决于 Replicate 模型 |
| Webhook 处理耗时 | <= 30 秒 | 含签名验证 + 结构化调用（分析）或图片转存（生成）|
| 回调超时窗口 | 5 分钟 | 超时后标记任务失败 |
| 轮询 QPS | <= 10 QPS / 用户 | 分析 2 秒、生成 3 秒间隔（与 01-1 一致）|
| 首版预期并发 | <= 20 个同时在线用户 | 灰度阶段 |

### 8.2 可靠性、错误处理与降级策略

基础错误处理：

- Replicate 提交失败：API 返回错误，任务标记 failed，前端提示重试
- Webhook 签名验证失败：返回 401，不处理，任务等待超时后标记 failed
- Webhook 处理中结构化失败（分析链路）：L3 降级——保存原始视觉分析文本作为 promptText，status 为 completed + errorStage: llm
- Webhook 处理中图片转存失败（生成链路）：任务标记 failed，前端提示重试

降级策略（在 01-1 基础上补充 Provider 相关）：

| 级别 | 触发条件 | 系统行为 | 用户可见影响 |
| --- | --- | --- | --- |
| L1 | Replicate 响应慢 | 等待 Webhook，5 分钟超时 | 等待时间变长 |
| L2 | Replicate 不可用 | 运维手动切换环境变量到 Gemini/fal.ai | 需重新部署/重启，切换期间暂停服务 |
| L3 | 结构化整理失败 | 降级返回原始分析文本 | 配方质量下降 |
| L4 | 数据库不可用 | 整页维护提示 | 产品完全不可用 |

### 8.3 安全与反滥用策略

沿用 01-1 安全策略，补充 Webhook 相关：

| 项目 | 策略 |
| --- | --- |
| Webhook 签名验证 | 使用 `REPLICATE_WEBHOOK_SECRET` 验证 `X-Replicate-Signature` 头，防止伪造回调 |
| Webhook 端点不暴露内部数据 | Webhook URL 中的 taskId 参数本身不含敏感信息，且有签名保护 |
| API Key 管理 | `REPLICATE_API_TOKEN` 仅服务端持有，通过环境变量注入 |
| Rate Limit | 保持原有限流策略不变（上传 10 次/小时，分析 10 次/小时，生成 20 次/小时）|

### 8.4 成本控制预期

| 服务 | 预估单次成本 | 变更说明 |
| --- | --- | --- |
| Replicate 视觉分析 | $0.01 - $0.05 / 次 | 替代原 Gemini 视觉调用，成本相近 |
| Gemini 结构化整理 | $0.01 - $0.03 / 次 | 不变 |
| Replicate 图像生成 | $0.02 - $0.10 / 次 | 替代原 fal.ai 调用，成本取决于具体模型 |
| Gemini 视觉（备选） | $0.01 - $0.05 / 次 | 切换回 Gemini 时使用 |
| fal.ai 生成（备选） | $0.02 - $0.10 / 次 | 切换回 fal.ai 时使用 |

首版日预算上限 $50 不变。Replicate 平台自身支持 Spend Limit 设置，建议同时配置。

### 8.5 可观测性

在 01-1 基础上补充：

- **Webhook 日志**：每个 Webhook 请求记录 taskId、taskType、签名验证结果、处理耗时、处理结果
- **Provider 日志**：每次 Provider 调用记录 provider 名称、模型名称、耗时、成功/失败
- **超时监控**：回调超时事件记录 taskId、provider、提交时间

### 8.6 主要风险

| 风险 | 影响 | 缓解方式 |
| --- | --- | --- |
| Replicate Webhook 丢失或延迟 | 任务卡在 processing 状态 | 5 分钟超时定时器自动标记失败；任务记录 externalId 可人工在 Replicate Dashboard 排查 |
| Replicate 模型质量不及预期 | 分析/生成效果下降 | 可通过配置快速切回 Gemini/fal.ai |
| Webhook 处理中 Gemini 调用失败 | 分析链路断裂 | L3 降级：返回原始视觉分析文本 |
| 超时定时器在 Serverless 冷启动后丢失 | 任务永久卡在 processing | 补充定期扫描 processing 超时任务的兜底逻辑（可选，视部署平台决定）|

## 9. 实施建议与技术选型

### 9.1 推荐核心技术栈

在 01-1 基础上新增/变更：

| 分层 | 选型建议 | 选型说明 |
| --- | --- | --- |
| Replicate SDK | `replicate` npm 包 | 官方 Node.js SDK，支持 Webhook 创建和签名验证 |
| 其他 | 保持 01-1 技术栈不变 | Next.js、PostgreSQL、Drizzle、R2、React Query 等 |

### 9.2 阶段划分建议

#### Phase A：Provider 抽象 + Replicate 接入

- 定义 VisionProvider / ImageGenProvider 接口
- 实现 Replicate Vision Provider 和 Replicate ImageGen Provider
- 将现有 Gemini / fal.ai 代码包装为 Provider 实现
- Provider 工厂 + 环境变量配置
- 数据库 Schema 迁移（新增 provider、externalId、modelName 字段）

验证目标：通过配置切换 Provider，两套 Provider 均能完成分析和生成。

#### Phase B：Webhook 异步接收

- Webhook 端点实现（签名验证 + 任务处理）
- 分析链路异步化（Replicate 模式）
- 生成链路异步化（Replicate 模式）
- 回调超时定时器
- Webhook 幂等性处理

验证目标：默认配置（Replicate）下全链路跑通——提交任务 → Webhook 回调 → 任务更新 → 前端轮询检测到结果。

#### Phase C：健壮性与验收

- 超时兜底逻辑
- 日志与可观测性补充
- Gemini/fal.ai 备选模式回归测试
- 端到端验收测试

验证目标：异常路径全覆盖——Webhook 失败、超时、Provider 切换。

## 10. 架构结论

本次架构在 **Reference → Recipe → Render** 核心闭环不变的前提下，完成两项技术升级：

1. **Provider 可切换**：通过接口抽象 + 工厂模式 + 环境变量配置，视觉分析和图像生成各支持两个 Provider（Replicate / Gemini 和 Replicate / fal.ai）。接口设计统一了同步和异步两种调用模式的返回类型，调用方无需关心 Provider 内部的执行方式。

2. **后端异步接收**：Replicate Webhook 异步接收 AI 处理结果，服务端不再长时间占用连接等待。前端保留现有 React Query 轮询机制，无需改动前端通信架构。

关键设计原则：

- **不改变用户操作流程**：前端状态机和轮询机制完全不变
- **不改变领域模型**：不新增领域对象，仅在现有任务表上扩展 Provider 相关字段
- **备选模式零改动**：Gemini/fal.ai 备选路径保留原有同步/fire-and-forget 逻辑
- **最小变更面**：只新增 1 个 Webhook 端点 + Provider 抽象层，不引入 SSE、EventEmitter、长连接等额外基础设施
- **渐进式可升级**：后续如需实时推送可引入 SSE，手动切换可升级为自动降级，每条演进路径明确且不阻塞当前实现
