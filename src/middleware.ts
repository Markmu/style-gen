import { auth } from "@/auth";
import { NextResponse } from "next/server";
import {
  checkRateLimit,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";

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

/**
 * 从请求中提取客户端 IP。
 * Next.js 在 Vercel / 反向代理下通过 x-forwarded-for 传递真实 IP。
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // 兜底：本地开发时可能没有这些 header
  return "127.0.0.1";
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // 0. L3 降级：认证配置开关（架构 8.2 + 结论 5）
  // AUTH_REQUIRED 默认 true；设为 "false" 时跳过所有认证检查，回退到 01 期匿名模式
  if (process.env.AUTH_REQUIRED === "false") {
    // 仅保留限流逻辑，跳过认证
    if (req.method === "POST") {
      const action = ROUTE_ACTION_MAP[pathname];
      if (action) {
        const config = RATE_LIMIT_CONFIGS[action];
        if (config) {
          const identifier = getClientIp(req);
          const result = checkRateLimit(identifier, action, config);
          if (!result.allowed) {
            const retryAfterSeconds = Math.ceil(
              (result.resetAt - Date.now()) / 1000
            );
            return NextResponse.json(
              {
                error: "Too many requests. Please try again later.",
                code: "RATE_LIMITED",
                retryable: true,
              },
              {
                status: 429,
                headers: {
                  "Retry-After": String(Math.max(retryAfterSeconds, 1)),
                },
              }
            );
          }
        }
      }
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
      {
        error: "Authentication required",
        code: "UNAUTHORIZED",
        retryable: false,
      },
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
          const retryAfterSeconds = Math.ceil(
            (result.resetAt - Date.now()) / 1000
          );
          return NextResponse.json(
            {
              error: "Too many requests. Please try again later.",
              code: "RATE_LIMITED",
              retryable: true,
            },
            {
              status: 429,
              headers: {
                "Retry-After": String(Math.max(retryAfterSeconds, 1)),
              },
            }
          );
        }
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/workspace/:path*",
    "/api/upload/presign",
    "/api/analysis/:path*",
    "/api/generation/:path*",
  ],
};
