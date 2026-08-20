import { findAnalysisTaskByIdInternal, updateAnalysisTask } from '@/lib/repositories/analysis-task-repository';
import { findGenerationTaskByIdInternal, updateGenerationTask } from '@/lib/repositories/generation-task-repository';
import { logError } from './log';

/**
 * 构建 Replicate Webhook URL
 * @param taskType 任务类型：'analysis' | 'generation'
 * @param taskId 任务 ID
 * @returns 完整的 Webhook URL
 */
export function buildWebhookUrl(taskType: 'analysis' | 'generation', taskId: string): string {
  const vercelUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;
  const baseUrl = (
    process.env.WEBHOOK_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    vercelUrl ??
    'http://localhost:3000'
  ).replace(/\/$/, '');

  return `${baseUrl}/api/webhooks/replicate?taskType=${taskType}&taskId=${taskId}`;
}

/** 超时定时器的可定制文案与日志事件名 */
export interface TimeoutTimerOptions {
  /** 写入任务的超时错误信息 */
  timeoutMessage?: string;
  /** 超时生效时的结构化日志事件名 */
  timeoutEvent?: string;
}

/**
 * 启动超时定时器
 * 在指定时间后检查任务状态，如果仍在 processing 则标记为 failed
 * @param taskId 任务 ID
 * @param taskType 任务类型：'analysis' | 'generation'
 * @param timeoutMs 超时时间（毫秒）
 */
export function startTimeoutTimer(
  taskId: string,
  taskType: 'analysis' | 'generation',
  timeoutMs: number = 5 * 60 * 1000, // 默认 5 分钟
  options: TimeoutTimerOptions = {}
): void {
  const timeoutMessage = options.timeoutMessage ?? 'Task timed out after 5 minutes';
  const timeoutEvent = options.timeoutEvent ?? 'task_timeout';

  const timer = setTimeout(async () => {
    try {
      if (taskType === 'analysis') {
        const task = await findAnalysisTaskByIdInternal(taskId);
        if (task && task.status === 'processing') {
          await updateAnalysisTask(taskId, {
            status: 'failed',
            errorMessage: timeoutMessage,
            errorStage: task.errorStage || 'vision',
          });
          logError(timeoutEvent, {
            taskId,
            taskType: 'analysis',
            provider: task.provider,
            submittedAt: task.createdAt,
            timeoutMs,
          });
        }
      } else {
        const task = await findGenerationTaskByIdInternal(taskId);
        if (task && task.status === 'processing') {
          await updateGenerationTask(taskId, {
            status: 'failed',
            errorMessage: timeoutMessage,
          });
          logError(timeoutEvent, {
            taskId,
            taskType: 'generation',
            provider: task.provider,
            submittedAt: task.createdAt,
            timeoutMs,
          });
        }
      }
    } catch (error) {
      logError('timeout_timer_error', {
        taskId,
        taskType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, timeoutMs);

  // 允许进程正常退出
  if (timer.unref) {
    timer.unref();
  }
}
