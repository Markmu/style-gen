---
task_id: "T09"
title: "限流与错误规范"
dimension: integration
phase: 4
status: ready-to-dev
depends_on: ["T04", "T05", "T07", "T08"]
---

# T09: 限流与错误规范（集成）

## 任务概要

- **目标**: 实现按 IP 限流、统一后端错误响应格式、补齐超时处理、添加结构化日志
- **依赖**: T04（Analysis API）、T05（Generation API）、T07（工作区分析流）、T08（工作区生成流）
- **所属模块**: 跨模块集成
- **前置条件**: 所有 API 端点已实现
- **不在范围**: 降级逻辑、前端错误展示组件、全链路验证（属于 T10）；GA4 埋点（P1）、反馈收集（P1）、用户登录

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/rate-limit.ts` | 按 IP 限流工具 |
| create | `src/middleware.ts` | Next.js Middleware：限流入口 |

## 实现规格

### 1. 按 IP 限流（rate-limit.ts）

基于内存的简单限流（首版不引入 Redis）：

```typescript
interface RateLimitConfig {
  windowMs: number;     // 时间窗口
  maxRequests: number;  // 最大请求数
}

export function checkRateLimit(ip: string, action: string, config: RateLimitConfig): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}
```

按架构 8.3 配置：
- upload: 10 次/小时
- analysis: 10 次/小时
- generation: 20 次/小时

注意：内存限流在多实例部署时不共享，首版单实例可接受。

### 2. Next.js Middleware（middleware.ts）

- 拦截 `/api/upload/*`、`/api/analysis`、`/api/generation` 的 POST 请求
- 从请求中提取客户端 IP
- 调用 `checkRateLimit` 判断是否允许
- 超限时返回 429 Too Many Requests，携带 `Retry-After` header
- 配置 matcher 只匹配 API 路由

### 3. 后端错误格式统一

所有 API 错误响应格式：

```typescript
{
  error: string;        // 用户可读的错误描述
  code: string;         // 错误码，如 "RATE_LIMITED", "VISION_FAILED", "GENERATION_TIMEOUT"
  retryable: boolean;   // 是否可重试
}
```

审查并统一 T03、T04、T05 中各 API 的错误返回格式。

### 4. 超时处理

- 分析 API：60 秒超时（架构 8.2）
- 生成 API：120 秒超时
- 超时按失败处理，记录 errorMessage

### 5. 结构化日志

在各 API 端点添加结构化 JSON 日志（架构 8.5）：

```typescript
console.log(JSON.stringify({
  event: "analysis_completed",
  taskId: task.id,
  duration: elapsedMs,
  status: task.status,
  timestamp: new Date().toISOString()
}));
```

覆盖：请求开始、任务创建、模型调用开始/结束、任务完成/失败。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 实现按 IP 限流工具 | todo | rate-limit.ts |
| 2 | 实现 Next.js Middleware | todo | middleware.ts：API 限流 |
| 3 | 统一后端错误响应格式 | todo | 审查并修改 T03/T04/T05 的 API 错误返回 |
| 4 | 补齐超时处理 | todo | 分析 60s、生成 120s 超时 |
| 5 | 添加结构化日志 | todo | 各 API 端点关键节点日志 |

## 验证命令

```bash
pnpm type-check
pnpm build
pnpm lint
# 手动测试限流
# 连续快速请求同一 API，验证限流返回 429 + Retry-After
```

## 预期结果

- 限流正常工作，超限返回 429 + Retry-After
- 所有 API 错误响应格式统一（error + code + retryable）
- 超时处理正确，超时后任务标记为 failed
- 结构化日志在控制台正确输出
- `pnpm build` 和 `pnpm lint` 无报错

## 交接上下文

- **架构章节**: 8.2 错误处理与降级、8.3 安全与反滥用、8.5 可观测性
- **相关代码**: 所有 API route 文件
- **契约 / 数据对象**: 统一错误响应格式
- **提供给下游的契约摘要**:

```typescript
// 统一错误响应格式
interface ApiError {
  error: string;
  code: string;     // "RATE_LIMITED" | "VISION_FAILED" | "LLM_FAILED" | "GENERATION_TIMEOUT" | "SERVICE_UNAVAILABLE" | ...
  retryable: boolean;
}

// src/lib/rate-limit.ts
export function checkRateLimit(ip: string, action: string, config: RateLimitConfig): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}
```

## 执行指引

- **工具链**: Next.js Middleware, pnpm
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果前置任务（T04/T05/T07/T08）有未修复的 bug，暂停并报告具体阻塞点
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 Middleware matcher 配置、IP 提取逻辑、错误响应格式一致性
- **允许修改的额外文件**: `src/app/api/upload/presign/route.ts`、`src/app/api/analysis/route.ts`、`src/app/api/analysis/[id]/route.ts`、`src/app/api/generation/route.ts`、`src/app/api/generation/[id]/route.ts`（统一错误格式和添加日志）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 内存限流在进程重启后重置，首版可接受
- 结构化日志是首版最小可观测方案，后续可接入专业日志服务
