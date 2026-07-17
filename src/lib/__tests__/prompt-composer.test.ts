import { describe, expect, it } from "vitest";
import { composePromptOutputs } from "@/lib/prompt-composer";
import { normalizeVisualRecipeCandidate } from "@/lib/visual-recipe";
import type { VisualRecipeSemanticCandidate } from "@/lib/visual-recipe";

const candidate: VisualRecipeSemanticCandidate = {
  contentDescription: { summary: "A blue chair", subject: "blue chair", subjectAttributes: [], supportingElements: [] },
  styleProfile: {
    visualMedium: [{ value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9 }],
    composition: [{ value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9 }],
    camera: [],
    color: [{ value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9 }],
    lighting: [{ value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9 }],
    formLanguage: [], materialTexture: [], atmosphere: [],
    rendering: [{ value: "fine grain", evidence: ["Fine grain is visible"], confidence: 0.8 }],
  },
  styleInvariants: [
    { kind: "hard", dimension: "composition", value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9, sourceObservationIds: ["composition_1"] },
    { kind: "hard", dimension: "color", value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9, sourceObservationIds: ["color_1"] },
    { kind: "hard", dimension: "lighting", value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9, sourceObservationIds: ["lighting_1"] },
    { kind: "hard", dimension: "visualMedium", value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9, sourceObservationIds: ["visual_medium_1"] },
    { kind: "soft", dimension: "rendering", value: "subtle film finish", evidence: ["Tonal response is filmic"], confidence: 0.7, sourceObservationIds: ["rendering_1"] },
  ],
  contentVariables: [{ name: "subject", label: "Subject", defaultValue: "blue chair", sourceField: "subject" }],
  optionalModifiers: [{ name: "primary_color", label: "Primary color", defaultValue: "blue", dimension: "color", enabledByDefault: false }],
  negativeConstraints: ["watermark"],
  styleFingerprint: { tokens: ["editorial", "cobalt", "soft light"], scores: { realism: 0.9, abstraction: 0.1, contrast: 0.5, saturation: 0.7, softness: 0.7, detailDensity: 0.6, symmetry: 0.9, depth: 0.4, atmosphericIntensity: 0.3 } },
};

function normalized() {
  const result = normalizeVisualRecipeCandidate(candidate);
  if (result.kind !== "success") throw new Error("expected success");
  return result.recipe;
}

describe("composePromptOutputs", () => {
  it("builds deterministic H, H+S, and H+S+D tiers without duplicating referenced observations", () => {
    const outputs = composePromptOutputs(normalized());
    expect(outputs.conciseTemplate).toContain("centered composition");
    expect(outputs.conciseTemplate).not.toContain("subtle film finish");
    expect(outputs.standardTemplate).toContain("subtle film finish");
    expect(outputs.professionalTemplate).not.toContain("fine grain");
    expect(outputs.standardTemplate).not.toContain("watermark");
  });

  it("replaces a dimension with an enabled optional modifier without mutating reconstruction", () => {
    const recipe = normalized();
    const outputs = composePromptOutputs(recipe, {
      enabledModifierNames: ["primary_color"],
      modifierValues: { primary_color: "signal red" },
    });

    expect(outputs.standardTemplate).toContain("{{primary_color}}");
    expect(outputs.standardTemplate).not.toContain("cobalt blue palette");
    expect(outputs.reconstructionPrompt).toContain("cobalt blue palette");
  });
});
