import {
  STYLE_DIMENSIONS,
  STYLE_FINGERPRINT_SCORE_KEYS,
  type ContentDescription,
  type ContentVariable,
  type LegacyVisualRecipe,
  type OptionalModifier,
  type StoredVisualRecipe,
  type StyleDimension,
  type StyleFingerprint,
  type StyleInvariant,
  type StyleObservation,
  type VisualRecipeV2,
  type VisualRecipeV2Fallback,
  type VisualRecipeV2Success,
} from "@/types/models";
import { composePromptOutputs } from "@/lib/prompt-composer";
import { hasUnresolvedVariables } from "@/lib/template-parser";

const ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_TEXT = 500;
const MAX_EVIDENCE = 240;

type CandidateObservation = Omit<StyleObservation, "id"> & { id?: string };
type CandidateInvariant = Omit<StyleInvariant, "id"> & { id?: string };

export interface VisualRecipeSemanticCandidate {
  contentDescription: ContentDescription;
  styleProfile: Record<StyleDimension, CandidateObservation[]>;
  styleInvariants: CandidateInvariant[];
  contentVariables: ContentVariable[];
  optionalModifiers: OptionalModifier[];
  negativeConstraints: string[];
  styleFingerprint: StyleFingerprint;
}

export type NormalizedVisualRecipeResult =
  | { kind: "success"; recipe: VisualRecipeV2Success }
  | {
      kind: "fallback";
      fallbackCause: "invalid" | "insufficient";
      recipe: VisualRecipeV2Fallback;
    };

const DIMENSION_ID_PREFIX: Record<StyleDimension, string> = {
  visualMedium: "visual_medium",
  composition: "composition",
  camera: "camera",
  color: "color",
  lighting: "lighting",
  formLanguage: "form_language",
  materialTexture: "material_texture",
  atmosphere: "atmosphere",
  rendering: "rendering",
};

const CONTENT_SOURCE_FIELDS = new Set([
  "subject",
  "subject_attributes",
  "action",
  "environment",
  "supporting_elements",
  "time_weather",
]);

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= max ? normalized : null;
}

function textList(value: unknown, maxItems: number, maxLength = MAX_TEXT) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLength))
    .filter((item): item is string => item !== null)
    .slice(0, maxItems);
}

function finiteConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function fallback(
  reasons: string[],
  fallbackCause: "invalid" | "insufficient" = "insufficient",
): NormalizedVisualRecipeResult {
  return {
    kind: "fallback",
    fallbackCause,
    recipe: {
      schemaVersion: 2,
      extractionStatus: "fallback",
      extractionReasons: reasons.slice(0, 10),
      promptOutputs: null,
    },
  };
}

function normalizeContent(value: unknown): ContentDescription | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const summary = text(source.summary);
  if (!summary) return null;
  const optional = (key: string) => text(source[key]) ?? undefined;
  return {
    summary,
    subject: optional("subject"),
    subjectAttributes: textList(source.subjectAttributes, 20),
    actionOrState: optional("actionOrState"),
    environment: optional("environment"),
    supportingElements: textList(source.supportingElements, 20),
    timeOrWeather: optional("timeOrWeather"),
  };
}

function normalizeProfile(
  value: unknown,
  reasons: string[],
) {
  const source = value && typeof value === "object"
    ? value as Partial<Record<StyleDimension, unknown>>
    : {};
  const profile = {} as Record<StyleDimension, StyleObservation[]>;
  const idAliases = new Map<string, string>();

  for (const dimension of STYLE_DIMENSIONS) {
    const candidates = Array.isArray(source[dimension]) ? source[dimension] : [];
    const observations: StyleObservation[] = [];
    for (const raw of candidates.slice(0, 5)) {
      if (!raw || typeof raw !== "object") continue;
      const candidate = raw as Record<string, unknown>;
      const valueText = text(candidate.value);
      const evidence = textList(candidate.evidence, 3, MAX_EVIDENCE);
      if (!valueText || evidence.length === 0 || !finiteConfidence(candidate.confidence)) {
        reasons.push(`Dropped invalid ${dimension} observation.`);
        continue;
      }
      const id = `${DIMENSION_ID_PREFIX[dimension]}_${observations.length + 1}`;
      const oldId = text(candidate.id, 64);
      if (oldId) idAliases.set(oldId, id);
      idAliases.set(`${dimension}_${observations.length + 1}`, id);
      idAliases.set(id, id);
      observations.push({ id, value: valueText, evidence, confidence: candidate.confidence });
    }
    profile[dimension] = observations;
  }

  return { profile, idAliases };
}

