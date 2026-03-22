/**
 * T09 - rate-limit.ts 单元测试
 *
 * 由于 rate-limit.ts 使用模块级全局 Map (store)，且 store 未导出，
 * 每个测试用例需要通过 vi.resetModules() + 动态 import() 获取全新模块实例来隔离状态。
 */

import type {
  RateLimitConfig,
  RateLimitResult,
} from "@/lib/rate-limit";

// 每个测试动态导入的模块类型
type RateLimitModule = typeof import("@/lib/rate-limit");

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 3_600_000, // 1 hour
  maxRequests: 10,
};

describe("checkRateLimit", () => {
  let mod: RateLimitModule;
  let checkRateLimit: RateLimitModule["checkRateLimit"];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mod = await import("@/lib/rate-limit");
    checkRateLimit = mod.checkRateLimit;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- P0 ----

  it("首次请求允许通过", () => {
    const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt).toBe(Date.now() + DEFAULT_CONFIG.windowMs);
  });

  it("未超限时持续允许 (10 requests with maxRequests: 10)", () => {
    for (let i = 1; i <= 10; i++) {
      const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_CONFIG.maxRequests - i);
    }
  });

  it("超限后拒绝 (11th request)", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }

    const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("窗口过期后重置", () => {
    // 用满配额
    for (let i = 0; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }
    const blocked = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    expect(blocked.allowed).toBe(false);

    // 推进时间到窗口过期
    vi.advanceTimersByTime(DEFAULT_CONFIG.windowMs);

    const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_CONFIG.maxRequests - 1);
  });

  it("不同 IP 独立计数", () => {
    // IP1 用满配额
    for (let i = 0; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }
    const blocked = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    expect(blocked.allowed).toBe(false);

    // IP2 首次请求应该被允许
    const result = checkRateLimit("2.2.2.2", "upload", DEFAULT_CONFIG);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_CONFIG.maxRequests - 1);
  });

  it("不同 action 独立计数", () => {
    // upload 用满配额
    for (let i = 0; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }
    const blocked = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    expect(blocked.allowed).toBe(false);

    // 同一 IP 的 analysis 应该被允许
    const result = checkRateLimit("1.1.1.1", "analysis", DEFAULT_CONFIG);
    expect(result.allowed).toBe(true);
  });

  it("边界值：恰好等于 maxRequests (10th request, remaining: 0)", () => {
    for (let i = 1; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }

    // 第 10 次请求应仍允许，remaining 为 0
    const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  // ---- P1 ----

  it("resetAt 时间戳正确", () => {
    const now = Date.now();
    const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);

    expect(result.resetAt).toBe(now + DEFAULT_CONFIG.windowMs);
  });

  it("超限后 remaining 为 0", () => {
    // 用满配额
    for (let i = 0; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }

    // 超限后连续调用，remaining 始终为 0
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    }
  });

  it("窗口未过期时不重置 (advance windowMs - 1ms)", () => {
    // 用满配额
    for (let i = 0; i < 10; i++) {
      checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    }

    // 推进时间到窗口过期前 1ms
    vi.advanceTimersByTime(DEFAULT_CONFIG.windowMs - 1);

    const result = checkRateLimit("1.1.1.1", "upload", DEFAULT_CONFIG);
    expect(result.allowed).toBe(false);
  });
});

describe("RATE_LIMIT_CONFIGS", () => {
  let RATE_LIMIT_CONFIGS: RateLimitModule["RATE_LIMIT_CONFIGS"];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/rate-limit");
    RATE_LIMIT_CONFIGS = mod.RATE_LIMIT_CONFIGS;
  });

  it("预定义配置正确", () => {
    expect(RATE_LIMIT_CONFIGS.upload).toEqual({
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
    });

    expect(RATE_LIMIT_CONFIGS.analysis).toEqual({
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
    });

    expect(RATE_LIMIT_CONFIGS.generation).toEqual({
      windowMs: 60 * 60 * 1000,
      maxRequests: 20,
    });
  });
});
