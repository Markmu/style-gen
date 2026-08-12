import type { VisualRecipe } from "@/types/models";

export type RecipeCategoryKey =
  | "structure"
  | "materials"
  | "lighting"
  | "color"
  | "mood";

export interface RecipeCategory {
  category: RecipeCategoryKey;
  label: string;
  description: string;
}

function fallback(value: string | null | undefined, fallbackText: string) {
  return value?.trim() || fallbackText;
}

function joinList(values: string[], fallbackText: string) {
  return values.length > 0 ? values.join(", ") : fallbackText;
}

export function extractRecipeCategories(
  recipe: VisualRecipe | null,
): RecipeCategory[] {
  if (!recipe) return [];

  return [
    {
      category: "structure",
      label: "Structure",
      description: fallback(
        [recipe.subject, recipe.scene, recipe.composition].filter(Boolean).join(" / "),
        "Core subject and composition will appear after analysis.",
      ),
    },
    {
      category: "materials",
      label: "Materials",
      description: fallback(
        [recipe.texture, joinList(recipe.mustKeep, "")].filter(Boolean).join(" / "),
        "Material and texture guidance will appear after analysis.",
      ),
    },
    {
      category: "lighting",
      label: "Lighting",
      description: fallback(
        [recipe.lighting, recipe.cameraLanguage].filter(Boolean).join(" / "),
        "Lighting and camera language will appear after analysis.",
      ),
    },
    {
      category: "color",
      label: "Color Palette",
      description: fallback(
        [recipe.color, joinList(recipe.styleTags, "")].filter(Boolean).join(" / "),
        "Color palette guidance will appear after analysis.",
      ),
    },
    {
      category: "mood",
      label: "Mood & Atmosphere",
      description: fallback(
        [recipe.mood, recipe.imageSummary].filter(Boolean).join(" / "),
        "Mood and atmosphere will appear after analysis.",
      ),
    },
  ];
}
