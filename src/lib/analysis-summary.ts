import type { VisualRecipe } from "@/types/models";

export type AnalysisDimension =
  | "style"
  | "material"
  | "lighting"
  | "composition"
  | "mood";

export interface DimensionScore {
  dimension: AnalysisDimension;
  label: string;
  value: string;
  percentage: number;
  iconName: string;
  iconColor: string;
}

const EMPTY_VALUE = "Not enough visual evidence yet";

function compactText(parts: Array<string | string[] | null | undefined>) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(", ");
}

function scoreText(value: string, keywords: string[]) {
  if (!value || value === EMPTY_VALUE) return 0;

  const normalized = value.toLowerCase();
  const keywordHits = keywords.filter((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  ).length;
  const lengthScore = Math.min(68, Math.round(value.length / 2.4));

  return Math.max(24, Math.min(96, 28 + lengthScore + keywordHits * 8));
}

export function extractAnalysisSummary(
  recipe: VisualRecipe | null,
): DimensionScore[] {
  if (!recipe) return [];

  const dimensions: Array<
    Omit<DimensionScore, "percentage"> & { keywords: string[] }
  > = [
    {
      dimension: "style",
      label: "Style",
      value: compactText([recipe.styleTags, recipe.cameraLanguage, recipe.visualKeywords]) || EMPTY_VALUE,
      iconName: "auto_awesome",
      iconColor: "var(--accent-edit)",
      keywords: ["style", "cinematic", "photo", "illustration", "landscape"],
    },
    {
      dimension: "material",
      label: "Material",
      value: compactText([recipe.texture, recipe.mustKeep, recipe.replaceable]) || EMPTY_VALUE,
      iconName: "texture",
      iconColor: "var(--accent-warm)",
      keywords: ["texture", "smooth", "grain", "glass", "metal", "water"],
    },
    {
      dimension: "lighting",
      label: "Lighting",
      value: compactText([recipe.lighting, recipe.color]) || EMPTY_VALUE,
      iconName: "light_mode",
      iconColor: "var(--accent-analyze)",
      keywords: ["light", "golden", "shadow", "glow", "warm", "cool"],
    },
    {
      dimension: "composition",
      label: "Composition",
      value: compactText([recipe.composition, recipe.scene]) || EMPTY_VALUE,
      iconName: "grid_goldenratio",
      iconColor: "var(--accent-primary)",
      keywords: ["third", "symmetry", "wide", "center", "foreground", "horizon"],
    },
    {
      dimension: "mood",
      label: "Mood",
      value: compactText([recipe.mood, recipe.imageSummary]) || EMPTY_VALUE,
      iconName: "neurology",
      iconColor: "var(--accent-result)",
      keywords: ["serene", "dramatic", "soft", "calm", "energetic", "moody"],
    },
  ];

  return dimensions.map(({ keywords, ...dimension }) => ({
    ...dimension,
    percentage: scoreText(dimension.value, keywords),
  }));
}
