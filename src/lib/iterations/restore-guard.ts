import type { GenerationParams, IterationDetail } from "@/types/models";

/**
 * plan-04（架构 §6.3 步骤 2 / ADR-4 / §8.6）：替换守卫纯函数。
 *
 * 输入两侧状态、输出 direct/confirm，无副作用：
 * - 三豁免任一成立返回 `direct`（不弹替换确认，直接继续）：
 *   ① `current` 为空（工作台无内容）；
 *   ② `current.currentIterationId === target.id`（已是同一 Iteration）；
 *   ③ 内容一致——`promptText`、`negativePromptText`、`params.aspectRatio`、
 *      `params.quality` 逐字段相等（`current.params` 缺失时无法证明一致，
 *      按保守侧返回 confirm，见架构 §8.6）。
 * - 其余返回 `confirm`，`reason` 供替换确认对话框与埋点使用。
 */

/** 守卫输入：当前工作区快照（经 sessionStorage 通道跨路由读取） */
export interface WorkspaceSnapshot {
  /** 工作台当前恢复自的 Iteration id；非恢复态为 null */
  currentIterationId: string | null;
  promptText: string;
  negativePromptText: string;
  /** 工作台当前输出参数；通道缺失时为 null（无法比较） */
  params: Pick<GenerationParams, "aspectRatio" | "quality"> | null;
}

export type RestoreGuardAction = "direct" | "confirm";

export interface RestoreGuardResult {
  action: RestoreGuardAction;
  /** 判定原因（对话框/埋点/排查用，机器可读） */
  reason: string;
}

export const RESTORE_GUARD_REASONS = {
  /** 豁免①：工作台无内容 */
  emptyWorkspace: "empty-workspace",
  /** 豁免②：已是同一 Iteration */
  sameIteration: "same-iteration",
  /** 豁免③：内容逐字段一致 */
  identicalContent: "identical-content",
  /** 存在不同的未完成内容 → 需要替换确认 */
  differentContent: "different-unfinished-content",
} as const;

/** 当前参数与目标快照参数逐字段相等（null 视为不可证明，返回 false） */
function paramsMatch(
  current: WorkspaceSnapshot["params"],
  target: GenerationParams,
): boolean {
  if (!current) return false;
  return (
    current.aspectRatio === target.aspectRatio &&
    current.quality === target.quality
  );
}

export function computeRestoreGuard(
  current: WorkspaceSnapshot | null,
  target: IterationDetail,
): RestoreGuardResult {
  // 豁免①：工作台无内容（无持久化快照即视为空）
  if (!current) {
    return {
      action: "direct",
      reason: RESTORE_GUARD_REASONS.emptyWorkspace,
    };
  }

  // 豁免②：已是同一 Iteration（重复恢复幂等，架构 §6.3 原则）
  if (current.currentIterationId === target.id) {
    return {
      action: "direct",
      reason: RESTORE_GUARD_REASONS.sameIteration,
    };
  }

  // 豁免③：内容一致——提示 / 排除项 / 两参数逐字段相等
  if (
    current.promptText === target.promptSnapshot &&
    current.negativePromptText === target.negativePromptSnapshot &&
    paramsMatch(current.params, target.params)
  ) {
    return {
      action: "direct",
      reason: RESTORE_GUARD_REASONS.identicalContent,
    };
  }

  return {
    action: "confirm",
    reason: RESTORE_GUARD_REASONS.differentContent,
  };
}
