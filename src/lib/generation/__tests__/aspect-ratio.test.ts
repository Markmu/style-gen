import { describe, expect, it } from "vitest";
import {
  SUPPORTED_ASPECT_RATIOS,
  findClosestAspectRatio,
  isSupportedAspectRatio,
  resolveAspectRatio,
} from "@/lib/generation/aspect-ratio";

// ---------------------------------------------------------------------------
// plan-01 §4 / AC-03：共享画幅白名单、abs(log(reference/candidate)) 最近值算法、
// 来源优先级 restore > user > reference > fallback 与 1:1 回退。
// ---------------------------------------------------------------------------

describe("共享画幅白名单（plan-01 §4）", () => {
  it("唯一公开画幅顺序为 1:1, 4:3, 16:9, 3:4, 9:16", () => {
    expect([...SUPPORTED_ASPECT_RATIOS]).toEqual(["1:1", "4:3", "16:9", "3:4", "9:16"]);
  });

  it("isSupportedAspectRatio 只接受白名单中的公开画幅", () => {
    for (const ratio of ["1:1", "4:3", "16:9", "3:4", "9:16"]) {
      expect(isSupportedAspectRatio(ratio)).toBe(true);
    }
    expect(isSupportedAspectRatio("4:5")).toBe(false);
    expect(isSupportedAspectRatio("3:2")).toBe(false);
    expect(isSupportedAspectRatio("")).toBe(false);
  });
});

describe("findClosestAspectRatio 对数距离最近值（plan-01 §4 / AC-03）", () => {
  it("4:5 参考比例映射到最近的 3:4", () => {
    expect(findClosestAspectRatio(4 / 5)).toBe("3:4");
  });

  it("参考比例恰为候选时返回该候选", () => {
    expect(findClosestAspectRatio(1)).toBe("1:1");
    expect(findClosestAspectRatio(0.75)).toBe("3:4");
    expect(findClosestAspectRatio(16 / 9)).toBe("16:9");
  });

  it("宽于所有候选的参考比例映射到 16:9", () => {
    expect(findClosestAspectRatio(2)).toBe("16:9");
  });

  it("对数距离并列时按白名单数组顺序取第一项", () => {
    // 3:4 与 9:16 的几何均值：按规格公式 abs(log(reference/candidate))，
    // 该值到两个候选的距离在 IEEE 754 下精确相等，并列必须按数组顺序取 3:4。
    const tieRatio = Math.sqrt(0.75 * 0.5625);

    expect(findClosestAspectRatio(tieRatio)).toBe("3:4");
  });
});

describe("resolveAspectRatio 来源优先级（plan-01 §4 / AC-03）", () => {
  it("restore 优先于 user 与 reference 推荐", () => {
    expect(
      resolveAspectRatio({
        referenceWidth: 800,
        referenceHeight: 1000,
        userValue: "16:9",
        restoreValue: "4:3",
      }),
    ).toEqual({ aspectRatio: "4:3", source: "restore" });
  });

  it("user 优先于 reference 推荐", () => {
    expect(
      resolveAspectRatio({ referenceWidth: 800, referenceHeight: 1000, userValue: "16:9" }),
    ).toEqual({ aspectRatio: "16:9", source: "user" });
  });

  it("仅参考尺寸时返回最近支持画幅并标记 reference", () => {
    expect(resolveAspectRatio({ referenceWidth: 800, referenceHeight: 1000 })).toEqual({
      aspectRatio: "3:4",
      source: "reference",
    });
  });

  it("无尺寸且无高优值时回退 1:1/fallback，不标推荐", () => {
    expect(resolveAspectRatio({})).toEqual({ aspectRatio: "1:1", source: "fallback" });
  });

  it("参考尺寸为 0 时进入 1:1 回退", () => {
    expect(resolveAspectRatio({ referenceWidth: 0, referenceHeight: 1000 })).toEqual({
      aspectRatio: "1:1",
      source: "fallback",
    });
    expect(resolveAspectRatio({ referenceWidth: 800, referenceHeight: 0 })).toEqual({
      aspectRatio: "1:1",
      source: "fallback",
    });
  });

  it("参考尺寸为 NaN 时进入 1:1 回退", () => {
    expect(resolveAspectRatio({ referenceWidth: Number.NaN, referenceHeight: 1000 })).toEqual({
      aspectRatio: "1:1",
      source: "fallback",
    });
  });

  it("无参考尺寸时 restore 值仍然生效", () => {
    expect(resolveAspectRatio({ restoreValue: "9:16" })).toEqual({
      aspectRatio: "9:16",
      source: "restore",
    });
  });

  it("无参考尺寸时 user 值仍然生效", () => {
    expect(resolveAspectRatio({ userValue: "4:3" })).toEqual({
      aspectRatio: "4:3",
      source: "user",
    });
  });
});
