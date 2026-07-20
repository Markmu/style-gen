import { describe, expect, it } from "vitest";
import {
  normalizeVisualRecipeCandidate,
  toDescriptionRecipeJson,
  type VisualRecipeSemanticCandidate,
} from "@/lib/visual-recipe";
import { deriveEvidenceFacets } from "@/lib/evidence-facets";

function candidate(): VisualRecipeSemanticCandidate {
  return {
    contentDescription: {
      summary: "An amber bottle on folded linen",
      subject: "amber bottle",
      subjectAttributes: ["ribbed glass"],
      environment: "quiet studio table",
      supportingElements: ["folded linen"],
    },
    styleProfile: {
      visualMedium: [{ value: "editorial product photography", evidence: ["Photographic highlights remain natural"], confidence: 0.9 }],
      composition: [{ id: "old-composition", value: "asymmetric thirds composition", evidence: ["Subject sits on the left third"], confidence: 0.88 }],
      camera: [{ value: "normal lens with shallow depth", evidence: ["Background falls gently out of focus"], confidence: 0.8 }],
      color: [{ value: "warm amber and sand palette", evidence: ["Amber and linen dominate the frame"], confidence: 0.92 }],
      lighting: [{ value: "soft directional window light", evidence: ["Long-edged soft shadow falls right"], confidence: 0.94 }],
      formLanguage: [],
      materialTexture: [{ value: "matte linen against polished glass", evidence: ["Woven fibers contrast with glass"], confidence: 0.86 }],
      atmosphere: [{ value: "calm restrained mood", evidence: ["Sparse staging and low contrast"], confidence: 0.72 }],
      rendering: [{ value: "fine natural detail", evidence: ["Edges retain subtle texture"], confidence: 0.78 }],
    },
    styleInvariants: [
      { id: "warm", kind: "hard", dimension: "color", value: "warm amber and sand palette", evidence: ["Amber and linen dominate the frame"], confidence: 0.92, sourceObservationIds: ["color_1"] },
      { id: "light", kind: "hard", dimension: "lighting", value: "soft directional window light", evidence: ["Long-edged soft shadow falls right"], confidence: 0.94, sourceObservationIds: ["lighting_1"] },
      { id: "medium", kind: "hard", dimension: "visualMedium", value: "editorial product photography", evidence: ["Photographic highlights remain natural"], confidence: 0.9, sourceObservationIds: ["visual_medium_1"] },
      { id: "texture", kind: "hard", dimension: "materialTexture", value: "matte linen against polished glass", evidence: ["Woven fibers contrast with glass"], confidence: 0.86, sourceObservationIds: ["material_texture_1"] },
      { id: "mood", kind: "hard", dimension: "atmosphere", value: "calm restrained mood", evidence: ["Sparse staging and low contrast"], confidence: 0.65, sourceObservationIds: ["atmosphere_1"] },
      { id: "noise", kind: "hard", dimension: "rendering", value: "invented unsupported detail", evidence: [], confidence: 0.99, sourceObservationIds: ["rendering_1"] },
      { id: "content-lock", kind: "hard", dimension: "composition", value: "amber bottle centered on folded linen", evidence: ["The bottle is centered"], confidence: 0.91, sourceObservationIds: ["composition_1"] },
    ],
    negativeConstraints: ["watermark", "distorted glass"],
    styleFingerprint: {
      tokens: ["editorial", "warm neutral", "soft window light"],
      scores: {
        realism: 0.9, abstraction: 0.1, contrast: 0.35, saturation: 0.45,
        softness: 0.8, detailDensity: 0.7, symmetry: 0.3, depth: 0.65,
        atmosphericIntensity: 0.55,
      },
    },
  };
}

