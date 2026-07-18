---
task_id: "T02"
title: "认证中间件与路由守卫"
dimension: backend
phase: 2
status: done
depends_on: ["T01"]
---

# T02: 认证中间件与路由守卫（后端）

## 任务概要

- **目标**: 在现有 `src/middleware.ts` 中扩展认证拦截逻辑，实现页面路由守卫（未登录访问 /workspace 重定向首页）和 API 路由认证前置检查（未登录返回 401），同时将 Rate Limit key 从 IP 升级为 userId（已登录）/ IP（未登录）
- **依赖**: T01（Auth.js 配置、`auth()` 函数可用）
- **所属模块**: Auth Middleware
- **前置条件**: T01 已完成，`src/auth.ts` 导出的 `auth()` 函数可用
- **不在范围**: Repository 层改造、API Route 内部逻辑改造、前端 UI

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/middleware.ts` | 扩展认证拦截 + 升级限流 key + L3 降级开关 |
| modify | `src/lib/rate-limit.ts` | 函数签名文档注释更新（key 参数语义从 IP 扩展为 identifier） |
| modify | `.env.example` | 新增 AUTH_REQUIRED=true |

## 实现规格

### 1. Middleware 改造策略

现有 `src/middleware.ts` 仅处理 POST 请求的 IP 限流。改造后需要：

1. **页面路由守卫**：`/workspace` 路径需登录，未登录重定向到 `/`
2. **API 路由认证**：`/api/upload/presign`、`/api/analysis`、`/api/analysis/:id`、`/api/generation`、`/api/generation/:id` 需登录，未登录返回 401
3. **Rate Limit key 升级**：已登录用户用 `userId` 作为限流 key，未登录用 IP
4. **放行路由**：`/api/auth/*` 由 Auth.js 自管理，不拦截；`/` 首页公开访问

### 2. 实现方案

使用 Auth.js v5 的 `auth()` 作为 middleware wrapper（推荐方式）：

```typescript
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

// 需要认证的页面路由
const PROTECTED_PAGES = ["/workspace"];

// 需要认证的 API 路由前缀
const PROTECTED_API_PREFIX = "/api/";

// 公开的 API 路由（不需要认证）
const PUBLIC_API_PREFIXES = ["/api/auth/"];

// 限流路由映射（复用现有）
const ROUTE_ACTION_MAP: Record<string, string> = {
  "/api/upload/presign": "upload",
  "/api/analysis": "analysis",
  "/api/generation": "generation",
};

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // 0. L3 降级：认证配置开关（架构 8.2 + 结论 5）
  // AUTH_REQUIRED 默认 true；设为 "false" 时跳过所有认证检查，回退到 01 期匿名模式
  if (process.env.AUTH_REQUIRED === "false") {
    // 仅保留限流逻辑，跳过认证
    if (req.method === "POST") {
      // ... 限流逻辑（同下方 step 4）
    }
    return NextResponse.next();
  }

  // 1. Auth.js 路由放行
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. 页面路由守卫
  if (PROTECTED_PAGES.some((p) => pathname.startsWith(p))) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // 3. API 路由认证
  if (pathname.startsWith(PROTECTED_API_PREFIX) && !session?.user) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  // 4. Rate Limit（仅 POST）
  if (req.method === "POST") {
    const action = ROUTE_ACTION_MAP[pathname];
    if (action) {
      const config = RATE_LIMIT_CONFIGS[action];
      if (config) {
        // ADR-12: 已登录用 userId，未登录用 IP
        const identifier = session?.user?.id ?? getClientIp(req);
        const result = checkRateLimit(identifier, action, config);
        if (!result.allowed) {
          const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
          return NextResponse.json(
            { error: "Too many requests. Please try again later.", code: "RATE_LIMITED", retryable: true },
            { status: 429, headers: { "Retry-After": String(Math.max(retryAfterSeconds, 1)) } }
          );
        }
      }
    }
  }

  return NextResponse.next();
});
```

### 3. Matcher 配置更新

```typescript
export const config = {
  matcher: [
    "/workspace/:path*",
    "/api/upload/presign",
    "/api/analysis/:path*",
    "/api/generation/:path*",
  ],
};
```

注意：不匹配 `/api/auth/*`，Auth.js 路由不经过自定义 middleware。

### 4. `getClientIp` 函数

保留现有的 `getClientIp` 逻辑，作为 middleware 内的辅助函数。

### 5. `rate-limit.ts` 变更

`checkRateLimit` 函数签名不变（第一个参数已经是 `string`），但语义从 "IP" 扩展为 "identifier"（可以是 userId 或 IP）。仅需更新 JSDoc 注释。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 重写 `src/middleware.ts`，使用 `auth()` wrapper 模式 | done | 集成认证检查 + 限流 |
| 2 | 增加 `AUTH_REQUIRED` 环境变量支持（L3 降级开关） | done | 默认 true，false 时跳过认证 |
| 3 | 更新 matcher 配置，覆盖页面路由和 API 路由 | done | 包含 /workspace 和所有业务 API |
| 4 | 升级 Rate Limit key 为 userId / IP | done | ADR-12 |
| 5 | 更新 `rate-limit.ts` JSDoc 注释 | done | 参数语义从 IP 扩展为 identifier |
| 6 | 更新 `.env.example` 增加 `AUTH_REQUIRED=true` | done | 降级开关 |
| 7 | 验证 `pnpm type-check` 和 `pnpm build` 通过 | done | 确认无类型错误 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建
pnpm build

# 现有限流测试
pnpm vitest --run src/lib/__tests__/rate-limit.test.ts
```

## 预期结果

- `pnpm type-check` 和 `pnpm build` 无错误
- 未登录状态访问 `http://localhost:3000/workspace` 被重定向到 `/`
- 未登录状态调用 `POST /api/analysis` 返回 `401 { code: "UNAUTHORIZED" }`
- 已登录状态正常访问 `/workspace` 和调用业务 API
- Rate Limit 对已登录用户使用 userId 作为 key
- `/api/auth/*` 路由不受认证拦截影响

## 交接上下文

- **架构章节**: ADR-10 路由保护、ADR-12 Rate Limit 升级、6.2 认证后的业务操作
- **相关代码**: `src/auth.ts`（T01 产出）、`src/lib/rate-limit.ts`
- **契约 / 数据对象**: 无新增契约
- **提供给下游的契约摘要**:

```
Middleware 行为契约：
- /workspace* → 未登录重定向到 /
- /api/auth/* → 放行（Auth.js 自管理）
- /api/* (其他) → 未登录返回 401 { error, code: "UNAUTHORIZED", retryable: false }
- POST /api/{upload/presign, analysis, generation} → Rate Limit (key = userId || IP)
```

## 执行指引

- **工具链**: pnpm, Next.js Middleware, Auth.js v5
- **执行顺序**: Task 列表按序执行，除非说明中标注"可并行"
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 `auth()` 是否正确导入；检查 matcher 配置是否覆盖目标路由；确认 Edge Runtime 兼容性（middleware 不能直接访问数据库，`auth()` 内部只做 JWT 验证不需要 DB）
- **允许修改的额外文件**: `src/auth.ts`（如需调整 Auth.js 配置以支持 middleware 使用）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Auth.js v5 的 `auth()` 在 middleware 中使用时运行在 Edge Runtime，不能直接访问 Node.js API 或数据库连接。`auth()` 内部只做 JWT 签名验证，不需要 DB 查询
- `getClientIp` 函数需要作为 middleware 内的辅助函数保留，不要从外部模块引入（Edge Runtime 限制）
- 注意 Auth.js v5 的 middleware 用法：`export default auth((req) => { ... })` 而非 `export function middleware(req)`

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | 认证检查和限流检查均为无状态判断（JWT 验证），天然幂等 | done |
| 超时处理 | JWT 验证为本地计算，不涉及网络请求，无超时风险 | done |
| 重试场景 | 401 响应中 `retryable: false`，用户需先登录再重试 | done |
| 并发冲突 | 限流使用 in-memory store，单实例无并发问题 | done |
| 空/无效输入 | JWT 无效或过期时 `req.auth` 为 null，统一走未登录逻辑 | done |
