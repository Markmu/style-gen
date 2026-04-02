"use client";

/** T09 统一错误格式中的 error code */
export type ApiErrorCode =
  | "RATE_LIMITED"
  | "VISION_FAILED"
  | "LLM_FAILED"
  | "GENERATION_TIMEOUT"
  | "SERVICE_UNAVAILABLE"
  | "ANALYSIS_TIMEOUT"
  | "INVALID_REQUEST"
  | "NOT_FOUND";

/** 从 API 响应中解析出的结构化错误 */
export interface ApiErrorInfo {
  error: string;
  code: ApiErrorCode;
  retryable: boolean;
}

/** 根据 error code 映射用户友好的展示信息 */
function getErrorDisplay(code: ApiErrorCode, message: string): {
  title: string;
  description: string;
  showRetry: boolean;
  showReplace: boolean;
} {
  switch (code) {
    case "RATE_LIMITED":
      return {
        title: "请求过于频繁",
        description: "您的操作已触发限流，请稍后再试。",
        showRetry: true,
        showReplace: false,
      };
    case "SERVICE_UNAVAILABLE":
      return {
        title: "服务暂时不可用",
        description: "服务暂时不可用，请稍后重试。",
        showRetry: true,
        showReplace: false,
      };
    case "VISION_FAILED":
      return {
        title: "视觉分析失败",
        description: message || "图片视觉分析失败，请重试或更换参考图。",
        showRetry: true,
        showReplace: true,
      };
    case "LLM_FAILED":
      return {
        title: "结构化处理失败",
        description: message || "AI 结构化处理失败，请重试。",
        showRetry: true,
        showReplace: false,
      };
    case "GENERATION_TIMEOUT":
      return {
        title: "生成超时",
        description: "图片生成超时，请稍后重试。",
        showRetry: true,
        showReplace: false,
      };
    case "ANALYSIS_TIMEOUT":
      return {
        title: "分析超时",
        description: "图片分析超时，请稍后重试。",
        showRetry: true,
        showReplace: true,
      };
    case "INVALID_REQUEST":
      return {
        title: "请求无效",
        description: message || "请求参数无效，请检查后重试。",
        showRetry: false,
        showReplace: true,
      };
    case "NOT_FOUND":
      return {
        title: "资源未找到",
        description: message || "请求的资源不存在。",
        showRetry: false,
        showReplace: true,
      };
    default:
      return {
        title: "操作失败",
        description: message || "发生未知错误，请重试。",
        showRetry: true,
        showReplace: false,
      };
  }
}

interface ErrorDisplayProps {
  /** 错误码 */
  code: ApiErrorCode;
  /** 原始错误信息 */
  message: string;
  /** 是否可重试（来自 API 响应） */
  retryable: boolean;
  /** 重试回调 */
  onRetry?: () => void;
  /** 替换参考图回调 */
  onReplace?: () => void;
  /** 限流剩余等待时间（秒），仅 RATE_LIMITED 时有效 */
  retryAfterSeconds?: number;
}

export function ErrorDisplay({
  code,
  message,
  retryable,
  onRetry,
  onReplace,
  retryAfterSeconds,
}: ErrorDisplayProps) {
  const display = getErrorDisplay(code, message);
  const canRetry = retryable && display.showRetry;

  return (
    <div className="rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-6">
      <p className="font-medium text-[var(--color-error)]">{display.title}</p>
      <p className="mt-2 text-sm text-[var(--color-error)]/80">{display.description}</p>

      {/* 限流：显示剩余等待时间 */}
      {code === "RATE_LIMITED" && retryAfterSeconds != null && retryAfterSeconds > 0 && (
        <p className="mt-2 text-sm font-medium text-amber-400">
          请等待 {retryAfterSeconds} 秒后重试
        </p>
      )}

      <div className="mt-4 flex gap-3">
        {/* 可重试：显示重试按钮 */}
        {canRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            重试
          </button>
        )}

        {/* 不可重试或允许替换图片：显示替换参考图入口 */}
        {display.showReplace && onReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-bright)]"
          >
            更换参考图
          </button>
        )}
      </div>
    </div>
  );
}