describe("normalizeVisualRecipeCandidate", () => {
  it("assigns stable ids, downgrades supported medium-confidence hard rules, and drops unsupported rules", () => {
    const result = normalizeVisualRecipeCandidate(candidate());

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.recipe.styleProfile.composition[0].id).toBe("composition_1");
    expect(result.recipe.styleInvariants.find((item) => item.dimension === "atmosphere")?.kind).toBe("soft");
    expect(result.recipe.styleInvariants.some((item) => item.value.includes("unsupported"))).toBe(false);
    expect(result.recipe.styleInvariants.some((item) => item.value.includes("amber bottle"))).toBe(false);
    expect(result.recipe.extractionReasons.join(" ")).toMatch(/dropped|evidence/i);
    expect(deriveEvidenceFacets(result.recipe)[0]).toMatchObject({
      confidence: 0.9,
      evidence: ["Photographic highlights remain natural"],
      legacy: false,
    });
  });

  it("marks a usable but incomplete package partial", () => {
    const input = candidate();
    input.styleInvariants = input.styleInvariants.slice(0, 2);
    const result = normalizeVisualRecipeCandidate(input);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.recipe.extractionStatus).toBe("partial");
  });

  it("derives variables and optional modifiers without model-owned derived fields", () => {
    const input = candidate();
    const result = normalizeVisualRecipeCandidate(input);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.recipe.contentVariables).toEqual([
      { name: "subject", label: "Subject", defaultValue: "amber bottle", sourceField: "subject" },
      { name: "subject_attributes", label: "Subject attributes", defaultValue: "ribbed glass", sourceField: "subject_attributes" },
      { name: "environment", label: "Environment", defaultValue: "quiet studio table", sourceField: "environment" },
      { name: "supporting_elements", label: "Supporting elements", defaultValue: "folded linen", sourceField: "supporting_elements" },
    ]);
    expect(result.recipe.optionalModifiers).toEqual([
      { name: "mood", label: "Mood", defaultValue: "calm restrained mood", dimension: "atmosphere", enabledByDefault: false },
      { name: "primary_color", label: "Primary color", defaultValue: "warm amber and sand palette", dimension: "color", enabledByDefault: false },
    ]);
    expect(result.recipe.promptOutputs.standardTemplate).toContain("{{subject}}");
  });

  it("selects the highest-confidence observation for each optional modifier deterministically", () => {
    const input = candidate();
    input.styleProfile.atmosphere.push({
      value: "energetic editorial mood",
      evidence: ["Dynamic contrast creates energy"],
      confidence: 0.91,
    });
    input.styleProfile.color.push({
      value: "cool slate accent palette",
      evidence: ["Slate accents repeat across the frame"],
      confidence: 0.96,
    });

    const first = normalizeVisualRecipeCandidate(input);
    const second = normalizeVisualRecipeCandidate(input);

    expect(first).toEqual(second);
    expect(first.kind).toBe("success");
    if (first.kind !== "success") return;
    expect(first.recipe.optionalModifiers).toMatchObject([
      { name: "mood", defaultValue: "energetic editorial mood" },
      { name: "primary_color", defaultValue: "cool slate accent palette" },
    ]);
  });

  it("keeps valid style evidence partial when optional fingerprint and negative fields are missing", () => {
    const input = candidate();
    input.styleFingerprint.tokens = [];
    input.negativeConstraints = [];

    const result = normalizeVisualRecipeCandidate(input);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.recipe.extractionStatus).toBe("partial");
    expect(result.recipe.extractionReasons.join(" ")).toMatch(/fingerprint tokens/i);
    expect(result.recipe.extractionReasons.join(" ")).toMatch(/negative constraints/i);
  });

  it("ignores deprecated derived fields and reports invalid negative constraint objects", () => {
    const input = candidate() as unknown as Record<string, unknown>;
    input.contentVariables = [
      { name: "subject_character", sourceField: "subject", value: "amber bottle" },
    ];
    input.optionalModifiers = [
      { name: "mood", sourceField: "atmosphere", value: "calm", enabledByDefault: false },
      { name: "mood", sourceField: "atmosphere", value: "quiet", enabledByDefault: false },
    ];
    input.negativeConstraints = [
      { kind: "soft", value: "no watermark" },
    ];

    const result = normalizeVisualRecipeCandidate(input);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.recipe.contentVariables[0]).toMatchObject({
      name: "subject",
      defaultValue: "amber bottle",
    });
    expect(result.recipe.optionalModifiers.filter((item) => item.name === "mood")).toHaveLength(1);
    expect(result.recipe.negativeConstraints).toEqual([]);
    expect(result.recipe.extractionReasons.join(" ")).toMatch(/invalid negative constraint/i);
  });

  it("returns a legal fallback envelope when the usable content core is missing", () => {
    const input = candidate();
    input.contentDescription.summary = "";
    const result = normalizeVisualRecipeCandidate(input);

    expect(result).toMatchObject({
      kind: "fallback",
      recipe: { schemaVersion: 2, extractionStatus: "fallback", promptOutputs: null },
    });
  });
});

describe("toDescriptionRecipeJson", () => {
  it("keeps only non-empty content, style values, and negative constraints", () => {
    const result = normalizeVisualRecipeCandidate(candidate());

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(toDescriptionRecipeJson(result.recipe)).toEqual({
      contentDescription: {
        summary: "An amber bottle on folded linen",
        subject: "amber bottle",
        subjectAttributes: ["ribbed glass"],
        environment: "quiet studio table",
        supportingElements: ["folded linen"],
      },
      styleProfile: {
        visualMedium: ["editorial product photography"],
        composition: ["asymmetric thirds composition"],
        camera: ["normal lens with shallow depth"],
        color: ["warm amber and sand palette"],
        lighting: ["soft directional window light"],
        materialTexture: ["matte linen against polished glass"],
        atmosphere: ["calm restrained mood"],
        rendering: ["fine natural detail"],
      },
      negativeConstraints: ["watermark", "distorted glass"],
    });
  });

  it("omits empty arrays and optional description fields", () => {
    const result = normalizeVisualRecipeCandidate(candidate());

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const recipe = {
      ...result.recipe,
      contentDescription: {
        ...result.recipe.contentDescription,
        subject: "",
        subjectAttributes: [],
        supportingElements: [],
      },
      negativeConstraints: [],
    };

    expect(toDescriptionRecipeJson(recipe)).toMatchObject({
      contentDescription: {
        summary: "An amber bottle on folded linen",
        environment: "quiet studio table",
      },
    });
    expect(toDescriptionRecipeJson(recipe)).not.toHaveProperty(
      "contentDescription.subject",
    );
    expect(toDescriptionRecipeJson(recipe)).not.toHaveProperty(
      "contentDescription.subjectAttributes",
    );
    expect(toDescriptionRecipeJson(recipe)).not.toHaveProperty(
      "contentDescription.supportingElements",
    );
    expect(toDescriptionRecipeJson(recipe)).not.toHaveProperty(
      "styleProfile.formLanguage",
    );
    expect(toDescriptionRecipeJson(recipe)).not.toHaveProperty(
      "negativeConstraints",
    );
  });
});
