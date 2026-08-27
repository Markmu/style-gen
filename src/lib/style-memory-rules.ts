// plan-01（架构 §6.4 / ADR-1）：规则集合回退判定算法的唯一实现。
// 服务端 repository 的状态回退判定与 plan-05 前端保存前提示共用同一口径，
// 顺序无关的集合语义（逐元素 trim → 过滤空串 → 按字典序排序）。

/**
 * 规范化规则数组：逐元素 trim，过滤空串，按字典序（UTF-16 码元序）排序。
 * 用于把用户输入的规则列表归一为顺序无关的集合表示。
 */
export function normalizeRuleArray(rules: string[]): string[] {
  return [...rules]
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * 判定两个规则集合是否存在实质差异（归一化后逐元素深比较）。
 * 仅顺序不同 / 仅空白差异 / 空串等价 → false（不触发状态回退）；
 * 新增、删除或替换元素 → true。
 */
export function ruleSetsChanged(
  previous: string[],
  next: string[]
): boolean {
  const normalizedPrevious = normalizeRuleArray(previous);
  const normalizedNext = normalizeRuleArray(next);
  if (normalizedPrevious.length !== normalizedNext.length) {
    return true;
  }
  return normalizedPrevious.some((rule, index) => rule !== normalizedNext[index]);
}
