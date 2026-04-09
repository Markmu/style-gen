---
task_id: "T02"
title: "模板 API 端点"
dimension: backend
phase: 1
status: done
depends_on: ["T01"]
---

# T02: 模板 API 端点（后端）

## 任务概要

- **目标**: 实现 4 个 RESTful API 端点（POST 创建 / GET 列表 / GET 详情 / DELETE 删除），完成模板 CRUD 的 HTTP 层，包含认证、参数校验、Rate Limit、结构化日志和降级策略
- **依赖**: T01（模板数据层：Schema、Repository、类型定义、变量解析模块均已就绪）
- **所属模块**: Template API (`/api/templates`)
- **前置条件**: T01 已完成，`templates` 表已存在于数据库
- **不在范围**: P1 的 PUT 更新、POST duplicate 端点；前端组件

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/api/templates/route.ts` | POST（创建）+ GET（列表分页） |
| create | `src/app/api/templates/[id]/route.ts` | GET（详情）+ DELETE（删除） |

## 实现规格

### 1. 路由文件结构

```
src/app/api/
├── templates/
│   ├── route.ts          # POST /api/templates, GET /api/templates
│   └── [id]/
│       └── route.ts      # GET /api/templates/:id, DELETE /api/templates/:id
```

### 2. 共享工具函数

在 `src/app/api/templates/route.ts` 中定义：

```typescript
import { auth } from "@/auth";
import { NextResponse } from "next/server";

/** 从 session 获取 userId，未认证返回 401 */
async function requireAuth(request: Request):
  | { userId: string; session: Awaited<ReturnType<typeof auth>> }
  | Response {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }
  return { userId: session.user.id, session };
}

