import { describe, expect, it } from "vitest";
import {
  applyAdjustmentToCustomText,
  applyInvariantAdjustment,
  deriveKeepChangeSummary,
} from "@/lib/prompt-adjustments";
import { normalizeVisualRecipeCandidate } from "@/lib/visual-recipe";
import type { VisualRecipeSemanticCandidate } from "@/lib/visual-recipe";

// ---------------------------------------------------------------------------
// plan-01 §3 / AC-02 / AC-05：规则调整、保留/改变摘要与自定义全文回退纯函数
// 契约：adjustment 只引用 Recipe 中真实 invariantId，模型 Recipe/evidence 不可被写回。
// ---------------------------------------------------------------------------

const candidate: VisualRecipeSemanticCandidate = {
  contentDescription: {
    summary: "A blue chair",
    subject: "blue chair",
    subjectAttributes: ["chrome legs"],
    supportingElements: [],
    environment: "studio",
  },
  styleProfile: {
    visualMedium: [{ value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9 }],
    composition: [{ value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9 }],
    camera: [],
    color: [{ value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9 }],
    lighting: [{ value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9 }],
    formLanguage: [],
    materialTexture: [],
    atmosphere: [],
    rendering: [{ value: "fine grain", evidence: ["Fine grain is visible"], confidence: 0.8 }],
  },
  styleInvariants: [
    { kind: "hard", dimension: "composition", value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9, sourceObservationIds: ["composition_1"] },
    { kind: "hard", dimension: "color", value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9, sourceObservationIds: ["color_1"] },
    { kind: "hard", dimension: "lighting", value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9, sourceObservationIds: ["lighting_1"] },
    { kind: "hard", dimension: "visualMedium", value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9, sourceObservationIds: ["visual_medium_1"] },
    { kind: "soft", dimension: "rendering", value: "subtle film finish", evidence: ["Tonal response is filmic"], confidence: 0.7, sourceObservationIds: ["rendering_1"] },
  ],
  negativeConstraints: ["watermark"],
  styleFingerprint: { tokens: ["editorial", "cobalt", "soft light"], scores: { realism: 0.9, abstraction: 0.1, contrast: 0.5, saturation: 0.7, softness: 0.7, detailDensity: 0.6, symmetry: 0.9, depth: 0.4, atmosphericIntensity: 0.3 } },
};

function loadRecipe() {
  const result = normalizeVisualRecipeCandidate(candidate);
  if (result.kind !== "success") throw new Error("expected fixture to normalize");
  return result.recipe;
}

function invariantId(recipe: ReturnType<typeof loadRecipe>, dimension: string) {
  const found = recipe.styleInvariants.find((item) => item.dimension === dimension);
  if (!found) throw new Error(`missing ${dimension} invariant in fixture`);
  return found.id;
}

describe("applyInvariantAdjustment（plan-01 §3 四动作 / AC-05）", () => {
  it("新增 strengthen adjustment 只记录目标 invariant", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");

    expect(applyInvariantAdjustment(recipe, [], { invariantId: colorId, action: "strengthen" })).toEqual([
      { invariantId: colorId, action: "strengthen" },
    ]);
  });

  it("同一 invariant 的重复 adjustment 以最后一次显式动作覆盖且只保留一条", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");

    const result = applyInvariantAdjustment(
      recipe,
      [{ invariantId: colorId, action: "relax" }],
      { invariantId: colorId, action: "strengthen" },
    );

    expect(result).toEqual([{ invariantId: colorId, action: "strengthen" }]);
  });

  it("仅更新对应 invariant adjustment，不影响其他 invariant 的记录", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");
    const compositionId = invariantId(recipe, "composition");

    const result = applyInvariantAdjustment(
      recipe,
      [
        { invariantId: colorId, action: "relax" },
        { invariantId: compositionId, action: "disable" },
      ],
      { invariantId: colorId, action: "replace", replacementValue: "teal accent palette" },
    );

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.invariantId === colorId)).toEqual({
      invariantId: colorId,
      action: "replace",
      replacementValue: "teal accent palette",
    });
    expect(result.find((item) => item.invariantId === compositionId)).toEqual({
      invariantId: compositionId,
      action: "disable",
    });
  });

  it("引用 Recipe 中不存在的 invariantId 时返回校验错误，不产生虚假规则", () => {
    const recipe = loadRecipe();

    expect(() =>
      applyInvariantAdjustment(recipe, [], { invariantId: "ghost_invariant_1", action: "strengthen" }),
    ).toThrow(/ghost_invariant_1/);
  });

  it("replace 的替换值 trim 后必须非空", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");

    expect(() =>
      applyInvariantAdjustment(recipe, [], { invariantId: colorId, action: "replace", replacementValue: "   " }),
    ).toThrow();
    expect(() =>
      applyInvariantAdjustment(recipe, [], { invariantId: colorId, action: "replace", replacementValue: "" }),
    ).toThrow();
  });

  it("replace 的替换值 trim 后不超过 200 字符", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");

    expect(() =>
      applyInvariantAdjustment(recipe, [], { invariantId: colorId, action: "replace", replacementValue: "x".repeat(201) }),
    ).toThrow();

    // trim 后正好 200 字符：合法
    const capped = applyInvariantAdjustment(recipe, [], {
      invariantId: colorId,
      action: "replace",
      replacementValue: ` ${"x".repeat(200)} `,
    });
    expect(capped).toHaveLength(1);
  });

  it("disable 与 relax 不需要 replacementValue 也可以应用", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");

    expect(applyInvariantAdjustment(recipe, [], { invariantId: colorId, action: "disable" })).toEqual([
      { invariantId: colorId, action: "disable" },
    ]);
    expect(applyInvariantAdjustment(recipe, [], { invariantId: colorId, action: "relax" })).toEqual([
      { invariantId: colorId, action: "relax" },
    ]);
  });
});

