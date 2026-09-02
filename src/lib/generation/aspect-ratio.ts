// ---------------------------------------------------------------------------
// plan-01 §4（架构 §6.3 / AC-03）：唯一画幅白名单、对数距离最近值算法、
// 来源优先级（restore > user > reference > fallback）与 1:1 回退。
// 该常量是 Render Dock、推荐算法、请求校验和 Provider 适配的共同 SSOT；
// 禁止任何 Provider 对未知比例静默回退。
// ---------------------------------------------------------------------------

/** 唯一公开画幅顺序；并列距离按此数组顺序取第一项 */
export const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "4:3",
  "16:9",
  "3:4",
  "9:16",
] as const;

export type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

/** 画幅解析来源（架构 §7.2）；fallback 不显示「参考图推荐」 */
export type AspectRatioSource = "reference" | "user" | "restore" | "fallback";

export const FALLBACK_ASPECT_RATIO: SupportedAspectRatio = "1:1";

const ASPECT_RATIO_VALUES: Record<SupportedAspectRatio, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  "3:4": 3 / 4,
  "9:16": 9 / 16,
};

export function isSupportedAspectRatio(value: string): value is SupportedAspectRatio {
  return (SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(value);
}

/**
 * 对支持列表计算 abs(log(referenceRatio / candidateRatio)) 并取最小值；
 * 距离并列（含 IEEE 754 精确相等）按白名单数组顺序取第一项。
 * 非有限或非正参考比例直接回退 1:1。
 */
export function findClosestAspectRatio(referenceRatio: number): SupportedAspectRatio {
  if (!Number.isFinite(referenceRatio) || referenceRatio <= 0) {
    return FALLBACK_ASPECT_RATIO;
  }

  let best: SupportedAspectRatio = SUPPORTED_ASPECT_RATIOS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of SUPPORTED_ASPECT_RATIOS) {
    const distance = Math.abs(
      Math.log(referenceRatio / ASPECT_RATIO_VALUES[candidate]),
    );
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export interface ResolveAspectRatioInput {
  referenceWidth?: number;
  referenceHeight?: number;
  userValue?: string;
  restoreValue?: string;
}

export interface ResolvedAspectRatio {
  aspectRatio: SupportedAspectRatio;
  source: AspectRatioSource;
}

function usableSize(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 来源优先级：restore > user > reference > fallback。
 * 无合法尺寸且无高优值时回退 1:1/fallback，不标推荐（架构 §6.3.5）。
 */
export function resolveAspectRatio(input: ResolveAspectRatioInput): ResolvedAspectRatio {
  if (input.restoreValue !== undefined && isSupportedAspectRatio(input.restoreValue)) {
    return { aspectRatio: input.restoreValue, source: "restore" };
  }
  if (input.userValue !== undefined && isSupportedAspectRatio(input.userValue)) {
    return { aspectRatio: input.userValue, source: "user" };
  }
  if (usableSize(input.referenceWidth) && usableSize(input.referenceHeight)) {
    return {
      aspectRatio: findClosestAspectRatio(input.referenceWidth / input.referenceHeight),
      source: "reference",
    };
  }
  return { aspectRatio: FALLBACK_ASPECT_RATIO, source: "fallback" };
}
