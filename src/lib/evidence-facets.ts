import type { VisualRecipe } from "@/types/models";

export type EvidenceFacetId =
  | "color"
  | "composition"
  | "lighting"
  | "texture"
  | "mood"
  | "subject";

export type EvidenceFacetTone =
  | "color"
  | "composition"
  | "lighting"
  | "texture"
  | "mood"
  | "neutral";

export type EvidenceConfidenceLabel =
  | "strong confidence"
  | "medium confidence"
  | "weak confidence";

export interface EvidenceFacet {
  id: EvidenceFacetId;
  label: string;
  summary: string;
  tone: EvidenceFacetTone;
  confidenceLabel: EvidenceConfidenceLabel;
  sourceField: keyof VisualRecipe;
  anchorIndex: number;
}

interface FacetDefinition {
  id: EvidenceFacetId;
  label: string;
  sourceField: keyof VisualRecipe;
  tone: EvidenceFacetTone;
  keywords: string[];
}

const FACET_DEFINITIONS: FacetDefinition[] = [
  {
    id: "color",
    label: "Color",
    sourceField: "color",
    tone: "color",
    keywords: ["palette", "color", "warm", "cool", "tone", "hue", "saturation"],
  },
  {
    id: "composition",
    label: "Composition",
    sourceField: "composition",
    tone: "composition",
    keywords: ["composition", "framing", "third", "symmetry", "horizon", "center"],
  },
  {
    id: "lighting",
    label: "Lighting",
    sourceField: "lighting",
    tone: "lighting",
    keywords: ["light", "lighting", "shadow", "glow", "backlight", "window", "hour"],
  },
  {
    id: "texture",
    label: "Texture",
    sourceField: "texture",
    tone: "texture",
    keywords: ["texture", "grain", "matte", "smooth", "glass", "water", "cloud"],
  },
  {
    id: "mood",
    label: "Mood",
    sourceField: "mood",
    tone: "mood",
    keywords: ["mood", "calm", "serene", "dramatic", "quiet", "refined"],
  },
  {
    id: "subject",
    label: "Subject",
    sourceField: "subject",
    tone: "neutral",
    keywords: ["subject", "object", "person", "product", "scene"],
  },
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function confidenceFor(summary: string, keywords: string[]): EvidenceConfidenceLabel {
  const normalized = summary.toLowerCase();
  const keywordHits = keywords.filter((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  ).length;
  const commaRichness = (summary.match(/[,;·]/g) ?? []).length;
  const score = summary.length + keywordHits * 18 + commaRichness * 8;

  if (score >= 78) return "strong confidence";
  if (score >= 38) return "medium confidence";
  return "weak confidence";
}

export function deriveEvidenceFacets(recipe: VisualRecipe | null): EvidenceFacet[] {
  if (!recipe) return [];

  return FACET_DEFINITIONS.flatMap((definition, index) => {
    const summary = normalizeText(recipe[definition.sourceField]);
    if (!summary) return [];

    return [
      {
        id: definition.id,
        label: definition.label,
        summary,
        tone: definition.tone,
        confidenceLabel: confidenceFor(summary, definition.keywords),
        sourceField: definition.sourceField,
        anchorIndex: index,
      },
    ];
  });
}
