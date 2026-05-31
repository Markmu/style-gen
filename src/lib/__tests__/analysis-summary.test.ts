import { extractAnalysisSummary } from "@/lib/analysis-summary";
import type { VisualRecipe } from "@/types/models";

const recipe: VisualRecipe = {
  imageSummary: "A serene sunset over a calm ocean",
  subject: "Ocean sunset",
  scene: "Coastal beach at dusk",
  composition: "Rule of thirds with horizon on lower third",
  cameraLanguage: "Wide angle, eye level",
  lighting: "Golden hour, warm backlight",
  color: "Warm orange and purple gradient",
  texture: "Smooth water, soft clouds",
  styleTags: ["landscape", "nature", "golden hour"],
  mood: "Serene and contemplative",
  visualKeywords: ["sunset", "ocean", "golden light"],
  mustKeep: ["warm color temperature", "horizon composition"],
  replaceable: ["specific cloud formations"],
};

describe("extractAnalysisSummary", () => {
  it("returns five deterministic dimensions", () => {
    const summary = extractAnalysisSummary(recipe);

    expect(summary.map((item) => item.label)).toEqual([
      "Style",
      "Material",
      "Lighting",
      "Composition",
      "Mood",
    ]);
    expect(summary).toHaveLength(5);
  });

  it("calculates bounded percentages from recipe text", () => {
    const summary = extractAnalysisSummary(recipe);

    for (const item of summary) {
      expect(item.percentage).toBeGreaterThanOrEqual(0);
      expect(item.percentage).toBeLessThanOrEqual(100);
    }
    expect(summary.find((item) => item.dimension === "lighting")?.percentage).toBeGreaterThan(40);
  });

  it("returns an empty array without a recipe", () => {
    expect(extractAnalysisSummary(null)).toEqual([]);
  });
});
