---
task_id: "T03"
title: "上传 API"
dimension: backend
phase: 2
status: done
depends_on: ["T02"]
---

# T03: 上传 API（后端）

## 任务概要

- **目标**: 实现预签名 URL 上传接口和 Cloudflare R2 集成，用户浏览器可通过预签名 URL 直传图片到 R2
- **依赖**: T02（数据模型与 Repository 已就绪）
- **所属模块**: Upload API、对象存储集成
- **前置条件**: R2 Bucket 已创建，R2 相关环境变量已配置
- **不在范围**: 分析触发逻辑、缩略图生成、内容安全审核

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/r2.ts` | R2 S3 客户端，预签名 URL 生成 |
| create | `src/app/api/upload/presign/route.ts` | POST /api/upload/presign 接口 |

## 实现规格

### 1. R2 客户端（r2.ts）

- 使用 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 连接 Cloudflare R2（S3 兼容）
- 从环境变量读取 R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET_NAME、R2_PUBLIC_URL
- endpoint 格式：`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- 导出函数：
  - `generatePresignedUploadUrl(key: string, contentType: string): Promise<string>` — 有效期 10 分钟
  - `getPublicUrl(key: string): string` — 拼接公共访问 URL

### 2. 预签名上传接口（POST /api/upload/presign）

**请求体**：

```typescript
{
  fileName: string;   // 原始文件名
  mimeType: string;   // image/jpeg | image/png | image/webp
}
```

**处理流程**：

1. 校验 mimeType 在允许范围内（image/jpeg, image/png, image/webp）
2. 生成 ULID 作为 assetId
3. 构造存储 key：`references/${assetId}/${fileName}`
4. 调用 `generatePresignedUploadUrl` 获取预签名 URL
5. 构造 fileUrl：`getPublicUrl(key)`

**响应**：

```typescript
{
  presignedUrl: string;  // 前端用此 URL PUT 上传
  fileUrl: string;       // 上传完成后的公共访问地址
  assetId: string;       // 预分配的资产 ID
}
```

**错误处理**：
- mimeType 不合法：返回 400
- R2 签名失败：返回 500

注意：此接口不创建 Asset 记录。Asset 记录在 Analysis API 中创建（架构 6.1 步骤 4）。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 安装 @aws-sdk/client-s3 和 @aws-sdk/s3-request-presigner | done | 添加依赖 |
| 2 | 实现 R2 客户端 | done | r2.ts：S3 client + presign + publicUrl |
| 3 | 实现 POST /api/upload/presign | done | 校验、签名、返回 URL |
| 4 | 手动测试预签名上传 | done | 用 curl 获取 presigned URL，再 PUT 上传文件验证 |

## 验证命令

```bash
pnpm type-check
pnpm build
# 手动测试
curl -X POST http://localhost:3000/api/upload/presign \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.jpg", "mimeType": "image/jpeg"}'
# 预期返回 presignedUrl, fileUrl, assetId
```

## 预期结果

- `pnpm build` 成功
- POST /api/upload/presign 返回包含 presignedUrl、fileUrl、assetId 的 JSON
- 使用返回的 presignedUrl 可成功 PUT 上传图片到 R2
- 上传后 fileUrl 可公开访问到图片

## 交接上下文

- **架构章节**: 6.1 上传与分析（步骤 1-2）、7.3 API 边界、ADR-4
- **相关代码**: `src/lib/repositories/asset-repository.ts`（本任务不直接使用，但下游 T04 在分析时创建 Asset）
- **契约 / 数据对象**: Asset
- **提供给下游的契约摘要**:

```typescript
// POST /api/upload/presign
// Request: { fileName: string; mimeType: string }
// Response: { presignedUrl: string; fileUrl: string; assetId: string }

// src/lib/r2.ts
export function generatePresignedUploadUrl(key: string, contentType: string): Promise<string>;
export function getPublicUrl(key: string): string;
```

## 执行指引

- **工具链**: pnpm, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: R2 Bucket 未创建或 Key 未配置时暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 R2 环境变量是否正确、Bucket CORS 配置是否允许前端直传、预签名 URL 有效期
- **允许修改的额外文件**: `package.json`（添加 AWS SDK 依赖）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Cloudflare R2 需配置 CORS 策略允许浏览器直传（PUT 请求），这是部署配置而非代码问题
- 预签名 URL 有效期设为 10 分钟（架构 ADR-4 建议）
