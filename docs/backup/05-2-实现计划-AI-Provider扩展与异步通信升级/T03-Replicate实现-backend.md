---
task_id: "T03"
title: "Replicate Provider 实现"
dimension: backend
phase: 2
status: done
depends_on: ["T01"]
---

# T03: Replicate Provider 实现（后端）

## 任务概要

- **目标**: 安装 Replicate SDK，实现 ReplicateVisionProvider 和 ReplicateImageGenProvider，更新工厂函数的 Replicate 分支
- **依赖**: T01（Provider 接口定义和工厂骨架）
- **所属模块**: Provider 实现层
- **前置条件**: T01 已完成；`REPLICATE_API_TOKEN` 环境变量已配置
- **不在范围**: Webhook 处理（T04）；API 路由改造（T05/T06）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/providers/replicate-vision.ts` | ReplicateVisionProvider 实现 |
| create | `src/lib/ai/providers/replicate-image-gen.ts` | ReplicateImageGenProvider 实现 |
| modify | `src/lib/ai/providers/index.ts` | 补入 Replicate 分支，替换 throw |
| create | `src/lib/ai/providers/__tests__/replicate-vision.test.ts` | ReplicateVisionProvider 单元测试 |
| create | `src/lib/ai/providers/__tests__/replicate-image-gen.test.ts` | ReplicateImageGenProvider 单元测试 |

## 实现规格

### 0. 安装依赖

```bash
pnpm add replicate
```

### 1. ReplicateVisionProvider (`replicate-vision.ts`)

```typescript
import Replicate from 'replicate';
import type { VisionProvider } from './types';

const MODEL = 'google/gemini-2.5-flash' as const;

export class ReplicateVisionProvider implements VisionProvider {
  readonly name = 'replicate' as const;
  private client: Replicate;

  constructor() {
    this.client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  }

  async analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;
  }): Promise<{ mode: 'async'; externalId: string }> {
    const prediction = await this.client.predictions.create({
      model: MODEL,
      input: {
        image: params.imageUrl,
        prompt: '...',  // 使用 VISION_SYSTEM_PROMPT + 分析指令
      },
      webhook: params.webhookUrl,
      webhook_events_filter: ['completed'],
    });

    return { mode: 'async', externalId: prediction.id };
  }
}
```

关键点：
- 始终返回 `{ mode: 'async', externalId }` — Replicate 模式永远是异步的
- `webhookUrl` 必须传入，否则抛错（Replicate 模式需要 Webhook）
- 使用 `VISION_SYSTEM_PROMPT` 作为 prompt 的一部分（从 `prompts.ts` 导入）
- Replicate `predictions.create()` 的 `input` 格式根据 `google/gemini-2.5-flash` 模型要求设置

### 2. ReplicateImageGenProvider (`replicate-image-gen.ts`)

```typescript
import Replicate from 'replicate';
import type { ImageGenProvider } from './types';

const MODEL = 'black-forest-labs/flux-2-dev' as const;

export class ReplicateImageGenProvider implements ImageGenProvider {
  readonly name = 'replicate' as const;
  private client: Replicate;

  constructor() {
    this.client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  }

  async generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<{ mode: 'async'; externalId: string }> {
    const prediction = await this.client.predictions.create({
      model: MODEL,
      input: {
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
        num_outputs: 1,
      },
      webhook: params.webhookUrl,
      webhook_events_filter: ['completed'],
    });

    return { mode: 'async', externalId: prediction.id };
  }
}
```

关键点：
- 始终返回 `{ mode: 'async', externalId }`
- `webhookUrl` 必须传入
- `input` 字段映射参照 `black-forest-labs/flux-2-dev` 模型文档

### 3. 更新工厂 (`index.ts`)

将 Replicate 分支从 `throw new Error(...)` 改为实例化 Provider：

```typescript
case 'replicate':
  return new ReplicateVisionProvider();
// ...
case 'replicate':
  return new ReplicateImageGenProvider();
```

### 4. 单元测试

Mock `Replicate` 客户端的 `predictions.create()` 方法，验证：
- 传入正确的 model、input、webhook、webhook_events_filter
- 返回正确的 `{ mode: 'async', externalId }` 结构
- 缺少 `REPLICATE_API_TOKEN` 时构造函数行为（由 SDK 自行处理或抛错）
- webhookUrl 未传入时应抛出明确错误

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 安装 `replicate` npm 包 | done | `pnpm add replicate` |
| 2 | 实现 ReplicateVisionProvider | done | 调用 predictions.create()，返回 async 模式 |
| 3 | 实现 ReplicateImageGenProvider | done | 同上 |
| 4 | 更新 `index.ts` 工厂 Replicate 分支 | done | 替换 throw 为实例化 |
| 5 | 编写单元测试 | done | Mock SDK，验证调用参数和返回值 |
| 6 | 运行 type-check 和 test 验证 | done | 全量测试 |

## 验证命令

```bash
pnpm type-check
pnpm vitest --run src/lib/ai/providers/__tests__/replicate-vision.test.ts
pnpm vitest --run src/lib/ai/providers/__tests__/replicate-image-gen.test.ts
pnpm vitest --run src/lib/ai/providers/__tests__/factory.test.ts
```

## 预期结果

- `replicate` 包安装成功，`package.json` 中包含依赖
- ReplicateVisionProvider 和 ReplicateImageGenProvider 正确调用 Replicate SDK
- 工厂函数默认返回 Replicate Provider（环境变量未设置或设为 `replicate`）
- 所有单元测试通过

## 交接上下文

- **架构章节**: 3 ADR-1、ADR-2（Replicate 异步回调）、5.2（Provider 实现层）
- **相关代码**: `src/lib/ai/providers/types.ts`、`src/lib/ai/providers/index.ts`、`src/lib/ai/prompts.ts`
- **契约 / 数据对象**: VisionProvider、ImageGenProvider 接口
- **提供给下游的契约摘要**:

```typescript
// ReplicateVisionProvider.analyze() 始终返回:
{ mode: 'async'; externalId: string }

// ReplicateImageGenProvider.generate() 始终返回:
{ mode: 'async'; externalId: string }

// Replicate prediction 完成后通过 Webhook 回调，payload 中包含 prediction 结果
// webhookUrl 格式: /api/webhooks/replicate?taskType=analysis&taskId={taskId}
```

## 执行指引

- **工具链**: pnpm, Replicate SDK, Vitest
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果 Replicate SDK 类型定义与预期不符，查阅 SDK 文档确认 API；如果模型 input 格式不确定，参考 Replicate 模型页面
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: Replicate SDK 版本兼容性；`predictions.create()` 参数格式；模型 input schema
- **允许修改的额外文件**: `package.json`、`pnpm-lock.yaml`（安装依赖）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Replicate 模型的 input 字段格式需参照各模型的实际 API 文档，规格中的 input 结构是示意，实现时需确认
- 测试全程 mock SDK，不依赖真实 Replicate API 调用

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 每次 analyze/generate 创建新 prediction，Replicate 侧无幂等要求 | done |
| 超时处理 | Replicate predictions.create() 是提交操作（非等待结果），HTTP 超时由 SDK 默认处理 | done |
| 重试场景 | 创建 prediction 失败时抛错，调用方决定是否重试 | done |
| 并发冲突 | 无状态 Provider 实例，无并发问题 | done |
| 空/无效输入 | webhookUrl 未传入时显式抛错（Replicate 模式必须有 Webhook） | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
