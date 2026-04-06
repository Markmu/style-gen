---
task_id: "T01"
title: "Provider 接口与工厂"
dimension: backend
phase: 1
status: done
depends_on: []
---

# T01: Provider 接口与工厂（后端）

## 任务概要

- **目标**: 定义 VisionProvider / ImageGenProvider 接口，创建工厂函数读取环境变量实例化 Provider，并将现有 Gemini Vision 和 fal.ai ImageGen 包装为 Provider 实现
- **依赖**: 无
- **所属模块**: Provider 工厂 (`ai/providers/`)
- **前置条件**: 现有 `src/lib/ai/vision.ts` 和 `src/lib/ai/image-gen.ts` 功能正常
- **不在范围**: ~~Replicate Provider 实现（T03）~~ → 因 Wave 1/Wave 2 并行执行，Replicate Provider 实现与工厂函数 Replicate 分支在本任务中一并完成（T03 同步完成，无功能重叠）；API 路由改造（T05/T06）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/providers/types.ts` | VisionProvider / ImageGenProvider 接口定义 |
| create | `src/lib/ai/providers/gemini-vision.ts` | GeminiVisionProvider 实现，包装现有 vision.ts 逻辑 |
| create | `src/lib/ai/providers/fal-image-gen.ts` | FalImageGenProvider 实现，包装现有 image-gen.ts 逻辑 |
| create | `src/lib/ai/providers/index.ts` | 工厂函数 getVisionProvider() / getImageGenProvider() |
| create | `src/lib/ai/providers/__tests__/factory.test.ts` | 工厂函数单元测试 |

## 实现规格

### 1. Provider 接口定义 (`types.ts`)

```typescript
/** 视觉分析 Provider 接口 */
export interface VisionProvider {
  readonly name: 'replicate' | 'gemini';

  analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;
  }): Promise<
    | { mode: 'sync'; result: string }
    | { mode: 'async'; externalId: string }
  >;
}

/** 图像生成 Provider 接口 */
export interface ImageGenProvider {
  readonly name: 'replicate' | 'fal';

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
```

接口返回值使用 discriminated union（`mode` 字段），调用方根据 `mode` 判断是同步结果还是异步提交。

### 2. GeminiVisionProvider (`gemini-vision.ts`)

- 复用 `src/lib/ai/vision.ts` 中的 `analyzeImage()` 函数
- `name` 固定为 `'gemini'`
- `analyze()` 忽略 `webhookUrl` 参数，始终返回 `{ mode: 'sync', result: string }`
- 不改动原有 `vision.ts` 文件，通过 import 复用

### 3. FalImageGenProvider (`fal-image-gen.ts`)

- 复用 `src/lib/ai/image-gen.ts` 中的 `generateImage()` 函数
- `name` 固定为 `'fal'`
- `generate()` 忽略 `webhookUrl` 参数，始终返回 `{ mode: 'sync', imageUrl, width, height }`
- 不改动原有 `image-gen.ts` 文件，通过 import 复用

### 4. 工厂函数 (`index.ts`)

```typescript
export function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER || 'replicate';
  switch (provider) {
    case 'gemini':
      return new GeminiVisionProvider();
    case 'replicate':
      // T03 实现后补入，当前阶段抛出 "not implemented"
      throw new Error('Replicate vision provider not yet implemented');
    default:
      throw new Error(`Unknown vision provider: ${provider}`);
  }
}

