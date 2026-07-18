---
task_id: "T04"
title: "Webhook 端点与回调处理"
dimension: backend
phase: 2
status: done
depends_on: ["T02"]
---

# T04: Webhook 端点与回调处理（后端）

## 任务概要

- **目标**: 实现 `/api/webhooks/replicate` 端点，接收 Replicate 异步回调，验证签名，根据 taskType 分发处理（分析回调触发结构化整理，生成回调触发图片转存），更新任务状态
- **依赖**: T02（Schema 扩展，需要 provider/externalId 字段和 findByIdInternal 函数）
- **所属模块**: Webhook API
- **前置条件**: T02 已完成；`REPLICATE_WEBHOOK_SECRET` 环境变量已配置
- **不在范围**: API 路由改造（T05/T06）；Replicate Provider 实现（T03）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/api/webhooks/replicate/route.ts` | Webhook 端点主路由 |
| create | `src/lib/ai/webhook-handler.ts` | Webhook 回调处理逻辑（签名验证 + 任务处理） |
| create | `src/lib/ai/__tests__/webhook-handler.test.ts` | Webhook 处理逻辑单元测试 |

## 实现规格

### 1. Webhook 路由 (`route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { handleReplicateWebhook } from '@/lib/ai/webhook-handler';

export async function POST(request: NextRequest) {
  const taskType = request.nextUrl.searchParams.get('taskType');
  const taskId = request.nextUrl.searchParams.get('taskId');

  if (!taskType || !taskId) {
    return NextResponse.json({ error: 'Missing taskType or taskId' }, { status: 400 });
  }

  if (taskType !== 'analysis' && taskType !== 'generation') {
    return NextResponse.json({ error: 'Invalid taskType' }, { status: 400 });
  }

  const body = await request.text();
  const signature = request.headers.get('x-replicate-signature') ?? '';

  const result = await handleReplicateWebhook({
    taskType,
    taskId,
    body,
    signature,
  });

  return NextResponse.json(result.response, { status: result.status });
}
```

### 2. Webhook 处理逻辑 (`webhook-handler.ts`)

**签名验证**:

使用 `REPLICATE_WEBHOOK_SECRET` 和 `X-Replicate-Signature` 头验证请求合法性。参照 Replicate 文档使用 HMAC-SHA256 验证或使用 Replicate SDK 提供的验证工具。

```typescript
function verifySignature(body: string, signature: string, secret: string): boolean {
  // 使用 Replicate SDK 的 validateWebhook 或手动 HMAC 验证
}
```

**回调 payload 解析**:

Replicate Webhook payload 结构：
```typescript
interface ReplicatePrediction {
  id: string;
  status: 'succeeded' | 'failed' | 'canceled';
  output: unknown;  // 模型输出
  error: string | null;
}
```

**分析回调处理** (`taskType === 'analysis'`):

1. 查询 AnalysisTask（使用 `findAnalysisTaskByIdInternal`）
2. **幂等性检查**: 若任务已为终态（completed/failed），跳过处理，返回 200
3. 若 prediction status 为 `failed`/`canceled`：更新任务 failed
4. 若 prediction status 为 `succeeded`：
   - 提取视觉分析结果文本（`prediction.output`）
   - 同步调用 `structureAnalysis(rawAnalysis)` 进行 Gemini 结构化整理
   - 成功：更新任务 completed，写入 recipe、promptText、negativePromptText、rawResponse
   - 结构化失败（L3 降级）：更新任务 completed，promptText 为原始分析文本，errorStage 为 `'llm'`

**生成回调处理** (`taskType === 'generation'`):

1. 查询 GenerationTask（使用 `findGenerationTaskByIdInternal`）
2. **幂等性检查**: 若任务已为终态，跳过处理，返回 200
3. 若 prediction status 为 `failed`/`canceled`：更新任务 failed
4. 若 prediction status 为 `succeeded`：
   - 提取生成图片 URL（`prediction.output`）
   - 下载图片 → 上传到 R2（key: `generated/{taskId}/result.webp`）
   - 创建 Asset 记录（type: generated）
   - 更新任务 completed，关联 resultAssetId

**日志记录**:

每个 Webhook 请求记录：taskId、taskType、签名验证结果、处理耗时、处理结果。

### 3. 单元测试

- Mock 签名验证：有效签名通过，无效签名返回 401
- Mock `findAnalysisTaskByIdInternal` / `findGenerationTaskByIdInternal`
- Mock `structureAnalysis` 和 R2 上传
- 测试场景：
  - 分析回调成功 → 结构化成功 → completed
  - 分析回调成功 → 结构化失败 → L3 降级 completed
  - 分析回调失败 → failed
  - 生成回调成功 → 图片转存 → completed
  - 生成回调失败 → failed
  - 幂等性：任务已为终态 → 返回 200 不处理
  - taskId 不存在 → 返回 404

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 `webhook-handler.ts` 签名验证函数 | done | HMAC-SHA256 或 Replicate SDK 验证 |
| 2 | 实现分析回调处理逻辑 | done | 提取结果 → 调用 structurer → 更新任务 |
| 3 | 实现生成回调处理逻辑 | done | 提取图片 → 下载转存 R2 → 创建 Asset → 更新任务 |
| 4 | 实现幂等性检查 | done | 终态任务直接返回 200 |
| 5 | 创建 Webhook 路由 `route.ts` | done | 解析 query params，调用 handler |
| 6 | 编写单元测试 | done | 覆盖成功/失败/降级/幂等所有分支 |
| 7 | 运行 type-check 和 test 验证 | done | 全量测试 |

## 验证命令

```bash
pnpm type-check
pnpm vitest --run src/lib/ai/__tests__/webhook-handler.test.ts
```

## 预期结果

- Webhook 端点能正确验证 Replicate 签名
- 分析回调触发 Gemini 结构化并更新任务
- 生成回调触发图片转存并更新任务
- 幂等性：重复回调不会重复处理
- 签名验证失败返回 401
- 所有单元测试通过

## 交接上下文

- **架构章节**: 3 ADR-2、ADR-5（Webhook 安全与任务关联）、6.1 步骤 8-11、6.3 步骤 7-10
- **相关代码**: `src/lib/ai/structurer.ts`（分析回调中调用）、`src/lib/r2.ts`（生成回调中转存图片）、`src/lib/repositories/asset-repository.ts`
- **契约 / 数据对象**: ReplicatePrediction payload、AnalysisTask、GenerationTask
- **提供给下游的契约摘要**:

```typescript
// Webhook URL 格式（T05/T06 构造时使用）
// POST /api/webhooks/replicate?taskType=analysis&taskId={taskId}
// POST /api/webhooks/replicate?taskType=generation&taskId={taskId}

