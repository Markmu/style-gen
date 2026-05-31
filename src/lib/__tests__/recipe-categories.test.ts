import { extractRecipeCategories } from "@/lib/recipe-categories";
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

describe("extractRecipeCategories", () => {
  it("returns the five recipe categories used by the workspace card", () => {
    const categories = extractRecipeCategories(recipe);

    expect(categories.map((item) => item.label)).toEqual([
      "Structure",
      "Materials",
      "Lighting",
      "Color Palette",
      "Mood & Atmosphere",
    ]);
    expect(categories.every((item) => item.description.length > 0)).toBe(true);
  });

  it("returns an empty array without a recipe", () => {
    expect(extractRecipeCategories(null)).toEqual([]);
  });
});
