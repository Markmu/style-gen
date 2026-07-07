import type { HistoryStripItem } from "@/components/workspace/history-strip";
import type { VisualRecipe, TemplateVariable } from "@/types/models";

export const previewReferenceImageUrl =
  "/workspace/editorial-soft-light-reference.png";

export const previewRecipe: VisualRecipe = {
  imageSummary:
    "A quiet editorial still life with warm neutral surfaces, soft window shadows, ceramic matte texture, and amber glass highlights.",
  subject: "matte ceramic vase with dried branches and an amber glass bottle",
  scene: "linen-covered table against a warm neutral wall",
  composition: "simple balanced composition with breathing space and rule-of-thirds placement",
  cameraLanguage: "natural window-light editorial product photography, medium portrait crop",
  lighting: "soft natural window light with gentle geometric shadows",
  color: "warm neutral palette with beige, sand, amber, clean whites, and low saturation",
  texture: "matte ceramic, smooth amber glass, dry botanical stems, and woven linen",
  styleTags: ["editorial still life", "warm neutral", "minimal", "soft window light"],
  mood: "calm, timeless, quiet, and refined",
  visualKeywords: ["linen", "amber glass", "ceramic matte", "window shadow", "soft contrast"],
  mustKeep: ["natural window light", "warm neutral palette", "minimal composition"],
  replaceable: ["subject arrangement", "surface textile", "prop scale"],
};

export const previewPrompt =
  "A still life on a linen-covered table, captured in natural window light with soft shadows and gentle contrast. Warm neutral palette with beige, sand, and amber tones, low saturation and clean whites. Minimal composition, balanced placement with breathing space and rule of thirds. Matte ceramic vase with dried branches and amber glass bottle, subtle textures and quiet mood.";

export const previewNegativePrompt =
  "over-saturated colors, harsh shadows, busy background";

export const previewTemplateContent =
  "A still life featuring {{subject}} in {{light_type}}, with {{mood}} mood, warm neutral palette, subtle textures, and balanced editorial composition.";

export const previewTemplateVariables: TemplateVariable[] = [
  {
    name: "subject",
    defaultValue: "vase + bottle",
    label: "Subject",
    sourceField: "subject",
  },
  {
    name: "light_type",
    defaultValue: "window light",
    label: "Light Type",
    sourceField: "lighting_color",
  },
  {
    name: "mood",
    defaultValue: "calm minimal",
    label: "Mood",
    sourceField: "mood",
  },
];

export const previewHistoryItems: HistoryStripItem[] = Array.from(
  { length: 5 },
  (_, index) => ({
    id: `preview-history-${index + 1}`,
    resultFileUrl: previewReferenceImageUrl,
    createdAt: new Date(2026, 6, 3, 10, index).toISOString(),
  }),
);
