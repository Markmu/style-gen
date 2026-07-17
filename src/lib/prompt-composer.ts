import type {
  OptionalModifier,
  PromptOutputs,
  StyleDimension,
  TemplateVariable,
  VisualRecipeV2Success,
} from "@/types/models";
import { STYLE_DIMENSIONS } from "@/types/models";

const OUTPUT_MAX_LENGTH = 6000;

export interface PromptCompositionOptions {
  enabledInvariantIds?: string[];
  enabledModifierNames?: OptionalModifier["name"][];
  modifierValues?: Partial<Record<OptionalModifier["name"], string>>;
}

const DIMENSION_LABELS: Record<StyleDimension, string> = {
  composition: "Composition",
  camera: "Camera",
  color: "Color",
  lighting: "Lighting",
  visualMedium: "Medium",
  formLanguage: "Form",
  materialTexture: "Material",
  atmosphere: "Atmosphere",
  rendering: "Rendering",
};

// Content is emitted first. Remaining order follows the approved prompt contract.
const PROMPT_DIMENSION_ORDER: StyleDimension[] = [
  "composition",
  "camera",
  "color",
  "lighting",
  "visualMedium",
  "formLanguage",
  "materialTexture",
  "atmosphere",
  "rendering",
];

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function clampOutput(value: string) {
  return value.trim().slice(0, OUTPUT_MAX_LENGTH);
}

function contentTemplate(recipe: VisualRecipeV2Success) {
  return recipe.contentVariables
    .map((variable) => `{{${variable.name}}}`)
    .join(", ");
}

function reconstructionContent(recipe: VisualRecipeV2Success) {
  const content = recipe.contentDescription;
  return unique([
    content.summary,
    content.subject ?? "",
    ...content.subjectAttributes,
    content.actionOrState ?? "",
    content.environment ?? "",
    ...content.supportingElements,
    content.timeOrWeather ?? "",
  ]).join(", ");
}

function formatPrompt(parts: Array<{ label: string; values: string[] }>) {
  return clampOutput(
    parts
      .filter((part) => part.values.length > 0)
      .map((part) => `${part.label}: ${unique(part.values).join(", ")}`)
      .join("; "),
  );
}

function buildReusableTemplate(
  recipe: VisualRecipeV2Success,
  tier: "concise" | "standard" | "professional",
  options: PromptCompositionOptions,
) {
  const enabledIds = new Set(
    options.enabledInvariantIds ?? recipe.styleInvariants.map((item) => item.id),
  );
  const enabledModifiers = new Set(options.enabledModifierNames ?? []);
  const coveredObservationIds = new Set<string>();

  const parts: Array<{ label: string; values: string[] }> = [
    { label: "Content", values: [contentTemplate(recipe)] },
  ];

  for (const dimension of PROMPT_DIMENSION_ORDER) {
    const modifier = recipe.optionalModifiers.find(
      (item) => item.dimension === dimension && enabledModifiers.has(item.name),
    );
    if (modifier) {
      parts.push({
        label: DIMENSION_LABELS[dimension],
        values: [`{{${modifier.name}}}`],
      });
      continue;
    }

    const invariants = recipe.styleInvariants.filter(
      (item) =>
        item.dimension === dimension &&
        enabledIds.has(item.id) &&
        (item.kind === "hard" || tier !== "concise"),
    );
    invariants.forEach((item) =>
      item.sourceObservationIds.forEach((id) => coveredObservationIds.add(id)),
    );
    const values = invariants.map((item) => item.value);

    if (tier === "professional") {
      values.push(
        ...recipe.styleProfile[dimension]
          .filter(
            (observation) =>
              observation.confidence >= 0.5 &&
              !coveredObservationIds.has(observation.id),
          )
          .map((observation) => observation.value),
      );
    }

    parts.push({ label: DIMENSION_LABELS[dimension], values });
  }

  return formatPrompt(parts);
}

export function composePromptOutputs(
  recipe: VisualRecipeV2Success,
  options: PromptCompositionOptions = {},
): PromptOutputs {
  const reconstructionPrompt = formatPrompt([
    { label: "Content", values: [reconstructionContent(recipe)] },
    ...PROMPT_DIMENSION_ORDER.map((dimension) => ({
      label: DIMENSION_LABELS[dimension],
      values: recipe.styleProfile[dimension].map((item) => item.value),
    })),
  ]);

  return {
    reconstructionPrompt,
    conciseTemplate: buildReusableTemplate(recipe, "concise", options),
    standardTemplate: buildReusableTemplate(recipe, "standard", options),
    professionalTemplate: buildReusableTemplate(recipe, "professional", options),
  };
}

export function getPromptTemplateVariables(
  recipe: VisualRecipeV2Success,
  template: string,
): TemplateVariable[] {
  const candidates: TemplateVariable[] = [
    ...recipe.contentVariables,
    ...recipe.optionalModifiers.map((modifier): TemplateVariable => ({
      name: modifier.name,
      label: modifier.label,
      defaultValue: modifier.defaultValue,
    })),
  ];

  return candidates.filter((variable) => template.includes(`{{${variable.name}}}`));
}

export function assertKnownStyleDimensions(): void {
  // Kept as a cheap runtime guard for future model additions.
  for (const dimension of STYLE_DIMENSIONS) {
    if (!DIMENSION_LABELS[dimension]) {
      throw new Error(`Missing prompt label for ${dimension}`);
    }
  }
}
