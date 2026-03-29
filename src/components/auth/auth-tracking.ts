/**
 * 前端认证埋点工具（架构 8.5）
 * 预留后续接入分析工具
 */
export type AuthEvent = "login_success" | "login_failed" | "logout";

export function trackAuthEvent(event: AuthEvent) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString() }));
}
