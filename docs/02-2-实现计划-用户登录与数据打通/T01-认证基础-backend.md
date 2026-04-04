---
task_id: "T01"
title: "Auth.js 基础配置与用户模型"
dimension: backend
phase: 1
status: in-progress
depends_on: []
---

# T01: Auth.js 基础配置与用户模型（后端）

## 任务概要

- **目标**: 安装并配置 Auth.js v5，接入 Google OAuth Provider，创建 users 表和 User Repository，跑通完整的登录/回调/退出流程
- **依赖**: 无
- **所属模块**: Auth API (Auth.js)、User Repository
- **前置条件**: Google OAuth Client ID/Secret 已获取；`.env.local` 中已配置 `AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`；本地 PostgreSQL 已启动
- **不在范围**: 路由守卫、现有业务表改造、前端 UI

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/auth.ts` | Auth.js v5 核心配置（Google Provider、JWT callbacks、signIn callback） |
| create | `src/app/api/auth/[...nextauth]/route.ts` | Auth.js catch-all API 路由 |
| create | `src/lib/repositories/user-repository.ts` | 用户记录的 findOrCreate / findById |
| modify | `src/lib/schema.sql` | 新增 users 表 DDL |
| modify | `.env.example` | 新增 AUTH_SECRET、AUTH_GOOGLE_ID、AUTH_GOOGLE_SECRET |
| create | `src/types/next-auth.d.ts` | Auth.js 类型扩展（Session 中增加 userId、avatarUrl） |

## 实现规格

### 1. 安装依赖

```bash
pnpm add next-auth@beta
```

Auth.js v5 (NextAuth v5) 是 `next-auth@beta`（截至 2026-03 仍在 beta tag）。

### 2. users 表 DDL（追加到 `src/lib/schema.sql`）

```sql
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(26) PRIMARY KEY,   -- ULID
  google_id   VARCHAR(255) NOT NULL UNIQUE,
  email       VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `google_id` 加 UNIQUE 约束，用于 findOrCreate
- 不创建 Auth.js 默认的 accounts/sessions/verification_tokens 表（使用 JWT 策略不需要）

### 3. User Repository（`src/lib/repositories/user-repository.ts`）

```typescript
// 核心接口
export async function findOrCreateUser(googleUser: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}): Promise<User>

export async function findUserById(id: string): Promise<User | null>
```

- `findOrCreateUser`：先按 `google_id` 查询，存在则更新 `name`、`avatar_url`、`updated_at`，不存在则 INSERT
- 使用 `INSERT ... ON CONFLICT (google_id) DO UPDATE` 实现 UPSERT
- 使用 `generateId()` 生成 ULID 作为主键
- 行对象映射遵循现有 repository 的 `rowToXxx` 模式

### 4. Auth.js 配置（`src/auth.ts`）

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { findOrCreateUser } from "@/lib/repositories/user-repository";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 }, // 7 天
  callbacks: {
    async signIn({ account, profile }) {
      // 仅允许 Google 登录
      if (account?.provider !== "google" || !profile?.sub) return false;
      // 创建/更新用户记录
      await findOrCreateUser({
        googleId: profile.sub,
        email: profile.email ?? "",
        name: profile.name ?? "",
        avatarUrl: (profile as { picture?: string }).picture ?? null,
      });
      return true;
    },
    async jwt({ token, account, profile }) {
      // 首次登录时把 userId 写入 JWT
      if (account?.provider === "google" && profile?.sub) {
        const user = await findOrCreateUser({
          googleId: profile.sub,
          email: profile.email ?? "",
          name: profile.name ?? "",
          avatarUrl: (profile as { picture?: string }).picture ?? null,
        });
        token.userId = user.id;
        token.avatarUrl = user.avatarUrl;
      }
      return token;
    },
    async session({ session, token }) {
      // 将 userId 和 avatarUrl 暴露到前端 session
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      if (token.avatarUrl !== undefined) {
        session.user.avatarUrl = token.avatarUrl as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",  // 登录页指向首页
    error: "/",   // 错误页指向首页
  },
});
```

关键设计点：
- `session.strategy: "jwt"` — 不使用 database session（ADR-8）
- `maxAge: 7 天` — 会话有效期
- signIn callback 中调用 `findOrCreateUser`，确保每次登录都更新用户信息
- jwt callback 中将 `userId`（应用内 ULID）写入 token，而非 Google sub
- session callback 暴露 `userId` 和 `avatarUrl` 给前端
- **不存储 Google access/refresh token**

### 4.1 认证日志（架构 8.5）

在 signIn callback 中记录结构化认证日志：

```typescript
// signIn callback 中，成功时：
console.log(JSON.stringify({
  event: "auth_login_success",
  timestamp: new Date().toISOString(),
  userId: user.id,
  email: profile.email,
}));

