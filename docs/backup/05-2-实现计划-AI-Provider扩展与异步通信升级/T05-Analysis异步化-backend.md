---
task_id: "T05"
title: "Analysis API 异步化"
dimension: backend
phase: 3
status: done
depends_on: ["T01", "T02", "T03", "T04"]
---

# T05: Analysis API 异步化（后端）

## 任务概要

- **目标**: 改造 `POST /api/analysis` 路由，使用 Provider 工厂获取 VisionProvider，Replicate 模式下异步提交预测 + 返回 taskId，Gemini 模式保留原有同步链路，并增加 5 分钟超时定时器
- **依赖**: T01（Provider 工厂）、T02（Schema 扩展）、T03（Replicate 实现）、T04（Webhook 端点）
- **所属模块**: Analysis API 改造
- **前置条件**: T01-T04 均已完成
- **不在范围**: 前端改动；Webhook 处理逻辑（T04 已完成）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/analysis/route.ts` | 主要改造文件：引入 Provider 工厂，分支处理 sync/async |
| create | `src/app/api/analysis/__tests__/route.test.ts` | 路由改造后的单元测试（如尚不存在） |

## 实现规格

### 1. 改造 `POST /api/analysis`

核心变更逻辑：

```typescript
import { getVisionProvider } from '@/lib/ai/providers';

export async function POST(request: NextRequest) {
  // ... 认证 + 校验（不变）...

  // 创建 Asset（不变）
  const asset = await upsertAsset(userId, validated.assetId, { ... });

  // 获取 Provider
  const visionProvider = getVisionProvider();

  // 创建 AnalysisTask（新增 provider、modelName）
  let task = await createAnalysisTask(userId, {
    sourceAssetId: asset.id,
    provider: visionProvider.name,
    modelName: visionProvider.name === 'replicate' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash',
  });

  task = await updateAnalysisTask(task.id, { status: 'processing' });

  // 调用 Provider
  const webhookUrl = buildWebhookUrl('analysis', task.id);
  const result = await visionProvider.analyze({
    imageUrl: validated.fileUrl,
    mimeType: validated.mimeType,
    webhookUrl,
  });

  if (result.mode === 'sync') {
    // Gemini 同步模式：保留原有两阶段管线逻辑
    return await executeSyncPipeline(task.id, result.result, validated.fileUrl);
  }

  // Replicate 异步模式：保存 externalId + 启动超时定时器 + 立即返回
  await updateAnalysisTask(task.id, { externalId: result.externalId });
  startTimeoutTimer(task.id, 5 * 60 * 1000);  // 5 分钟

  return NextResponse.json({ id: task.id, status: 'processing' }, { status: 201 });
}
```

### 2. Webhook URL 构造

```typescript
function buildWebhookUrl(taskType: 'analysis' | 'generation', taskId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
  return `${baseUrl}/api/webhooks/replicate?taskType=${taskType}&taskId=${taskId}`;
}
```

注意：开发环境可能需要使用 ngrok 等工具暴露本地端口给 Replicate 回调。将 `buildWebhookUrl` 作为可配置函数，允许通过 `WEBHOOK_BASE_URL` 环境变量覆盖 baseUrl。

### 3. 超时定时器

```typescript
function startTimeoutTimer(taskId: string, timeoutMs: number): void {
  const timer = setTimeout(async () => {
    const task = await findAnalysisTaskByIdInternal(taskId);
    if (task && task.status === 'processing') {
      await updateAnalysisTask(taskId, {
        status: 'failed',
        errorMessage: `Webhook callback not received within ${timeoutMs / 1000}s`,
        errorStage: 'vision',
      });
      log('analysis_timeout', { taskId, timeoutMs });
    }
  }, timeoutMs);

  // 允许 Node.js 进程正常退出
  if (timer.unref) timer.unref();
}
```

### 4. 同步管线保留

`executeSyncPipeline()` 逻辑与现有 `executeAnalysisPipeline()` 基本一致，但直接接收视觉分析结果文本（而非再调 analyzeImage）：

1. 调用 `structureAnalysis(rawAnalysis)` 进行结构化
2. 成功：更新任务 completed
3. 结构化失败：L3 降级

### 5. 日志补充

每次 Provider 调用记录 provider 名称、模型名称、模式（sync/async）。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 引入 Provider 工厂，获取 VisionProvider | done | `getVisionProvider()` |
| 2 | 修改 createAnalysisTask 调用，传入 provider 和 modelName | done | 新增字段 |
| 3 | 实现 `buildWebhookUrl()` 工具函数 | done | 可配置 baseUrl |
| 4 | 实现 async 分支：保存 externalId + 启动超时 + 返回 taskId | done | Replicate 模式 |
| 5 | 实现 sync 分支：保留原有两阶段管线 | done | Gemini 模式 |
| 6 | 实现 `startTimeoutTimer()` | done | 5 分钟超时标记 failed |
| 7 | 补充 Provider 相关日志 | done | provider 名称、模式、耗时 |
| 8 | 编写/更新单元测试 | done | 覆盖 sync 和 async 两条路径 |
| 9 | 运行 type-check 和 test 验证 | done | 全量测试 |

## 验证命令

```bash
pnpm type-check
pnpm vitest --run src/app/api/analysis/__tests__/route.test.ts
pnpm test
```

## 预期结果

- `VISION_PROVIDER=gemini` 时：行为与改造前完全一致（同步两阶段管线）
- `VISION_PROVIDER=replicate`（默认）时：创建任务 + 提交 Replicate 预测 → 立即返回 `{ id, status: 'processing' }`
- 超时定时器在 5 分钟后检查任务状态，processing 则标记 failed
- TypeScript 类型检查通过，所有测试通过

## 交接上下文

- **架构章节**: 3 ADR-4（分析链路异步化）、6.1（分析链路 Replicate 模式）、6.2（分析链路 Gemini 备选模式）
- **相关代码**: `src/lib/ai/providers/index.ts`（工厂）、`src/lib/ai/structurer.ts`（同步分支调用）、`src/lib/repositories/analysis-task-repository.ts`
- **契约 / 数据对象**: VisionProvider 接口、AnalysisTask
- **提供给下游的契约摘要**:

```typescript
// POST /api/analysis 返回值（Replicate 异步模式）
{ id: string; status: 'processing' }

