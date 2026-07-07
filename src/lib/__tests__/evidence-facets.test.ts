import { describe, expect, it } from "vitest";
import { deriveEvidenceFacets } from "@/lib/evidence-facets";
import type { VisualRecipe } from "@/types/models";

const recipe: VisualRecipe = {
  imageSummary: "Editorial product study",
  subject: "Amber bottle on linen",
  scene: "Studio table",
  composition: "Balanced rule of thirds with a low horizon",
  cameraLanguage: "Medium crop",
  lighting: "Soft window light with long shadows and warm glow",
  color: "Warm neutral palette with amber, sand, and clean whites",
  texture: "Matte ceramic grain, woven linen, and smooth amber glass",
  styleTags: ["editorial", "warm neutral"],
  mood: "Calm and refined",
  visualKeywords: ["linen", "amber"],
  mustKeep: ["window light"],
  replaceable: ["props"],
};

describe("deriveEvidenceFacets", () => {
  it("keeps the stable evidence order and anchor indexes", () => {
    const facets = deriveEvidenceFacets(recipe);

    expect(facets.map((facet) => facet.id)).toEqual([
      "color",
      "composition",
      "lighting",
      "texture",
      "mood",
      "subject",
    ]);
    expect(facets.map((facet) => facet.anchorIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(facets.map((facet) => facet.sourceField)).toEqual([
      "color",
      "composition",
      "lighting",
      "texture",
      "mood",
      "subject",
    ]);
  });

  it("skips missing or blank recipe fields", () => {
    const facets = deriveEvidenceFacets({
      ...recipe,
      color: " ",
      texture: "",
    });

    expect(facets.map((facet) => facet.id)).toEqual([
      "composition",
      "lighting",
      "mood",
      "subject",
    ]);
  });

  it("derives confidence and tone deterministically", () => {
    const facets = deriveEvidenceFacets({
      ...recipe,
      subject: "Cup",
      mood: "Quiet",
    });

    expect(facets.find((facet) => facet.id === "color")).toMatchObject({
      tone: "color",
      confidenceLabel: "strong confidence",
    });
    expect(facets.find((facet) => facet.id === "subject")).toMatchObject({
      tone: "neutral",
      confidenceLabel: "weak confidence",
    });
  });

  it("returns an empty array without a recipe", () => {
    expect(deriveEvidenceFacets(null)).toEqual([]);
  });
});
