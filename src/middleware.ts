import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";

/** 路由路径 → 限流 action 映射 */
const ROUTE_ACTION_MAP: Record<string, string> = {
  "/api/upload/presign": "upload",
  "/api/analysis": "analysis",
  "/api/generation": "generation",
};

/**
 * 从请求中提取客户端 IP。
 * Next.js 在 Vercel / 反向代理下通过 x-forwarded-for 传递真实 IP。
 */
function getClientIp(request: NextRequest): string {
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

export function middleware(request: NextRequest) {
  // 只拦截 POST 请求
  if (request.method !== "POST") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const action = ROUTE_ACTION_MAP[pathname];

  if (!action) {
    return NextResponse.next();
  }

  const config = RATE_LIMIT_CONFIGS[action];
  if (!config) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const result = checkRateLimit(ip, action, config);

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/upload/presign",
    "/api/analysis",
    "/api/generation",
  ],
};
