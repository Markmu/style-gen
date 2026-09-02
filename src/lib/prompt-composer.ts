import type {
  CompiledPrompt,
  CompiledPromptSegment,
  OptionalModifier,
  PromptControlSnapshot,
  PromptOutputs,
  StyleDimension,
  StyleObservation,
  TemplateVariable,
  VisualRecipeV2Success,
} from "@/types/models";
import { STYLE_DIMENSIONS } from "@/types/models";
import { describeInvariantAdjustment } from "@/lib/prompt-adjustments";

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

// ---------------------------------------------------------------------------
// plan-01 §2（架构 §6.2 / AC-02）：composePromptDocument 与来源 segments。
// 确定性纯函数：无 LLM 二次改写、无外部调用；同一 Recipe 与控制快照重复编译结果一致。
// ---------------------------------------------------------------------------

interface SegmentDraft {
  text: string;
  sourceKind: CompiledPromptSegment["sourceKind"];
  sourceId: string;
  dimension?: StyleDimension;
}

function normalizeForDedup(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** reconstruction 意图的原始内容片段（架构 §6.2.1「reconstruction 使用原内容」） */
function reconstructionContentParts(
  recipe: VisualRecipeV2Success,
): Array<{ sourceId: string; value: string }> {
  const content = recipe.contentDescription;
  return [
    { sourceId: "summary", value: content.summary },
    { sourceId: "subject", value: content.subject ?? "" },
    ...content.subjectAttributes.map((value, index) => ({
      sourceId: `subject_attribute_${index + 1}`,
      value,
    })),
    { sourceId: "action", value: content.actionOrState ?? "" },
    { sourceId: "environment", value: content.environment ?? "" },
    ...content.supportingElements.map((value, index) => ({
      sourceId: `supporting_element_${index + 1}`,
      value,
    })),
    { sourceId: "time_weather", value: content.timeOrWeather ?? "" },
  ].filter((part) => part.value.trim().length > 0);
}

/** 三档表达各自的未覆盖 observation 选择（架构 §6.2.2，同分按 Recipe 原序） */
function selectTierObservations(
  dimension: StyleDimension,
  recipe: VisualRecipeV2Success,
  coveredObservationIds: Set<string>,
  detailLevel: PromptControlSnapshot["detailLevel"],
): StyleObservation[] {
  if (detailLevel === "concise") return [];

  const uncovered = recipe.styleProfile[dimension].filter(
    (observation) => !coveredObservationIds.has(observation.id),
  );

  if (detailLevel === "standard") {
    let best: StyleObservation | null = null;
    for (const observation of uncovered) {
      if (observation.confidence < 0.7) continue;
      if (!best || observation.confidence > best.confidence) best = observation;
    }
    return best ? [best] : [];
  }

  return uncovered.filter((observation) => observation.confidence >= 0.5);
}

/**
 * 编译 Prompt 文档（架构 §6.2）：
 * - reconstruction 使用原内容，same_style 使用变量模板；
 * - 三档均编入全部 enabled invariants（含 hard 与 soft）、当前变量与 enabled modifiers，
 *   差异只来自补充 observation：concise 不加、standard 每维至多一条 ≥0.7 最高项、
 *   professional 全部 ≥0.5 未覆盖项（Recipe 原序）；
 * - 对每条 invariant 读取唯一 adjustment（§6.2.3），disable 从模板移除；
 * - 按 Recipe 维度原序稳定输出并去重，segment 记录 sourceKind/sourceId/dimension/字符范围。
 */
export function composePromptDocument(
  recipe: VisualRecipeV2Success,
  controls: PromptControlSnapshot,
): CompiledPrompt {
  const adjustmentsByInvariantId = new Map(
    controls.adjustments.map((adjustment) => [adjustment.invariantId, adjustment]),
  );
  const enabledInvariantIds = new Set(controls.enabledInvariantIds);
  const enabledModifierNames = new Set(controls.enabledModifierNames);
  const coveredObservationIds = new Set<string>();
  const emittedValues = new Set<string>();

  const parts: Array<{ label: string; segments: SegmentDraft[] }> = [];

  const contentSegments: SegmentDraft[] = [];
  if (controls.intent === "reconstruction") {
    for (const part of reconstructionContentParts(recipe)) {
      const normalized = normalizeForDedup(part.value);
      if (!normalized || emittedValues.has(normalized)) continue;
      emittedValues.add(normalized);
      contentSegments.push({
        text: part.value,
        sourceKind: "content",
        sourceId: part.sourceId,
      });
    }
  } else {
    for (const variable of recipe.contentVariables) {
      const marker = `{{${variable.name}}}`;
      const normalized = normalizeForDedup(marker);
      if (emittedValues.has(normalized)) continue;
      emittedValues.add(normalized);
      contentSegments.push({
        text: marker,
        sourceKind: "content",
        sourceId: variable.name,
      });
    }
  }
  if (contentSegments.length > 0) {
    parts.push({ label: "Content", segments: contentSegments });
  }

  for (const dimension of PROMPT_DIMENSION_ORDER) {
    const dimensionSegments: SegmentDraft[] = [];

    for (const invariant of recipe.styleInvariants) {
      if (invariant.dimension !== dimension || !enabledInvariantIds.has(invariant.id)) {
        continue;
      }
      const adjustment = adjustmentsByInvariantId.get(invariant.id);
      const expression = adjustment
        ? describeInvariantAdjustment(invariant.value, adjustment)
        : invariant.value;
      // disable（或空表达）从模板移除；不标记 observation 覆盖
      if (expression === null || !expression.trim()) continue;

      dimensionSegments.push({
        text: expression,
        sourceKind: "invariant",
        sourceId: invariant.id,
        dimension,
      });
      if (adjustment) {
        dimensionSegments.push({
          text: expression,
          sourceKind: "adjustment",
          sourceId: invariant.id,
          dimension,
        });
      }
      emittedValues.add(normalizeForDedup(invariant.value));
      invariant.sourceObservationIds.forEach((id) => coveredObservationIds.add(id));
    }

    const modifier = recipe.optionalModifiers.find(
      (item) => item.dimension === dimension && enabledModifierNames.has(item.name),
    );
    if (modifier) {
      const text =
        controls.intent === "reconstruction"
          ? controls.modifierValues[modifier.name]?.trim() || modifier.defaultValue
          : `{{${modifier.name}}}`;
      const normalized = normalizeForDedup(text);
      if (normalized && !emittedValues.has(normalized)) {
        emittedValues.add(normalized);
        dimensionSegments.push({
          text,
          sourceKind: "modifier",
          sourceId: modifier.name,
          dimension,
        });
      }
    }

    for (const observation of selectTierObservations(
      dimension,
      recipe,
      coveredObservationIds,
      controls.detailLevel,
    )) {
      const normalized = normalizeForDedup(observation.value);
      if (!normalized || emittedValues.has(normalized)) continue;
      emittedValues.add(normalized);
      dimensionSegments.push({
        text: observation.value,
        sourceKind: "observation",
        sourceId: observation.id,
        dimension,
      });
    }

    if (dimensionSegments.length > 0) {
      parts.push({ label: DIMENSION_LABELS[dimension], segments: dimensionSegments });
    }
  }

  let text = "";
  const segments: CompiledPromptSegment[] = [];
  parts.forEach((part, partIndex) => {
    if (partIndex > 0) text += "; ";
    text += `${part.label}: `;
    part.segments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) text += ", ";
      const startIndex = text.length;
      text += segment.text;
      segments.push(
        segment.dimension === undefined
          ? {
              sourceKind: segment.sourceKind,
              sourceId: segment.sourceId,
              startIndex,
              endIndex: text.length,
            }
          : {
              sourceKind: segment.sourceKind,
              sourceId: segment.sourceId,
              dimension: segment.dimension,
              startIndex,
              endIndex: text.length,
            },
      );
    });
  });

  // 安全阀：超出输出上限时截断并保持 segment 字符范围合法（正常 ≤10 invariants 不会触发）
  const clampedText =
    text.length > OUTPUT_MAX_LENGTH ? text.slice(0, OUTPUT_MAX_LENGTH) : text;
  const clampedSegments =
    clampedText === text
      ? segments
      : segments
          .map((segment) => ({
            ...segment,
            startIndex: Math.min(segment.startIndex, clampedText.length),
            endIndex: Math.min(segment.endIndex, clampedText.length),
          }))
          .filter((segment) => segment.endIndex > segment.startIndex);

  return { text: clampedText, segments: clampedSegments };
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