describe("deriveKeepChangeSummary（plan-01 §3「保留 / 改变」摘要）", () => {
  it("保留取全部未禁用 invariants（含 soft）", () => {
    const recipe = loadRecipe();
    const all = recipe.styleInvariants.map((item) => item.id);

    const summary = deriveKeepChangeSummary(recipe, {
      enabledInvariantIds: all,
      variableValues: {},
      adjustments: [],
    });

    expect([...summary.keptInvariantIds].sort()).toEqual([...all].sort());
  });

  it("被 disable 的 invariant 不进入保留摘要", () => {
    const recipe = loadRecipe();
    const all = recipe.styleInvariants.map((item) => item.id);
    const renderingId = invariantId(recipe, "rendering");

    const summary = deriveKeepChangeSummary(recipe, {
      enabledInvariantIds: all,
      variableValues: {},
      adjustments: [{ invariantId: renderingId, action: "disable" }],
    });

    expect(summary.keptInvariantIds).not.toContain(renderingId);
    expect(summary.keptInvariantIds).toHaveLength(all.length - 1);
  });

  it("未启用的 invariant 不进入保留摘要，零规则不产生虚假目标", () => {
    const recipe = loadRecipe();
    const compositionId = invariantId(recipe, "composition");

    const only = deriveKeepChangeSummary(recipe, {
      enabledInvariantIds: [compositionId],
      variableValues: {},
      adjustments: [],
    });
    expect(only.keptInvariantIds).toEqual([compositionId]);

    const none = deriveKeepChangeSummary(recipe, {
      enabledInvariantIds: [],
      variableValues: {},
      adjustments: [],
    });
    expect(none.keptInvariantIds).toEqual([]);
    expect(none.changedVariableNames).toEqual([]);
  });

  it("改变按 trim、压缩空格、忽略大小写比较变量当前值与默认值", () => {
    const recipe = loadRecipe();

    const summary = deriveKeepChangeSummary(recipe, {
      enabledInvariantIds: [],
      variableValues: {
        subject: "  Blue   CHAIR ",
        subject_attributes: "chrome legs",
        environment: "coastal cliff",
      },
      adjustments: [],
    });

    // subject 与默认值归一化后相等：不改变；subject_attributes 完全一致：不改变
    expect(summary.changedVariableNames).toEqual(["environment"]);
  });
});

describe("applyAdjustmentToCustomText（plan-01 §3 自定义全文回退）", () => {
  function customTextWithColorSegment(colorId: string) {
    const prefix = "Content: a blue chair; Color: ";
    const phrase = "cobalt blue palette";
    const text = `${prefix}${phrase}, muted gray shadows.`;
    const startIndex = text.indexOf(phrase);

    return {
      text,
      segments: [
        {
          sourceKind: "invariant" as const,
          sourceId: colorId,
          dimension: "color",
          startIndex,
          endIndex: startIndex + phrase.length,
        },
      ],
    };
  }

  it("replace 命中 segment range 时只局部替换该 range", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");
    const { text, segments } = customTextWithColorSegment(colorId);

    const outcome = applyAdjustmentToCustomText(text, segments, {
      invariantId: colorId,
      action: "replace",
      replacementValue: "teal accent palette",
    });

    expect(outcome.status).toBe("applied");
    expect(outcome.text).toContain("teal accent palette");
    expect(outcome.text).not.toContain("cobalt blue palette");
    expect(outcome.text.startsWith("Content: a blue chair; Color: ")).toBe(true);
    expect(outcome.text.endsWith("muted gray shadows.")).toBe(true);
  });

  it("disable 命中 segment range 时删除该表达", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");
    const { text, segments } = customTextWithColorSegment(colorId);

    const outcome = applyAdjustmentToCustomText(text, segments, {
      invariantId: colorId,
      action: "disable",
    });

    expect(outcome.status).toBe("applied");
    expect(outcome.text).not.toContain("cobalt blue palette");
    expect(outcome.text).toContain("muted gray shadows");
  });

  it("非 disable 动作未命中 range 时追加 Adjustments: 段", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");
    const { text } = customTextWithColorSegment(colorId);

    const outcome = applyAdjustmentToCustomText(text, [], {
      invariantId: colorId,
      action: "strengthen",
    });

    expect(outcome.status).toBe("appended");
    expect(outcome.text.startsWith(text)).toBe(true);
    expect(outcome.text).toContain("Adjustments:");
  });

  it("disable 未命中 range 时文本保持不变并返回未找到可删除表达状态", () => {
    const recipe = loadRecipe();
    const colorId = invariantId(recipe, "color");
    const { text } = customTextWithColorSegment(colorId);

    const outcome = applyAdjustmentToCustomText(text, [], {
      invariantId: colorId,
      action: "disable",
    });

    expect(outcome.status).toBe("not_found");
    expect(outcome.text).toBe(text);
  });
});