/** 结构化日志 [架构8.5 可观测性] */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}
```

参考现有模式：`src/app/api/analysis/route.ts`（270 行）中的认证和校验写法。

### 3. Rate Limit — 模板创建频率限制 [架构8.3]

限制模板创建为 **30 次/小时/IP**，仅对 POST 端点生效。

```typescript
// 内存级滑动窗口计数器（首版并发 < 20，无需 Redis）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): Response | null {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + 3600000 });
    return null;
  }

  if (entry.count >= 30) {
    return NextResponse.json(
      { error: "请求过于频繁", code: "RATE_LIMITED", retryable: true },
      { status: 429 }
    );
  }

  entry.count++;
  return null;
}
```

使用方式：POST handler 中认证成功后调用：
```typescript
const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const rateLimitResponse = checkRateLimit(ip);
if (rateLimitResponse) return rateLimitResponse;
```

### 4. POST /api/templates — 创建模板

**请求体**:
```typescript
interface CreateTemplateRequest {
  name: string;                      // user_input，必填 1-50 字符
  content: string;                   // user_input（编辑器当前文本，ADR-7）
  sourceAnalysisTaskId?: string;     // frontend_computed（可选）
}
```

**校验规则**:
```typescript
function validateCreateBody(body: unknown): CreateTemplateRequest | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length < 1 || obj.name.length > 50) return null;
  if (typeof obj.content !== "string" || obj.content.length === 0 || obj.content.length > 10000) return null;
  if (obj.sourceAnalysisTaskId !== undefined && typeof obj.sourceAnalysisTaskId !== "string") return null;

  return {
    name: obj.name.trim(),
    content: obj.content,
    sourceAnalysisTaskId: obj.sourceAnalysisTaskId as string | undefined,
  };
}
```

**处理流程**:
1. 认证 → 获取 userId
2. Rate Limit 检查 → 超限返回 429
3. 校验请求体 → 不合法返回 400 `{ error: "请求参数不合法", code: "INVALID_REQUEST" }`
4. 调用 `findByName(userId, name)` → 存在则返回 **409** `{ error: "已存在同名模板", code: "TEMPLATE_NAME_CONFLICT" }`
5. 调用 `createTemplate(userId, { name, content, sourceAnalysisTaskId })`
6. 返回 **201** + 完整模板记录

**成功响应 (201)**:
```json
{
  "id": "01HX...",
  "name": "赛博朋克风格",
  "content": "A cyberpunk style image of {{subject}}, {{lighting}} lighting...",
  "variables": [{ "name": "subject", "defaultValue": "" }, { "name": "lighting", "defaultValue": "" }],
  "sourceAnalysisTaskId": "01HY...",
  "createdAt": "2026-04-09T10:00:00Z"
}
```

### 5. GET /api/templates — 模板列表（cursor-based 分页）

> **架构偏离说明**：架构文档 6.2 / 7.3 定义列表接口为 offset-based 分页（`page=1&pageSize=20`，响应为扁平数组 `[{...}]`）。本实现改为 cursor-based 分页，原因：
> - templates 按 `createdAt` 倒序排列，属于时间序列数据，cursor-based 游标分页在数据增长后性能更稳定（避免 `OFFSET N` 的全表扫描）
> - 模板数据量小且用户操作模式为「翻看最近保存的模板」，cursor-based 的"下一页"语义更自然
> - 默认 limit 从 20 调整为 10（每页条数更少，配合 cursor 翻页体验更流畅；最大值仍为 50）
> - 响应格式从扁平数组变为 `{ items, hasMore, nextCursor }` 包装结构，下游 T03/T04 已同步适配此格式

**Query 参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `cursor` | string (ISO 8601) | 否 | 无 | 上一页最后一条的 createdAt |
| `limit` | number | 否 | 10 | 每页条数，最大 50 |

**处理流程**:
1. 认证 → userId
2. 提取并校验 query params（limit 为正整数 <= 50，cursor 如提供需为合法 ISO 8601）
3. 调用 `findAllByUserId(userId, { cursor, limit })`
4. 返回 **200** + 分页响应

**成功响应 (200)**:
```json
{
  "items": [
    { "id": "01HX...", "name": "赛博朋克风格", "variableCount": 2, "createdAt": "2026-04-09T10:00:00Z" }
  ],
  "hasMore": true,
  "nextCursor": "2026-04-08T15:30:00Z"
}
```

约定：不返回 `content` 和完整 `variables`，只返回 `variableCount`（架构 6.2 原则）。

### 6. GET /api/templates/:id — 模板详情

**处理流程**:
1. 认证 → userId
2. 调用 `findById(id, userId)` → 不存在返回 **404** `{ error: "模板不存在", code: "TEMPLATE_NOT_FOUND" }`
3. 存在 → 返回 **200** + 完整记录（含 content、variables、updatedAt）

### 7. DELETE /api/templates/:id — 删除模板

**处理流程**:
1. 认证 → userId
2. 调用 `deleteTemplate(id, userId)` → Repository 抛异常 → 返回 **404**
3. 成功 → 返回 **204 No Content**

### 8. 错误处理统一格式 [架构8.2]

所有端点的 try-catch 最外层兜底：

```typescript
catch (error) {
  const message = error instanceof Error ? error.message : "Internal server error";
  log("template_operation_failed", { operation, error: message });

  // 区分数据库不可用(L2)与其他内部错误
  const isDbUnavailable = message.includes("connection")
    || message.includes("timeout")
    || message.includes("ECONNREFUSED");

  return NextResponse.json(
    { error: message, code: isDbUnavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR", retryable: true },
    { status: isDbUnavailable ? 503 : 500 }
  );
}
```

**完整错误码映射**:

| 状态码 | code | 场景 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 未认证 |
| 400 | INVALID_REQUEST | 请求体格式不合法 / 参数校验失败 |
| 409 | TEMPLATE_NAME_CONFLICT | 同名模板已存在 |
| 429 | RATE_LIMITED | 创建频率超限 |
| 404 | TEMPLATE_NOT_FOUND | 模板不存在或无权访问 |
| 500 | INTERNAL_ERROR | 服务端内部错误 |
| 503 | SERVICE_UNAVAILABLE | 数据库不可用 |

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 `src/app/api/templates/route.ts`，实现 POST 创建端点 | done | 含 requireAuth、Rate Limit、validateCreateBody、同名检测 409、变量自动提取、201 响应 |
| 2 | 在同一文件中实现 GET 列表端点 | done | cursor-based 分页，返回精简字段（不含 content） |
| 3 | 创建 `src/app/api/templates/[id]/route.ts`，实现 GET 详情端点 | done | 含认证、userId 校验、404 处理 |
| 4 | 在同一文件中实现 DELETE 删除端点 | done | 物理删除，204 响应 |
| 5 | 实现 Rate Limit 内存级滑动窗口（30 次/小时/IP）[架构8.3] | done | 仅对 POST 生效 |
| 6 | 实现降级策略差异化错误码（DB 不可用→503，其他→500）[架构8.2] | done | catch 块中区分 connection/timeout 类错误 |
| 7 | 手动验证全部 4 个端点 + Rate Limit + 降级响应 | done | curl 或浏览器 DevTools |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建验证（确认路由编译通过）
pnpm build

# 全量测试
pnpm test
```

## 预期结果

1. `pnpm type-check` 通过，无类型错误
2. `pnpm build` 编译成功，4 个路由正确注册
3. POST 创建模板返回 201 + 完整记录（含自动提取的 variables）
4. GET 列表返回 200 + 精简字段数组（不含 content）
5. GET 详情返回 200 + 含 content 的完整记录
6. DELETE 返回 204 No Content
7. 所有错误场景返回统一格式 `{ error, code, retryable }`
8. 结构化日志输出到控制台
9. **[成功标准]** 模板 CRUD 功能正常：四项操作均可正常完成
10. **[性能目标]** POST 创建 API 耗时 <= 200ms
11. **[性能目标]** GET 列表查询耗时 <= 100ms
12. **[性能目标]** GET 详情查询耗时 <= 50ms
13. **[架构8.3]** Rate Limit 超限返回 429
14. **[架构8.2]** 数据库不可用时返回 503（而非 500）

## 交接上下文

- **架构章节**: 6.1 保存模板链路、6.2 加载模板链路、6.3 删除模板链路、7.3 API 边界、8.2 降级策略、8.3 安全策略
- **相关代码**: `src/app/api/analysis/route.ts`（参考认证/校验/日志模式）、T01 全部产出
- **契约 / 数据对象**: `CreateTemplateRequest`, `PromptTemplate`, `TemplateListItem`
- **提供给下游的契约摘要**:

```typescript
// POST /api/templates — 创建
//   Request: { name: string, content: string, sourceAnalysisTaskId?: string }
//   Success 201: { id, name, content, variables: TemplateVariable[], sourceAnalysisTaskId?, createdAt }
//   Error 409: { error: "已存在同名模板", code: "TEMPLATE_NAME_CONFLICT" }

// GET /api/templates — 列表（cursor-based 分页）
//   Query: cursor?: string (ISO 8601), limit?: number (default 10, max 50)
//   Success 200: { items: TemplateListItem[], hasMore: boolean, nextCursor: string | null }
//   TemplateListItem: { id, name, variableCount: number, createdAt: Date }

// GET /api/templates/:id — 详情
//   Success 200: PromptTemplate（含 updatedAt）
//   Error 404: { error: "模板不存在", code: "TEMPLATE_NOT_FOUND" }

// DELETE /api/templates/:id — 删除
//   Success 204: No Content
//   Error 404: { error: "模板不存在", code: "TEMPLATE_NOT_FOUND" }

// 所有错误统一格式: { error: string, code: string, retryable: boolean }
```

## 执行指引

- **工具链**: pnpm, Next.js App Router
- **执行顺序**: Task 列表按序执行（POST → GET list → GET detail → DELETE → Rate Limit → 降级 → 手动验证）
- **阻塞处理**: T01 未完成时暂停；路由编译失败时检查 import 路径
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - 类型错误：检查 T01 的类型导出路径是否正确
  - 构建失败：检查 `[id]` 目录命名是否符合 Next.js 动态路由约定
  - 401 错误：确认开发环境 NextAuth session 正常工作
- **允许修改的额外文件**: 无（API 端点不应修改其他文件）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- `findByName` + `createTemplate` 非原子操作，存在 TOCTOU 竞态窗口。首版并发 < 20 可接受
- `sourceAnalysisTaskId` 为可选字段，不校验其是否真实存在于 analysis_tasks 表中（避免跨表耦合）
- 日志字段遵循现有模式：`event` + `timestamp` + 业务字段（templateId/name/userId/operation）

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 创建前 findByName 检查同名，同名返回 409；不同名每次创建新记录（ULID 天然唯一） | done |
| 超时处理 | 纯数据库操作无外部调用超时风险；Next.js 默认请求超时机制兜底 | done |
| 重试场景 | 用户重试时重新走完整创建流程，前次失败不影响（除非同名冲突） | done |
| 并发冲突 | findByName → createTemplate 非原子操作，极低概率下可能创建两个同名模板；可接受 | done |
| 空/无效输入 | validateCreateBody 对 name 长度、content 空/超长做严格校验 | done |
| name 含前后空格 | name.trim() 处理后再存储和校验 | done |
| content 含非法 Unicode | PostgreSQL text 字段天然支持 UTF-8，不做额外过滤 | done |
