/** 结构化日志输出 */
export function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

/** 结构化错误日志输出 */
export function logError(event: string, data: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

/** 携带 error message/stack 的结构化错误日志输出 */
export function logErrorDetail(
  event: string,
  error: unknown,
  data: Record<string, unknown> = {}
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    error: message,
    stack,
    ...data,
  }));
}
