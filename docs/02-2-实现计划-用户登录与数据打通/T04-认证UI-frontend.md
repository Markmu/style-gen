---
task_id: "T04"
title: "前端认证 UI"
dimension: frontend
phase: 2
status: review
depends_on: ["T01"]
---

# T04: 前端认证 UI（前端）

## 任务概要

- **目标**: 在前端集成 Auth.js SessionProvider，实现首页登录按钮、CTA 登录触发逻辑、导航栏用户头像下拉框（头像 + 名称 + 邮箱 + 退出登录），以及 OAuth 错误提示
- **依赖**: T01（Auth.js 配置完成，`/api/auth/*` 路由可用）
- **所属模块**: 前端认证 UI
- **前置条件**: T01 已完成，Auth.js API 路由可用，`signIn`/`signOut` 函数可调用
- **不在范围**: 路由守卫（T02）、数据层改造（T03）、E2E 测试（T05）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/providers.tsx` | 包裹 SessionProvider |
| create | `src/components/auth/user-menu.tsx` | 用户头像下拉框组件（已登录态） |
| create | `src/components/auth/login-button.tsx` | 登录按钮组件（未登录态） |
| create | `src/components/auth/auth-header.tsx` | 顶部导航栏认证区域（条件渲染 login-button / user-menu） |
| modify | `src/app/layout.tsx` | 在页面顶部添加 AuthHeader |
| modify | `src/components/landing/upload-entry.tsx` | CTA 按钮增加登录判断逻辑 |

## 实现规格

### 1. SessionProvider 集成（`src/components/providers.tsx`）

```typescript
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <FileStoreProvider>{children}</FileStoreProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

`SessionProvider` 包裹在最外层，让所有子组件可通过 `useSession()` 获取登录状态。

### 2. LoginButton 组件（`src/components/auth/login-button.tsx`）

```typescript
"use client";
import { signIn } from "next-auth/react";

export function LoginButton() {
  return (
    <button
      onClick={() => signIn("google")}
      className="..."  // 简洁的文字按钮样式
    >
      登录
    </button>
  );
}
```

- 点击触发 `signIn("google")`，重定向到 Google 授权页
- 登录成功后 Auth.js 自动回到当前页面

### 3. UserMenu 组件（`src/components/auth/user-menu.tsx`）

```typescript
"use client";
import { useSession, signOut } from "next-auth/react";

export function UserMenu() {
  const { data: session } = useSession();
  // 展示用户头像，点击展开下拉菜单
  // 下拉菜单内容：用户名 + 邮箱 + 退出登录按钮
}
```

设计规格：
- 头像使用 Google 头像 URL（`session.user.avatarUrl` 或 `session.user.image`），无头像时显示名称首字母
- 点击头像展开下拉菜单（使用简单的 state toggle，不引入 UI 库）
- 下拉菜单内容：
  - 用户名称（`session.user.name`）
  - 用户邮箱（`session.user.email`），灰色小字
  - 分割线
  - "退出登录" 按钮，调用 `signOut({ callbackUrl: "/" })`
- 点击菜单外部关闭下拉框

退出登录需处理失败场景（架构 6.3 原则）：

```typescript
async function handleSignOut() {
  try {
    await signOut({ callbackUrl: "/" });
  } catch {
    // signOut 失败时仍清除本地状态，确保用户感知到"已退出"
    window.location.href = "/";
  }
}
```

### 4. AuthHeader 组件（`src/components/auth/auth-header.tsx`）

```typescript
"use client";
import { useSession } from "next-auth/react";
import { LoginButton } from "./login-button";
import { UserMenu } from "./user-menu";

export function AuthHeader() {
  const { data: session, status } = useSession();

  if (status === "loading") return null; // 避免闪烁

  return (
    <header className="fixed top-0 right-0 z-50 p-4">
      {session ? <UserMenu /> : <LoginButton />}
    </header>
  );
}
```

- `status === "loading"` 时不渲染，避免未登录→已登录的闪烁
- 固定在页面右上角

### 5. Layout 集成（`src/app/layout.tsx`）

```typescript
import { AuthHeader } from "@/components/auth/auth-header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <AuthHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

### 6. CTA 登录触发逻辑（`src/components/landing/upload-entry.tsx`）

根据架构文档 4.1 主流程：
- CTA 按钮点击时判断登录状态
- **已登录**：直接跳转 `/workspace`（现有行为）
- **未登录**：触发 `signIn("google", { callbackUrl: "/workspace" })`，登录成功后自动跳转到工作区

```typescript
"use client";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// 在 CTA 点击事件中
const { data: session } = useSession();
const router = useRouter();

