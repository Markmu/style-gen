/**
 * T09 - middleware.ts 单元测试
 *
 * Mock 策略：
 * - Mock `@/lib/rate-limit` 的 checkRateLimit 和 RATE_LIMIT_CONFIGS
 * - 使用真实的 NextRequest / NextResponse（from "next/server"）
 * - 通过 mock checkRateLimit 的调用参数来验证 IP 提取逻辑
 */

import { NextRequest } from "next/server";
import { middleware, config } from "@/middleware";

// ---- Mock @/lib/rate-limit ----
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_CONFIGS: {
    upload: { windowMs: 3_600_000, maxRequests: 10 },
    analysis: { windowMs: 3_600_000, maxRequests: 10 },
    generation: { windowMs: 3_600_000, maxRequests: 20 },
  },
}));

// ---- Helpers ----

function makeRequest(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const { method = "POST", headers = {} } = options;
  return new NextRequest(new URL(`http://localhost${path}`), {
    method,
    headers,
  });
}

function allowedResult(resetAt = Date.now() + 3_600_000) {
  return { allowed: true, remaining: 9, resetAt };
}

function blockedResult(resetAt = Date.now() + 3_600_000) {
  return { allowed: false, remaining: 0, resetAt };
}

// ---- Tests ----

describe("middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue(allowedResult());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- 路由匹配 P0 ----

  it("非 POST 请求直接放行", () => {
    const request = makeRequest("/api/analysis", { method: "GET" });
    const response = middleware(request);

    expect(response.status).not.toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("非匹配路由直接放行", () => {
    const request = makeRequest("/api/some-other");
    const response = middleware(request);

    expect(response.status).not.toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("upload 路由正确匹配", () => {
    const request = makeRequest("/api/upload/presign");
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      "upload",
      { windowMs: 3_600_000, maxRequests: 10 }
    );
  });

  it("analysis 路由正确匹配", () => {
    const request = makeRequest("/api/analysis");
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      "analysis",
      { windowMs: 3_600_000, maxRequests: 10 }
    );
  });

  it("generation 路由正确匹配", () => {
    const request = makeRequest("/api/generation");
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      "generation",
      { windowMs: 3_600_000, maxRequests: 20 }
    );
  });

  // ---- 限流结果 P0 ----

  it("未超限返回 next() (allowed: true)", () => {
    mockCheckRateLimit.mockReturnValue(allowedResult());

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response.status).not.toBe(429);
  });

  it("超限返回 429 + 统一错误格式", async () => {
    mockCheckRateLimit.mockReturnValue(blockedResult());

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body).toEqual({
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
      retryable: true,
    });
  });

  it("超限响应包含 Retry-After header", () => {
    const now = Date.now();
    const resetAt = now + 30_000; // 30 seconds from now
    mockCheckRateLimit.mockReturnValue(blockedResult(resetAt));

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response.status).toBe(429);
    const retryAfter = response.headers.get("Retry-After");
    expect(retryAfter).toBe("30");
  });

  // ---- P1 ----

  it("Retry-After 最小值为 1", () => {
    const now = Date.now();
    // resetAt 仅比当前时间多 100ms，Math.ceil(100/1000) = 1
    const resetAt = now + 100;
    mockCheckRateLimit.mockReturnValue(blockedResult(resetAt));

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response.status).toBe(429);
    const retryAfter = response.headers.get("Retry-After");
    expect(retryAfter).toBe("1");
  });

  // ---- IP 提取 ----

  it("IP 提取：x-forwarded-for 单个 IP", () => {
    const request = makeRequest("/api/analysis", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "1.2.3.4",
      "analysis",
      expect.any(Object)
    );
  });

  it("IP 提取：x-forwarded-for 多个 IP (take first)", () => {
    const request = makeRequest("/api/analysis", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "1.2.3.4",
      "analysis",
      expect.any(Object)
    );
  });

  it("IP 提取：x-real-ip 回退", () => {
    const request = makeRequest("/api/analysis", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "9.8.7.6",
      "analysis",
      expect.any(Object)
    );
  });

  it("IP 提取：兜底 127.0.0.1", () => {
    const request = makeRequest("/api/analysis");
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "127.0.0.1",
      "analysis",
      expect.any(Object)
    );
  });
});

describe("config.matcher", () => {
  it("正确导出 matcher 配置", () => {
    expect(config.matcher).toEqual([
      "/api/upload/presign",
      "/api/analysis",
      "/api/generation",
    ]);
  });
});
