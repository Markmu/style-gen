---
task_id: "T05"
title: "生成 API"
dimension: backend
phase: 2
status: ready-to-dev
depends_on: ["T02", "T03"]
---

# T05: 生成 API（后端）

## 任务概要

- **目标**: 实现图片生成接口，异步调用 fal.ai/FLUX.2 生图模型，提供生成任务创建和状态查询接口
- **依赖**: T02（数据模型与 Repository）、T03（R2 客户端，用于上传结果图）
- **所属模块**: Generation API、AI 模型集成
- **前置条件**: fal.ai API Key 已配置；R2 客户端可用
- **不在范围**: 分析链路、Prompt 编辑、批量生成、多模型适配

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/image-gen.ts` | fal.ai/FLUX.2 生图客户端 |
| create | `src/app/api/generation/route.ts` | POST /api/generation |
| create | `src/app/api/generation/[id]/route.ts` | GET /api/generation/:id |

## 实现规格

### 1. 生图模型客户端（image-gen.ts）

- 使用 `@fal-ai/client` SDK 调用 FLUX.2 模型
- 从 FAL_KEY 环境变量读取 API Key
- 导出函数：

```typescript
export async function generateImage(params: {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  quality: string;
}): Promise<{ imageUrl: string; width: number; height: number }>
```

- 返回生图模型直接返回的临时图片 URL（后续需转存到 R2）
- 超时设置：120 秒（架构 8.2）

### 2. POST /api/generation

**请求体**：

```typescript
{
  analysisTaskId: string;
  promptText: string;
  negativePromptText: string;
  params: {
    aspectRatio: string;   // "1:1" | "16:9" | "4:3" 等
    quality: string;       // "standard" | "hd"
  }
}
```

**处理流程**（架构 6.2）：

1. 校验输入，验证 analysisTaskId 对应的任务存在且 status 为 completed
2. 创建 GenerationTask 记录（status: 'pending'），保存 Prompt 快照和参数，modelName 填 "flux.2"
3. **立即返回** taskId 和 status（不等待生成完成）
4. 后台异步执行（fire-and-forget）：
   a. 更新任务状态为 'processing'
   b. 调用 `generateImage()` 获取临时图片 URL
   c. 下载临时图片，上传到 R2（key: `generated/${taskId}/result.webp`）
   d. 创建 Asset 记录（type: 'generated'）
   e. 更新 GenerationTask：status 'completed'，关联 resultAssetId
   f. 失败时：更新 status 'failed'，记录 errorMessage

**响应**（立即返回）：

```typescript
{
  id: string;
  status: "pending";
}
```

### 3. 后台异步实现方式

首版使用 fire-and-forget 模式（架构 6.2 实现原则）：

```typescript
// 不 await，让生成在后台运行
void executeGeneration(taskId, params).catch(err => {
  // 确保失败时更新任务状态
});
```

注意：Next.js API Route 在 Vercel Serverless 环境下，response 返回后进程可能终止。如果部署在 Vercel，需要使用 `waitUntil` 或改为同步等待。自托管 Node 环境下 fire-and-forget 可行。

### 4. 结果图转存

生图模型返回的是临时 URL，需转存到 R2：

1. 使用 `fetch` 下载临时图片
2. 使用 R2 客户端上传到 `generated/${taskId}/result.webp`
3. 创建 Asset 记录，fileUrl 为 R2 公共 URL

### 5. GET /api/generation/:id

- 按 ID 查询 GenerationTask
- 如果 status 为 completed 且有 resultAssetId，同时查询关联的 Asset 获取 fileUrl
- 返回完整任务数据 + resultFileUrl

**响应**：

```typescript
{
  id: string;
  analysisTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  resultAssetId: string | null;
  resultFileUrl: string | null;  // Asset.fileUrl，仅 completed 时有值
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
```

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 安装 @fal-ai/client | todo | 添加 fal.ai SDK 依赖 |
| 2 | 实现生图模型客户端 | todo | image-gen.ts：generateImage 函数 |
| 3 | 实现 POST /api/generation | todo | 创建任务 + 异步生成 + 结果转存 R2 |
| 4 | 实现 GET /api/generation/:id | todo | 状态查询，含 resultFileUrl |
| 5 | 手动测试生成链路 | todo | 创建生成任务，轮询状态直到完成 |

## 验证命令

```bash
pnpm type-check
pnpm build
# 手动测试（需先完成一次分析获取 analysisTaskId）
curl -X POST http://localhost:3000/api/generation \
  -H "Content-Type: application/json" \
  -d '{"analysisTaskId": "<id>", "promptText": "a cute cat in watercolor style", "negativePromptText": "blurry, low quality", "params": {"aspectRatio": "1:1", "quality": "standard"}}'
# 轮询状态
curl http://localhost:3000/api/generation/<task_id>
```

## 预期结果

- `pnpm build` 成功
- POST /api/generation 立即返回 taskId 和 pending 状态
- 后台异步完成生图后，GET /api/generation/:id 返回 completed 状态和 resultFileUrl
- resultFileUrl 可公开访问到生成的图片
- 生成失败时，任务状态为 failed，errorMessage 非空

## 交接上下文

- **架构章节**: 6.2 生成（步骤 1-7）、7.2 GenerationTask Schema、7.3 API 边界、ADR-3、ADR-6
- **相关代码**: `src/lib/r2.ts`（T03 创建）、`src/lib/repositories/generation-task-repository.ts`、`src/lib/repositories/asset-repository.ts`
- **契约 / 数据对象**: GenerationTask, GenerationParams, Asset
- **提供给下游的契约摘要**:

```typescript
// POST /api/generation
// Request: { analysisTaskId, promptText, negativePromptText, params: GenerationParams }
// Response: { id: string; status: "pending" }

// GET /api/generation/:id
// Response: GenerationTask & { resultFileUrl: string | null }
```

## 执行指引

- **工具链**: pnpm, @fal-ai/client, Next.js API Routes
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: fal.ai API Key 无效或额度不足时暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 FAL_KEY、网络连通性、fal.ai 模型名称、R2 上传权限
- **允许修改的额外文件**: `package.json`（添加 fal.ai SDK）、`src/lib/r2.ts`（如需添加上传 buffer 的辅助函数）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- fire-and-forget 在 Vercel Serverless 环境下可能不可靠，部署时需验证。如使用 Vercel，考虑使用 `waitUntil` API 或改为同步长请求
- 生图模型临时 URL 可能有过期时间，转存到 R2 要及时完成
- 生图耗时 10-60 秒，前端需合理设置轮询间隔（建议 3 秒）
