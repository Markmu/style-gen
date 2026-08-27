import {
  normalizeRuleArray,
  ruleSetsChanged,
} from "@/lib/style-memory-rules";

// plan-01（架构 §6.4 / ADR-1）：回退判定算法的唯一实现，
// 服务端 repository 回退判定与 plan-05 前端保存前提示共用同一口径。

describe("normalizeRuleArray", () => {
  it("逐元素 trim 并过滤空串", () => {
    expect(
      normalizeRuleArray(["  rim light  ", "", "   ", "low key"])
    ).toEqual(["low key", "rim light"]);
  });

  it("前导空白不参与排序（trim 先于排序，B1 回归）", () => {
    // 前导空白不得使元素在排序中提前：trim 后 "golden hour" < "soft light"
    expect(normalizeRuleArray([" soft light", "golden hour"])).toEqual([
      "golden hour",
      "soft light",
    ]);
  });

  it("按字典序排序（顺序无关的集合语义）", () => {
    expect(normalizeRuleArray(["glass", "editorial", "macro"])).toEqual([
      "editorial",
      "glass",
      "macro",
    ]);
  });

  it("空数组与全空白输入返回空数组", () => {
    expect(normalizeRuleArray([])).toEqual([]);
    expect(normalizeRuleArray(["", "   "])).toEqual([]);
  });
});

describe("ruleSetsChanged", () => {
  it("相同集合返回 false", () => {
    expect(ruleSetsChanged(["a", "b"], ["a", "b"])).toBe(false);
  });

  it("仅顺序不同返回 false（改序不回退）", () => {
    expect(ruleSetsChanged(["rule a", "rule b"], ["rule b", "rule a"])).toBe(
      false
    );
  });

  it("仅空白差异返回 false（trim 不回退）", () => {
    expect(
      ruleSetsChanged(["rule a", "rule b"], [" rule a ", "rule b"])
    ).toBe(false);
  });

  it("纯前导空白差异返回 false（B1 回归：多元素不回退）", () => {
    expect(
      ruleSetsChanged([" soft light", "golden hour"], ["soft light", "golden hour"])
    ).toBe(false);
  });

  it("前导空白参与排序的等价集合返回 false（B1 回归：trim 后改序不回退）", () => {
    // 原始串排序下 " b" < "a"，trim 后应为 ["a","b"] 与 next 等价
    expect(ruleSetsChanged([" b", "a"], ["a", "b"])).toBe(false);
    expect(
      ruleSetsChanged(["golden hour", " soft light"], ["soft light", "golden hour"])
    ).toBe(false);
  });

  it("空串元素过滤后与缺失等价，返回 false", () => {
    expect(ruleSetsChanged(["rule a", ""], ["rule a"])).toBe(false);
    expect(ruleSetsChanged(["rule a"], ["rule a", "   "])).toBe(false);
  });

  it("两个空集合返回 false", () => {
    expect(ruleSetsChanged([], [])).toBe(false);
    expect(ruleSetsChanged([], ["", "  "])).toBe(false);
  });

  it("新增元素返回 true", () => {
    expect(ruleSetsChanged(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("删除元素返回 true", () => {
    expect(ruleSetsChanged(["a", "b"], ["a"])).toBe(true);
  });

  it("长度相同但元素不同返回 true（实质变更）", () => {
    expect(ruleSetsChanged(["rule a", "rule b"], ["rule a", "rule c"])).toBe(
      true
    );
  });

  it("长度不同（含一侧为空）返回 true", () => {
    expect(ruleSetsChanged([], ["a"])).toBe(true);
    expect(ruleSetsChanged(["a"], [])).toBe(true);
  });

  it("改序 + 新增组合：归一化后元素集不同即返回 true", () => {
    expect(ruleSetsChanged(["a", "b"], ["b", "c"])).toBe(true);
  });
});
