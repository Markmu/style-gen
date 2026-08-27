/**
 * 按标识符限流工具（基于内存，首版单实例可接受）
 *
 * 标识符（identifier）可以是 userId（已Log in用户）或 IP（未Log in用户）。
 * 注意：内存限流在多实例部署时不共享，进程重启后重置。
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** action -> identifier -> entry */
const store = new Map<string, Map<string, RateLimitEntry>>();

/** 每 10 分钟清理过期条目，防止内存泄漏 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [action, actionMap] of store) {
    for (const [identifier, entry] of actionMap) {
      if (now >= entry.resetAt) {
        actionMap.delete(identifier);
      }
    }
    if (actionMap.size === 0) {
      store.delete(action);
    }
  }
}

const cleanupTimer = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
// 允许进程正常退出，不因定时器而挂起
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * 检查给定标识符在指定 action 下是否超限。
 *
 * @param identifier  限流标识符：已Log in用户为 userId，未Log in用户为客户端 IP
 * @param action      动作标识，如 "upload" | "analysis" | "generation"
 * @param config      时间窗口 + 最大请求数
 */
export function checkRateLimit(
  identifier: string,
  action: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();

  let actionMap = store.get(action);
  if (!actionMap) {
    actionMap = new Map();
    store.set(action, actionMap);
  }

  let entry = actionMap.get(identifier);

  // 窗口过期或首次访问：重置
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    actionMap.set(identifier, entry);
  }

  entry.count += 1;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/** 预定义的限流配置（架构 8.3） */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  upload: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  analysis: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  generation: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
  /** plan-02（架构 §8.3）：templates 全部写端点共用（POST / PUT / DELETE / duplicate / representative-result），30 次/小时/用户 */
  templateWrite: { windowMs: 60 * 60 * 1000, maxRequests: 30 },
};
