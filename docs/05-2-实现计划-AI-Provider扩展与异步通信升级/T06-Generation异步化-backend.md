---
task_id: "T06"
title: "Generation API 异步化"
dimension: backend
phase: 3
status: done
depends_on: ["T01", "T02", "T03", "T04"]
reviewed_at: "2025-04-06"
review_report: "reviews/T06-backend-review-20260406.md"
---

# T06: Generation API 异步化（后端）

## 任务概要

- **目标**: 改造 `POST /api/generation` 路由，使用 Provider 工厂获取 ImageGenProvider，Replicate 模式下异步提交预测 + 返回 taskId，fal.ai 模式保留原有 fire-and-forget 逻辑，并增加 5 分钟超时定时器
- **依赖**: T01（Provider 工厂）、T02（Schema 扩展）、T03（Replicate 实现）、T04（Webhook 端点）
- **所属模块**: Generation API 改造
- **前置条件**: T01-T04 均已完成
- **不在范围**: 前端改动；Webhook 处理逻辑（T04 已完成）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/api/generation/route.ts` | 主要改造文件：引入 Provider 工厂，分支处理 sync/async |
| create | `src/app/api/generation/__tests__/route.test.ts` | 路由改造后的单元测试（如尚不存在） |

## 实现规格

### 1. 改造 `POST /api/generation`

核心变更逻辑：

```typescript
import { getImageGenProvider } from '@/lib/ai/providers';

export async function POST(request: NextRequest) {
  // ... 认证 + 校验 + analysisTask 校验（不变）...

  // 获取 Provider
  const imageGenProvider = getImageGenProvider();

  // 创建 GenerationTask（新增 provider）
  const task = await createGenerationTask(userId, {
    analysisTaskId: validated.analysisTaskId,
    promptSnapshot: validated.promptText,
    negativePromptSnapshot: validated.negativePromptText,
    params: validated.params,
    modelName: imageGenProvider.name === 'replicate' ? 'black-forest-labs/flux-2-dev' : 'flux.2',
    provider: imageGenProvider.name,
  });

  // 更新状态为 processing
  await updateGenerationTask(task.id, { status: 'processing' });

  // 调用 Provider
  const webhookUrl = buildWebhookUrl('generation', task.id);
  const result = await imageGenProvider.generate({
    prompt: validated.promptText,
    negativePrompt: validated.negativePromptText,
    aspectRatio: validated.params.aspectRatio,
    quality: validated.params.quality,
    webhookUrl,
  });

  if (result.mode === 'sync') {
    // fal.ai 同步模式：保留原有 fire-and-forget 逻辑
    void executeSyncGeneration(task.id, userId, result).catch(async (err) => {
      await updateGenerationTask(task.id, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      });
    });
  } else {
    // Replicate 异步模式：保存 externalId + 启动超时定时器
    await updateGenerationTask(task.id, { externalId: result.externalId });
    startTimeoutTimer(task.id, 5 * 60 * 1000);
  }

  return NextResponse.json({ id: task.id, status: 'processing' }, { status: 201 });
}
```

### 2. fal.ai 同步 fire-and-forget 分支

`executeSyncGeneration()` 接收 Provider 返回的 `{ imageUrl, width, height }`，执行：

1. 下载图片 → 上传到 R2
2. 创建 Asset 记录
3. 更新 GenerationTask completed

这与现有 `executeGenerationCore()` 逻辑一致，但接收的是 Provider 返回值而非直接调用 `generateImage()`。

### 3. 超时定时器

与 T05 相同的 `startTimeoutTimer()` 模式，5 分钟超时后检查 processing 状态并标记 failed。

可复用 T05 中的实现——考虑将 `buildWebhookUrl()` 和 `startTimeoutTimer()` 提取到共享模块（如 `src/lib/ai/webhook-utils.ts`），或直接在 T05 中抽取后本任务复用。

### 4. 日志补充

记录 provider 名称、模式（sync/async）、生成参数。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 引入 Provider 工厂，获取 ImageGenProvider | done | `getImageGenProvider()` |
| 2 | 修改 createGenerationTask 调用，传入 provider | done | 新增字段 |
| 3 | 复用或导入 `buildWebhookUrl()` | done | 创建了 webhook-utils.ts 共享模块 |
| 4 | 实现 async 分支：保存 externalId + 启动超时 + 返回 taskId | done | Replicate 模式 |
| 5 | 实现 sync 分支：保留 fire-and-forget 逻辑 | done | fal.ai 模式 |
| 6 | 复用或导入 `startTimeoutTimer()` | done | 5 分钟超时 |
| 7 | 补充 Provider 相关日志 | done | provider 名称、模式 |
| 8 | 编写/更新单元测试 | done | 覆盖 sync 和 async 两条路径 |
| 9 | 运行 type-check 和 test 验证 | done | 全量测试 |

## 验证命令

```bash
pnpm type-check
pnpm vitest --run src/app/api/generation/__tests__/route.test.ts
pnpm test
```

## 预期结果

- `IMAGE_GEN_PROVIDER=fal` 时：行为与改造前完全一致（fire-and-forget）
- `IMAGE_GEN_PROVIDER=replicate`（默认）时：创建任务 + 提交 Replicate 预测 → 立即返回 `{ id, status: 'processing' }`
- 超时定时器在 5 分钟后检查任务状态
- TypeScript 类型检查通过，所有测试通过

## 交接上下文

- **架构章节**: 6.3（生成链路 Replicate 模式）、6.4（生成链路 fal.ai 备选模式）
- **相关代码**: `src/lib/ai/providers/index.ts`（工厂）、`src/lib/r2.ts`（sync 分支图片转存）、`src/lib/repositories/generation-task-repository.ts`、`src/lib/repositories/asset-repository.ts`
- **契约 / 数据对象**: ImageGenProvider 接口、GenerationTask
- **消费的上游契约摘要**:

```typescript
// T05 提供的共享工具函数
import { buildWebhookUrl, startTimeoutTimer } from '@/lib/ai/webhook-utils';

// Provider 接口返回
| { mode: 'sync'; imageUrl: string; width: number; height: number }
| { mode: 'async'; externalId: string }
```

## 执行指引

- **工具链**: pnpm, Next.js App Router, Vitest
- **执行顺序**: Task 列表按序执行；如 T05 已将 `buildWebhookUrl`/`startTimeoutTimer` 提取为共享模块，直接导入复用
- **阻塞处理**: 如果 T01-T04 任一未完成，暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: Provider 工厂返回值类型；createGenerationTask 新参数；图片转存逻辑（sync 分支）
- **允许修改的额外文件**: `src/lib/ai/webhook-utils.ts`（如需创建共享模块）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 与 T05 类似，开发环境 Webhook 需要公网可达的 URL
- `startTimeoutTimer` 在 Serverless 环境可能不可靠（同 T05 风险）
- fal.ai 模式的返回格式保持一致（`{ id, status }`），前端无需区分 Provider

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 每次 POST 创建新任务，无幂等要求 | done |
| 超时处理 | Replicate 模式 5 分钟超时定时器；fal.ai 模式保留 120s 超时 | done |
| 重试场景 | 用户重试通过创建新任务实现 | done |
| 并发冲突 | 超时定时器和 Webhook 并发更新——终态不可变规则保护 | done |
| 空/无效输入 | 请求体校验不变；Provider 返回值分支处理 | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