function normalizeInvariants(
  value: unknown,
  profile: Record<StyleDimension, StyleObservation[]>,
  idAliases: Map<string, string>,
  contentDescription: ContentDescription | null,
  reasons: string[],
) {
  if (!Array.isArray(value)) return [];
  const allObservationIds = new Set(
    STYLE_DIMENSIONS.flatMap((dimension) => profile[dimension].map((item) => item.id)),
  );
  const perDimension = new Map<StyleDimension, number>();
  const invariants: StyleInvariant[] = [];
  const contentFacts = contentDescription
    ? [
        contentDescription.subject,
        ...contentDescription.subjectAttributes,
        contentDescription.actionOrState,
        contentDescription.environment,
        ...contentDescription.supportingElements,
        contentDescription.timeOrWeather,
      ]
        .filter((item): item is string => Boolean(item && item.trim().length >= 3))
        .map((item) => item.toLocaleLowerCase())
    : [];

  for (const raw of value) {
    if (invariants.length >= 10 || !raw || typeof raw !== "object") break;
    const candidate = raw as Record<string, unknown>;
    const dimension = STYLE_DIMENSIONS.find((item) => item === candidate.dimension);
    const valueText = text(candidate.value);
    const evidence = textList(candidate.evidence, 3, MAX_EVIDENCE);
    const confidence = candidate.confidence;
    if (!dimension || !valueText || !finiteConfidence(confidence)) {
      reasons.push("Dropped invalid style invariant.");
      continue;
    }
    if (confidence < 0.5 || evidence.length === 0) {
      reasons.push(`Dropped ${dimension} invariant below the evidence threshold.`);
      continue;
    }
    if (contentFacts.some((fact) => valueText.toLocaleLowerCase().includes(fact))) {
      reasons.push(`Dropped ${dimension} invariant that fixed reference content.`);
      continue;
    }
    const sourceObservationIds = textList(candidate.sourceObservationIds, 3, 64)
      .map((id) => idAliases.get(id) ?? id)
      .filter((id, index, ids) => allObservationIds.has(id) && ids.indexOf(id) === index)
      .slice(0, 3);
    if (sourceObservationIds.length === 0) {
      reasons.push(`Dropped ${dimension} invariant without a valid observation reference.`);
      continue;
    }
    const next = (perDimension.get(dimension) ?? 0) + 1;
    perDimension.set(dimension, next);
    invariants.push({
      id: `${DIMENSION_ID_PREFIX[dimension]}_invariant_${next}`,
      value: valueText,
      evidence,
      confidence,
      dimension,
      kind: confidence >= 0.7 && candidate.kind === "hard" ? "hard" : "soft",
      sourceObservationIds,
    });
    if (candidate.kind === "hard" && confidence < 0.7) {
      reasons.push(`Downgraded ${dimension} hard invariant to soft.`);
    }
  }
  return invariants;
}

