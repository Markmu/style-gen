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
        title: "Too Many Requests",
        description: "You have hit the rate limit. Please try again later.",
        showRetry: true,
        showReplace: false,
      };
    case "SERVICE_UNAVAILABLE":
      return {
        title: "Service Temporarily Unavailable",
        description: "The service is temporarily unavailable. Please try again later.",
        showRetry: true,
        showReplace: false,
      };
    case "VISION_FAILED":
      return {
        title: "Vision Analysis Failed",
        description: message || "Image analysis failed. Please retry or replace the reference image.",
        showRetry: true,
        showReplace: true,
      };
    case "LLM_FAILED":
      return {
        title: "Structuring Failed",
        description: message || "AI structuring failed. Please try again.",
        showRetry: true,
        showReplace: false,
      };
    case "GENERATION_TIMEOUT":
      return {
        title: "Generation Timed Out",
        description: "Image generation timed out. Please try again later.",
        showRetry: true,
        showReplace: false,
      };
    case "ANALYSIS_TIMEOUT":
      return {
        title: "Analysis Timed Out",
        description: "Image analysis timed out. Please try again later.",
        showRetry: true,
        showReplace: true,
      };
    case "INVALID_REQUEST":
      return {
        title: "Invalid Request",
        description: message || "The request parameters are invalid. Please check and try again.",
        showRetry: false,
        showReplace: true,
      };
    case "NOT_FOUND":
      return {
        title: "Resource Not Found",
        description: message || "The requested resource does not exist.",
        showRetry: false,
        showReplace: true,
      };
    default:
      return {
        title: "Action Failed",
        description: message || "Something went wrong. Please try again.",
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
  /** 是否可Retry（来自 API 响应） */
  retryable: boolean;
  /** Retry回调 */
  onRetry?: () => void;
  /** Replace Reference回调 */
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
          Please wait {retryAfterSeconds}s before retrying
        </p>
      )}

      <div className="mt-4 flex gap-3">
        {/* 可Retry：显示Retry按钮 */}
        {canRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[var(--color-error)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-error)]/80"
          >
            Retry
          </button>
        )}

        {/* 不可Retry或允许替换图片：显示Replace Reference入口 */}
        {display.showReplace && onReplace && (
          <button
            type="button"
            onClick={onReplace}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-bright)]"
          >
            Replace Reference
          </button>
        )}
      </div>
    </div>
  );
}
