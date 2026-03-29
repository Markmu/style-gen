/**
 * middleware.ts 单元测试
 *
 * 由于 middleware 使用 Auth.js 的 auth() 包裹器，且 next-auth 在 Vitest
 * 环境中无法正常加载 (依赖 next/server)，本测试通过设置
 * AUTH_REQUIRED=false 环境变量测试限流逻辑（降级模式）。
 *
 * Auth 相关行为由 E2E 测试 (e2e/auth.spec.ts) 覆盖。
 */

// Mock @/auth before any imports
vi.mock("@/auth", () => ({
  auth: (handler: (...args: unknown[]) => unknown) => handler,
}));

const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_CONFIGS: {
    upload: { windowMs: 3_600_000, maxRequests: 10 },
    analysis: { windowMs: 3_600_000, maxRequests: 10 },
    generation: { windowMs: 3_600_000, maxRequests: 20 },
  },
}));

// Must import after mocks are set up
import middleware from "@/middleware";

function allowedResult(resetAt = Date.now() + 3_600_000) {
  return { allowed: true, remaining: 9, resetAt };
}

function blockedResult(resetAt = Date.now() + 3_600_000) {
  return { allowed: false, remaining: 0, resetAt };
}

/** 创建模拟请求对象（兼容 auth() 包裹器） */
function makeRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    auth?: { user?: { id?: string } } | null;
  } = {}
) {
  const { method = "POST", headers = {}, auth = null } = options;
  const url = new URL(`http://localhost${path}`);

  return {
    method,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    nextUrl: url,
    url: url.toString(),
    auth,
  } as unknown as Parameters<typeof middleware>[0];
}

describe("middleware - 限流逻辑 (AUTH_REQUIRED=false 模式)", () => {
  const originalEnv = process.env.AUTH_REQUIRED;

  beforeEach(() => {
    process.env.AUTH_REQUIRED = "false";
    vi.useFakeTimers();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue(allowedResult());
  });

  afterEach(() => {
    process.env.AUTH_REQUIRED = originalEnv;
    vi.useRealTimers();
  });

  it("非 POST 请求直接放行", () => {
    const request = makeRequest("/api/analysis", { method: "GET" });
    const response = middleware(request);

    expect(response?.status).not.toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("非匹配路由直接放行", () => {
    const request = makeRequest("/api/some-other");
    const response = middleware(request);

    expect(response?.status).not.toBe(429);
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

  it("未超限返回 next()", () => {
    mockCheckRateLimit.mockReturnValue(allowedResult());

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response?.status).not.toBe(429);
  });

  it("超限返回 429 + 统一错误格式", async () => {
    mockCheckRateLimit.mockReturnValue(blockedResult());

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response?.status).toBe(429);

    const body = await response?.json();
    expect(body).toEqual({
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
      retryable: true,
    });
  });

  it("超限响应包含 Retry-After header", () => {
    const now = Date.now();
    const resetAt = now + 30_000;
    mockCheckRateLimit.mockReturnValue(blockedResult(resetAt));

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response?.status).toBe(429);
    const retryAfter = response?.headers.get("Retry-After");
    expect(retryAfter).toBe("30");
  });

  it("Retry-After 最小值为 1", () => {
    const now = Date.now();
    const resetAt = now + 100;
    mockCheckRateLimit.mockReturnValue(blockedResult(resetAt));

    const request = makeRequest("/api/analysis");
    const response = middleware(request);

    expect(response?.status).toBe(429);
    const retryAfter = response?.headers.get("Retry-After");
    expect(retryAfter).toBe("1");
  });

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

describe("middleware - 认证逻辑", () => {
  const originalEnv = process.env.AUTH_REQUIRED;

  beforeEach(() => {
    delete process.env.AUTH_REQUIRED;
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue(allowedResult());
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AUTH_REQUIRED = originalEnv;
    } else {
      delete process.env.AUTH_REQUIRED;
    }
  });

  it("AUTH_REQUIRED 默认时，未登录 API 请求返回 401", async () => {
    const request = makeRequest("/api/analysis", { auth: null });
    const response = middleware(request);

    expect(response?.status).toBe(401);

    const body = await response?.json();
    expect(body).toEqual({
      error: "Authentication required",
      code: "UNAUTHORIZED",
      retryable: false,
    });
  });

  it("AUTH_REQUIRED=false 时，未登录 API 请求放行", () => {
    process.env.AUTH_REQUIRED = "false";
    const request = makeRequest("/api/analysis", { auth: null });
    const response = middleware(request);

    expect(response?.status).not.toBe(401);
  });

  it("已登录时 API 请求放行", () => {
    const request = makeRequest("/api/analysis", {
      auth: { user: { id: "user-123" } },
    });
    const response = middleware(request);

    expect(response?.status).not.toBe(401);
  });

  it("已登录时限流 key 使用 userId 而非 IP", () => {
    const request = makeRequest("/api/analysis", {
      auth: { user: { id: "user-123" } },
    });
    middleware(request);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "user-123",
      "analysis",
      expect.any(Object)
    );
  });
});