function normalizeVariables(value: unknown, reasons: string[]) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw): ContentVariable[] => {
    if (!raw || typeof raw !== "object") return [];
    const candidate = raw as Record<string, unknown>;
    const name = text(candidate.name, 64);
    const label = text(candidate.label, 80);
    const defaultValue = text(candidate.defaultValue);
    if (
      !name || !ID_PATTERN.test(name) || seen.has(name) || !label || !defaultValue ||
      !CONTENT_SOURCE_FIELDS.has(String(candidate.sourceField))
    ) {
      reasons.push("Dropped invalid content variable.");
      return [];
    }
    seen.add(name);
    return [{ name, label, defaultValue, sourceField: candidate.sourceField as ContentVariable["sourceField"] }];
  }).slice(0, 8);
}

function normalizeModifiers(value: unknown, reasons: string[]) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw): OptionalModifier[] => {
    if (!raw || typeof raw !== "object") return [];
    const candidate = raw as Record<string, unknown>;
    const name = candidate.name === "mood" || candidate.name === "primary_color"
      ? candidate.name
      : null;
    const expectedDimension = name === "mood" ? "atmosphere" : name === "primary_color" ? "color" : null;
    const label = text(candidate.label, 80);
    const defaultValue = text(candidate.defaultValue);
    if (!name || !expectedDimension || candidate.dimension !== expectedDimension || candidate.enabledByDefault !== false || !label || !defaultValue || seen.has(name)) {
      reasons.push("Dropped invalid optional modifier.");
      return [];
    }
    seen.add(name);
    return [{ name, label, defaultValue, dimension: expectedDimension, enabledByDefault: false } as OptionalModifier];
  });
}

function normalizeFingerprint(value: unknown): StyleFingerprint {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawScores = source.scores && typeof source.scores === "object"
    ? source.scores as Record<string, unknown>
    : {};
  const scores = {} as StyleFingerprint["scores"];
  for (const key of STYLE_FINGERPRINT_SCORE_KEYS) {
    const score = rawScores[key];
    scores[key] = score === null || finiteConfidence(score) ? score : null;
  }
  return { tokens: textList(source.tokens, 12, 100), scores };
}

export function normalizeVisualRecipeCandidate(candidate: unknown): NormalizedVisualRecipeResult {
  if (!candidate || typeof candidate !== "object") {
    return fallback(["The structured response was not an object."], "invalid");
  }
  const source = candidate as Record<string, unknown>;
  const hasCoreShape =
    source.contentDescription !== null && typeof source.contentDescription === "object" &&
    source.styleProfile !== null && typeof source.styleProfile === "object" &&
    Array.isArray(source.styleInvariants) &&
    Array.isArray(source.contentVariables) &&
    Array.isArray(source.optionalModifiers) &&
    Array.isArray(source.negativeConstraints) &&
    source.styleFingerprint !== null && typeof source.styleFingerprint === "object";
  if (!hasCoreShape) {
    return fallback(["The semantic candidate is missing required core fields."], "invalid");
  }
  const reasons: string[] = [];
  const contentDescription = normalizeContent(source.contentDescription);
  const { profile: styleProfile, idAliases } = normalizeProfile(source.styleProfile, reasons);
  const styleInvariants = normalizeInvariants(
    source.styleInvariants,
    styleProfile,
    idAliases,
    contentDescription,
    reasons,
  );
  const contentVariables = normalizeVariables(source.contentVariables, reasons);
  const optionalModifiers = normalizeModifiers(source.optionalModifiers, reasons);
  const negativeConstraints = textList(source.negativeConstraints, 20);
  const styleFingerprint = normalizeFingerprint(source.styleFingerprint);

  if (
    !contentDescription ||
    contentVariables.length === 0 ||
    styleInvariants.length === 0 ||
    styleFingerprint.tokens.length === 0 ||
    negativeConstraints.length === 0
  ) {
    return fallback([
      ...reasons,
      "The response did not contain a usable summary, content variable, and style invariant.",
    ], contentDescription ? "insufficient" : "invalid");
  }

  const nonEmptyDimensions = STYLE_DIMENSIONS.filter((dimension) => styleProfile[dimension].length > 0).length;
  const fingerprintComplete = STYLE_FINGERPRINT_SCORE_KEYS.every(
    (key) => typeof styleFingerprint.scores[key] === "number",
  );
  const ready =
    nonEmptyDimensions >= 4 &&
    styleInvariants.length >= 5 &&
    styleFingerprint.tokens.length >= 3 &&
    fingerprintComplete;
  if (!ready) reasons.push("The valid extraction is incomplete and is available as partial.");

  const recipe: VisualRecipeV2Success = {
    schemaVersion: 2,
    extractionStatus: ready ? "ready" : "partial",
    extractionReasons: reasons.slice(0, 10),
    contentDescription,
    styleProfile,
    styleInvariants,
    contentVariables,
    optionalModifiers,
    negativeConstraints,
    styleFingerprint,
    promptOutputs: {
      reconstructionPrompt: "",
      conciseTemplate: "",
      standardTemplate: "",
      professionalTemplate: "",
    },
  };
  recipe.promptOutputs = composePromptOutputs(recipe);
  if (!recipe.promptOutputs.standardTemplate || hasUnresolvedVariables(
    renderPromptTemplate(recipe.promptOutputs.standardTemplate, recipe),
  )) {
    return fallback([...reasons, "The standard prompt could not be resolved."]);
  }
  return { kind: "success", recipe };
}