// POST /api/analysis 返回值（Gemini 同步模式，不变）
AnalysisTask（completed / failed）

// GET /api/analysis/:id 不变
```

## 执行指引

- **工具链**: pnpm, Next.js App Router, Vitest
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果 T01-T04 任一未完成，暂停并报告缺失依赖
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: Provider 工厂返回值类型是否匹配；createAnalysisTask 新参数是否正确传递；webhookUrl 构造是否完整
- **允许修改的额外文件**: 无
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 开发环境 Webhook 回调需要公网可达的 URL，建议使用 `WEBHOOK_BASE_URL` 环境变量配置 ngrok 地址
- `setTimeout` 在 Serverless 环境（如 Vercel）中可能不可靠——冷启动后定时器丢失。架构已说明可选补充定期扫描 processing 超时任务的兜底逻辑，但首版不强制实现
- 同步分支（Gemini 模式）的返回格式与改造前一致，前端无需变更

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 每次 POST 创建新任务，无幂等要求（与改造前一致） | done |
| 超时处理 | Replicate 模式 5 分钟超时定时器；Gemini 模式保留 60s 整体超时 | done |
| 重试场景 | 用户重试通过创建新任务实现（不可变更终态任务） | done |
| 并发冲突 | 超时定时器和 Webhook 可能并发更新同一任务——终态不可变规则 + Webhook 幂等性保护 | done |
| 空/无效输入 | 请求体校验不变；Provider 返回值按 discriminated union 分支处理 | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