function handleCtaClick() {
  if (session) {
    router.push("/workspace");
  } else {
    signIn("google", { callbackUrl: "/workspace" });
  }
}
```

### 7. OAuth 错误提示

Auth.js 在 OAuth 失败时会重定向到 `pages.error`（配置为 `/`），并带上 `?error=xxx` 查询参数。

在首页或 AuthHeader 中检测 URL 参数，展示简短的错误提示：
- `?error=OAuthAccountNotLinked` → "登录失败"
- `?error=AccessDenied` → "登录已取消"
- 其他 error → "登录失败，请重试"

使用 toast 或简单的条件渲染展示，几秒后自动消失。

### 8. 前端埋点（架构 8.5）

在关键认证操作处埋点，预留后续接入分析工具：

```typescript
function trackAuthEvent(event: "login_success" | "login_failed" | "logout") {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString() }));
}
```

- 登录成功：在 `useSession` 检测到 `status` 从 `loading` 变为 `authenticated` 时触发 `login_success`
- 登录失败：在检测到 `?error=` URL 参数时触发 `login_failed`
- 退出登录：在 `handleSignOut` 调用时触发 `logout`

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 修改 `providers.tsx`，包裹 `SessionProvider` | done | 最外层 |
| 2 | 创建 `login-button.tsx` | done | signIn("google") |
| 3 | 创建 `user-menu.tsx` | done | 头像 + 下拉菜单 + 退出 |
| 4 | 创建 `auth-header.tsx` | done | 条件渲染 LoginButton / UserMenu |
| 5 | 修改 `layout.tsx`，添加 `AuthHeader` | done | 固定右上角 |
| 6 | 修改 `upload-entry.tsx`，CTA 增加登录判断 | done | 未登录触发 OAuth |
| 7 | 处理 OAuth 错误提示 | done | URL 参数检测 + toast |
| 8 | 增加前端埋点 `login_success` / `login_failed` / `logout` | done | 架构 8.5 要求 |
| 9 | 验证 `pnpm type-check` 和 `pnpm build` 通过 | done | 确认无类型错误 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建
pnpm build

# 现有前端组件测试
pnpm test
```

## 预期结果

- `pnpm type-check` 和 `pnpm build` 无错误
- 首页右上角显示"登录"按钮（未登录状态）
- 点击"登录"跳转到 Google 授权页
- 登录成功后右上角显示用户头像
- 点击头像展开下拉菜单，显示用户名、邮箱和退出按钮
- 点击"退出登录"清除会话，回到首页
- CTA 按钮：未登录时触发 Google OAuth（登录后跳转工作区），已登录时直接跳转工作区
- OAuth 失败时首页显示简短错误提示

## 交接上下文

- **架构章节**: 4.1 主流程、4.2 关键分支、4.3 认证状态机、6.3 退出登录
- **相关代码**: `src/auth.ts`（T01 产出）、`src/components/providers.tsx`、`src/components/landing/upload-entry.tsx`、`src/app/layout.tsx`
- **契约 / 数据对象**: `Session`（含 user.id、user.name、user.email、user.avatarUrl）
- **消费的上游契约摘要**:

```typescript
// next-auth/react 客户端 API
import { useSession, signIn, signOut, SessionProvider } from "next-auth/react";

// useSession() 返回
{
  data: {
    user: {
      id: string;          // ULID
      name: string;
      email: string;
      avatarUrl: string | null;
      image?: string | null;
    }
  } | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

// signIn("google", { callbackUrl: "/workspace" })
// signOut({ callbackUrl: "/" })
```

## 执行指引

- **工具链**: pnpm, React 19, Next.js App Router, next-auth/react
- **执行顺序**: Task 列表按序执行，除非说明中标注"可并行"
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 `SessionProvider` 是否正确包裹（必须在 `"use client"` 组件中）；检查 `useSession` 是否在 `SessionProvider` 内部调用；检查 Auth.js API 路由是否可用
- **允许修改的额外文件**: `src/components/landing/hero.tsx`（如需调整首页布局为导航栏腾出空间）、`src/app/globals.css`（如需样式调整）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- `SessionProvider` 是 `"use client"` 组件，需要在客户端组件树中使用。现有 `Providers` 已经是 `"use client"`，可以直接包裹
- `useSession()` 在 `status === "loading"` 时 `data` 为 undefined，需要正确处理加载状态避免闪烁
- 用户头像 URL 来自 Google，可能因网络问题加载失败，需要 fallback 到名称首字母
- 不引入额外 UI 组件库（如 Headless UI、Radix），用原生 HTML + Tailwind 实现下拉菜单

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| API 请求数据完整性 | signIn/signOut 由 Auth.js 管理，数据完整性有保障 | todo |
| 加载/等待状态 | `status === "loading"` 时 AuthHeader 不渲染，避免闪烁 | todo |
| 错误处理与重试 | OAuth 错误通过 URL 参数检测并展示提示，用户可重新点击登录 | todo |
| 空状态处理 | 未登录时显示"登录"按钮而非空白 | todo |
| 网络异常 | Google 头像加载失败时显示名称首字母 fallback | todo |