// Webhook 处理结果
interface WebhookResult {
  response: { ok: boolean; message?: string };
  status: number;
}
```

## 执行指引

- **工具链**: pnpm, Next.js App Router, Vitest
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果 Replicate Webhook 签名验证方式无法确认，查阅 Replicate 官方文档或 SDK 源码；如果 prediction output 结构不确定，参考模型文档
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 签名验证算法是否正确；prediction output 的解析是否匹配模型输出格式；structurer 的 import 路径
- **允许修改的额外文件**: 无
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Replicate prediction output 的具体结构取决于模型，实现时需参考模型文档确认 output 格式
- 分析回调中同步调用 Gemini 结构化耗时 < 10s（架构确认），不会导致 Webhook 处理超时
- 生成回调中下载 + 上传图片可能耗时较长，但在 30s Webhook 处理窗口内可完成
- 生成回调需要 userId 来创建 Asset 记录，需从 GenerationTask 中获取

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 处理前检查任务状态，终态直接返回 200 | done |
| 超时处理 | Webhook 处理应在 30s 内完成；结构化 < 10s，图片转存按需控制 | done |
| 重试场景 | Replicate 自带重试机制，服务端幂等处理即可 | done |
| 并发冲突 | 同一 taskId 并发回调可能导致竞态——幂等检查 + 终态不可变规则保护 | done |
| 空/无效输入 | prediction output 为空/格式错误时标记任务 failed | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
