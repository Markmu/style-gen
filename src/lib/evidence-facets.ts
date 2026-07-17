import { STYLE_DIMENSIONS, type StoredVisualRecipe, type StyleDimension } from "@/types/models";
import { isVisualRecipeV2Success, toLegacyVisualRecipe } from "@/lib/visual-recipe";

export type EvidenceFacetId = string;
export type EvidenceFacetTone =
  | "color"
  | "composition"
  | "lighting"
  | "texture"
  | "mood"
  | "neutral";

export interface EvidenceFacet {
  id: EvidenceFacetId;
  label: string;
  summary: string;
  tone: EvidenceFacetTone;
  confidenceLabel: string;
  confidence: number | null;
  evidence: string[];
  sourceField: string;
  anchorIndex: number;
  legacy: boolean;
}

const DIMENSION_LABELS: Record<StyleDimension, string> = {
  visualMedium: "Visual medium",
  composition: "Composition",
  camera: "Camera",
  color: "Color",
  lighting: "Lighting",
  formLanguage: "Form language",
  materialTexture: "Material & texture",
  atmosphere: "Atmosphere",
  rendering: "Rendering",
};

const DIMENSION_TONES: Record<StyleDimension, EvidenceFacetTone> = {
  color: "color",
  composition: "composition",
  lighting: "lighting",
  materialTexture: "texture",
  atmosphere: "mood",
  visualMedium: "neutral",
  camera: "neutral",
  formLanguage: "neutral",
  rendering: "neutral",
};

const LEGACY_FIELDS = [
  ["color", "Color", "color"],
  ["composition", "Composition", "composition"],
  ["lighting", "Lighting", "lighting"],
  ["texture", "Texture", "texture"],
  ["mood", "Mood", "mood"],
  ["subject", "Subject", "neutral"],
] as const;

export function deriveEvidenceFacets(recipe: StoredVisualRecipe | null): EvidenceFacet[] {
  if (!recipe) return [];

  if (isVisualRecipeV2Success(recipe)) {
    let anchorIndex = 0;
    return STYLE_DIMENSIONS.flatMap((dimension) =>
      recipe.styleProfile[dimension].map((observation) => ({
        id: observation.id,
        label: DIMENSION_LABELS[dimension],
        summary: observation.value,
        tone: DIMENSION_TONES[dimension],
        confidenceLabel: `${Math.round(observation.confidence * 100)}% model confidence`,
        confidence: observation.confidence,
        evidence: observation.evidence,
        sourceField: dimension,
        anchorIndex: anchorIndex++,
        legacy: false,
      })),
    );
  }

  const legacy = toLegacyVisualRecipe(recipe);
  if (!legacy) return [];
  return LEGACY_FIELDS.flatMap(([sourceField, label, tone], index) => {
    const summary = legacy[sourceField].trim();
    if (!summary) return [];
    return [{
      id: sourceField,
      label,
      summary,
      tone,
      confidenceLabel: "legacy · no model confidence",
      confidence: null,
      evidence: [],
      sourceField,
      anchorIndex: index,
      legacy: true,
    }];
  });
}