// 失败时（provider 不匹配或 profile 无效）：
console.log(JSON.stringify({
  event: "auth_login_failed",
  timestamp: new Date().toISOString(),
  reason: "invalid_provider_or_profile",
}));
```

复用项目已有的 `log()` 格式（JSON 结构化），便于后续日志聚合和监控。

### 5. Auth.js API 路由（`src/app/api/auth/[...nextauth]/route.ts`）

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

### 6. 类型扩展（`src/types/next-auth.d.ts`）

```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;          // ULID userId
      email: string;
      name: string;
      image?: string | null;
      avatarUrl: string | null;
    };
  }
}
```

### 7. 环境变量（追加到 `.env.example`）

```
# Auth.js
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

Auth.js v5 自动读取 `AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET` 环境变量。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 安装 `next-auth@beta` | done | `pnpm add next-auth@beta` |
| 2 | 在 `src/lib/schema.sql` 末尾追加 users 表 DDL | done | 含 UNIQUE 约束 |
| 3 | 创建 `src/lib/repositories/user-repository.ts` | done | findOrCreateUser + findUserById |
| 4 | 创建 `src/auth.ts` | done | Google Provider + JWT callbacks |
| 5 | 创建 `src/app/api/auth/[...nextauth]/route.ts` | done | 导出 handlers |
| 6 | 创建 `src/types/next-auth.d.ts` | done | Session 类型扩展 |
| 7 | 更新 `.env.example` | done | 追加 3 个 AUTH_ 变量 |
| 8 | 在本地数据库执行 users 表 DDL | done | `pnpm db:reset` 或手动执行 SQL |
| 9 | 在 signIn callback 中增加认证日志 | done | auth_login_success / auth_login_failed |
| 10 | 验证 `pnpm type-check` 和 `pnpm build` 通过 | done | 确认无类型错误 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建
pnpm build

# 数据库表验证（需本地 PG 运行）
docker exec -it style-gen-db psql -U user -d style_gen -c "\dt users"
```

## 预期结果

- `pnpm type-check` 无错误
- `pnpm build` 成功
- 本地数据库中存在 `users` 表
- 访问 `http://localhost:3000/api/auth/providers` 返回包含 `google` 的 JSON
- 访问 `http://localhost:3000/api/auth/signin` 可跳转到 Google 授权页
- 授权后用户记录写入 `users` 表，JWT cookie 正确签发

## 交接上下文

- **架构章节**: 6.1 Google OAuth 登录、7.1 核心对象、7.2 推荐最小 Schema
- **相关代码**: `src/lib/db.ts`（数据库连接池）、`src/lib/ulid.ts`（ID 生成）
- **契约 / 数据对象**: `User`、`SessionPayload`
- **提供给下游的契约摘要**:

```typescript
// src/auth.ts 导出
export const { handlers, auth, signIn, signOut } = NextAuth(config);

// auth() 返回的 session 结构
interface Session {
  user: {
    id: string;          // ULID userId — 下游所有数据关联使用此 ID
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}

// User Repository
export async function findOrCreateUser(googleUser: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}): Promise<User>;
```

## 执行指引

- **工具链**: pnpm, Next.js App Router, Auth.js v5
- **执行顺序**: Task 列表按序执行，除非说明中标注"可并行"
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 `AUTH_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET` 环境变量是否正确配置；检查 `next-auth` 包版本；检查 `src/auth.ts` 中 callbacks 的返回值类型
- **允许修改的额外文件**: `tsconfig.json`（如需调整类型声明路径）、`package.json`（依赖安装自动更新）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Auth.js v5 仍为 beta，API 可能变化。以安装时的实际版本文档为准
- Google OAuth 回调 URL 必须在 Google Cloud Console 中正确配置，否则登录流程无法完成
- 本任务创建的 `auth()` 函数是后续 T02、T03、T04 的基础，确保 session 中 `user.id` 正确返回 ULID

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | `findOrCreateUser` 使用 `ON CONFLICT (google_id) DO UPDATE`，天然幂等 | todo |
| 超时处理 | Auth.js 内部管理 OAuth 超时；数据库操作依赖连接池超时配置 | todo |
| 重试场景 | 用户重新点击登录按钮即可重试，Auth.js 自动处理 | todo |
| 并发冲突 | `google_id` UNIQUE 约束 + UPSERT 防止并发创建重复用户 | todo |
| 空/无效输入 | signIn callback 中检查 `profile?.sub` 存在性，缺失则拒绝登录 | todo |