export function renderPromptTemplate(
  template: string,
  recipe: VisualRecipeV2Success,
  values: Record<string, string> = {},
) {
  const defaults: Record<string, string> = {};
  recipe.contentVariables.forEach((item) => { defaults[item.name] = item.defaultValue; });
  recipe.optionalModifiers.forEach((item) => { defaults[item.name] = item.defaultValue; });
  return template.replace(/\{\{([^{}]+)\}\}/g, (marker, rawName: string) => {
    const name = rawName.trim();
    return values[name] ?? defaults[name] ?? marker;
  });
}

export function isVisualRecipeV2(recipe: StoredVisualRecipe | null | undefined): recipe is VisualRecipeV2 {
  return Boolean(recipe && "schemaVersion" in recipe && recipe.schemaVersion === 2);
}

export function isVisualRecipeV2Success(recipe: StoredVisualRecipe | null | undefined): recipe is VisualRecipeV2Success {
  return isVisualRecipeV2(recipe) && recipe.extractionStatus !== "fallback";
}

export function isLegacyVisualRecipe(recipe: StoredVisualRecipe | null | undefined): recipe is LegacyVisualRecipe {
  return Boolean(recipe && !isVisualRecipeV2(recipe) && "imageSummary" in recipe);
}

function valuesFor(recipe: VisualRecipeV2Success, dimension: StyleDimension) {
  return recipe.styleProfile[dimension].map((item) => item.value).join(", ");
}

export function toLegacyVisualRecipe(recipe: StoredVisualRecipe | null): LegacyVisualRecipe | null {
  if (!recipe) return null;
  if (isLegacyVisualRecipe(recipe)) return recipe;
  if (!isVisualRecipeV2Success(recipe)) return null;
  const content = recipe.contentDescription;
  return {
    imageSummary: content.summary,
    subject: [content.subject, ...content.subjectAttributes, content.actionOrState].filter(Boolean).join(", "),
    scene: [content.environment, ...content.supportingElements, content.timeOrWeather].filter(Boolean).join(", "),
    composition: valuesFor(recipe, "composition"),
    cameraLanguage: valuesFor(recipe, "camera"),
    lighting: valuesFor(recipe, "lighting"),
    color: valuesFor(recipe, "color"),
    texture: valuesFor(recipe, "materialTexture"),
    styleTags: recipe.styleFingerprint.tokens,
    mood: valuesFor(recipe, "atmosphere"),
    visualKeywords: recipe.styleFingerprint.tokens,
    mustKeep: recipe.styleInvariants.filter((item) => item.kind === "hard").map((item) => item.value),
    replaceable: recipe.contentVariables.map((item) => item.defaultValue),
  };
}