export function getImageGenProvider(): ImageGenProvider {
  const provider = process.env.IMAGE_GEN_PROVIDER || 'replicate';
  switch (provider) {
    case 'fal':
      return new FalImageGenProvider();
    case 'replicate':
      throw new Error('Replicate image gen provider not yet implemented');
    default:
      throw new Error(`Unknown image gen provider: ${provider}`);
  }
}
```

T03 完成前，工厂函数中 Replicate 分支抛错，不影响 Gemini/fal.ai 分支的正常使用。

### 5. 单元测试 (`factory.test.ts`)

- 验证 `VISION_PROVIDER=gemini` 时返回 GeminiVisionProvider
- 验证 `IMAGE_GEN_PROVIDER=fal` 时返回 FalImageGenProvider
- 验证未知 provider 名称时抛错
- 验证默认值（未设置环境变量）时行为正确
- Mock `analyzeImage` / `generateImage` 验证 Provider 包装的 `analyze()` / `generate()` 方法返回正确的 discriminated union

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 `types.ts` 定义 VisionProvider / ImageGenProvider 接口 | done | 按架构 7.2 节的接口定义 |
| 2 | 创建 `gemini-vision.ts` 实现 GeminiVisionProvider | done | 包装现有 analyzeImage()，返回 sync 模式 |
| 3 | 创建 `fal-image-gen.ts` 实现 FalImageGenProvider | done | 包装现有 generateImage()，返回 sync 模式 |
| 4 | 创建 `index.ts` 工厂函数 | done | 读取环境变量，switch 分支实例化 Provider |
| 5 | 创建工厂函数单元测试 | done | 覆盖所有分支 + mock 验证 |
| 6 | 运行 type-check 和 test 验证 | done | `pnpm type-check && pnpm test` |

## 验证命令

```bash
pnpm type-check
pnpm vitest --run src/lib/ai/providers/__tests__/factory.test.ts
```

## 预期结果

- `VisionProvider` 和 `ImageGenProvider` 接口定义完整，TypeScript 类型检查通过
- GeminiVisionProvider 正确包装 `analyzeImage()`，返回 `{ mode: 'sync', result }`
- FalImageGenProvider 正确包装 `generateImage()`，返回 `{ mode: 'sync', imageUrl, width, height }`
- 工厂函数根据环境变量返回正确实现
- 所有单元测试通过

## 交接上下文

- **架构章节**: 3 ADR-1（Provider 接口抽象 + 环境变量切换）、7.2（Provider 接口定义）
- **相关代码**: `src/lib/ai/vision.ts`、`src/lib/ai/image-gen.ts`
- **契约 / 数据对象**: `VisionProvider`、`ImageGenProvider` 接口
- **提供给下游的契约摘要**:

```typescript
// src/lib/ai/providers/types.ts
export interface VisionProvider {
  readonly name: 'replicate' | 'gemini';
  analyze(params: { imageUrl: string; mimeType: string; webhookUrl?: string }): Promise<
    | { mode: 'sync'; result: string }
    | { mode: 'async'; externalId: string }
  >;
}

export interface ImageGenProvider {
  readonly name: 'replicate' | 'fal';
  generate(params: { prompt: string; negativePrompt: string; aspectRatio: string; quality: string; webhookUrl?: string }): Promise<
    | { mode: 'sync'; imageUrl: string; width: number; height: number }
    | { mode: 'async'; externalId: string }
  >;
}

// src/lib/ai/providers/index.ts
export function getVisionProvider(): VisionProvider;
export function getImageGenProvider(): ImageGenProvider;
```

## 执行指引

- **工具链**: pnpm, TypeScript, Vitest
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果现有 `vision.ts` 或 `image-gen.ts` 接口签名发生变化，暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 `analyzeImage` / `generateImage` 的导入路径和函数签名是否与现有代码一致
- **允许修改的额外文件**: 无
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 现有 `vision.ts` 和 `image-gen.ts` 不做修改，仅通过 import 复用，避免影响已有功能
- Replicate 分支在 T03 完成前抛 "not implemented"，这是预期行为

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | Provider 工厂每次返回新实例，无状态，天然幂等 | done |
| 超时处理 | Provider 实现内部自行处理超时（现有逻辑已有），接口层不约束 | done |
| 重试场景 | 调用方负责重试逻辑，Provider 接口无重试语义 | done |
| 并发冲突 | 工厂函数读取 process.env 是只读操作，无并发问题 | done |
| 空/无效输入 | 未知 provider 名称时工厂函数抛 Error | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
