import { describe, expect, it } from "vitest";
import { composePromptDocument, composePromptOutputs } from "@/lib/prompt-composer";
import { deriveKeepChangeSummary } from "@/lib/prompt-adjustments";
import { normalizeVisualRecipeCandidate } from "@/lib/visual-recipe";
import type { VisualRecipeSemanticCandidate } from "@/lib/visual-recipe";
import { STYLE_DIMENSIONS } from "@/types/models";
import type {
  ContentVariable,
  PromptControlSnapshot,
  StyleDimension,
  StyleInvariant,
  StyleObservation,
  VisualRecipeV2Success,
} from "@/types/models";

const candidate: VisualRecipeSemanticCandidate = {
  contentDescription: { summary: "A blue chair", subject: "blue chair", subjectAttributes: [], supportingElements: [] },
  styleProfile: {
    visualMedium: [{ value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9 }],
    composition: [{ value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9 }],
    camera: [],
    color: [{ value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9 }],
    lighting: [{ value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9 }],
    formLanguage: [], materialTexture: [], atmosphere: [],
    rendering: [{ value: "fine grain", evidence: ["Fine grain is visible"], confidence: 0.8 }],
  },
  styleInvariants: [
    { kind: "hard", dimension: "composition", value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9, sourceObservationIds: ["composition_1"] },
    { kind: "hard", dimension: "color", value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9, sourceObservationIds: ["color_1"] },
    { kind: "hard", dimension: "lighting", value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9, sourceObservationIds: ["lighting_1"] },
    { kind: "hard", dimension: "visualMedium", value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9, sourceObservationIds: ["visual_medium_1"] },
    { kind: "soft", dimension: "rendering", value: "subtle film finish", evidence: ["Tonal response is filmic"], confidence: 0.7, sourceObservationIds: ["rendering_1"] },
  ],
  contentVariables: [{ name: "subject", label: "Subject", defaultValue: "blue chair", sourceField: "subject" }],
  optionalModifiers: [{ name: "primary_color", label: "Primary color", defaultValue: "blue", dimension: "color", enabledByDefault: false }],
  negativeConstraints: ["watermark"],
  styleFingerprint: { tokens: ["editorial", "cobalt", "soft light"], scores: { realism: 0.9, abstraction: 0.1, contrast: 0.5, saturation: 0.7, softness: 0.7, detailDensity: 0.6, symmetry: 0.9, depth: 0.4, atmosphericIntensity: 0.3 } },
};

function normalized() {
  const result = normalizeVisualRecipeCandidate(candidate);
  if (result.kind !== "success") throw new Error("expected success");
  return result.recipe;
}

describe("composePromptOutputs", () => {
  it("builds deterministic H, H+S, and H+S+D tiers without duplicating referenced observations", () => {
    const outputs = composePromptOutputs(normalized());
    expect(outputs.conciseTemplate).toContain("centered composition");
    expect(outputs.conciseTemplate).not.toContain("subtle film finish");
    expect(outputs.standardTemplate).toContain("subtle film finish");
    expect(outputs.professionalTemplate).not.toContain("fine grain");
    expect(outputs.standardTemplate).not.toContain("watermark");
  });

  it("replaces a dimension with an enabled optional modifier without mutating reconstruction", () => {
    const recipe = normalized();
    const outputs = composePromptOutputs(recipe, {
      enabledModifierNames: ["primary_color"],
      modifierValues: { primary_color: "signal red" },
    });

    expect(outputs.standardTemplate).toContain("{{primary_color}}");
    expect(outputs.standardTemplate).not.toContain("cobalt blue palette");
    expect(outputs.reconstructionPrompt).toContain("cobalt blue palette");
  });
});

// ---------------------------------------------------------------------------
// plan-01 §2 / AC-02：composePromptDocument（两意图、三档表达、来源 segments）
// ---------------------------------------------------------------------------

/** 覆盖三档 observation 阈值与并列排序所需的 fixture（color 含 0.85/0.6 未覆盖项，camera 含同分 0.6 项） */
const tieredCandidate: VisualRecipeSemanticCandidate = {
  contentDescription: {
    summary: "A blue chair",
    subject: "blue chair",
    subjectAttributes: ["chrome legs"],
    supportingElements: [],
  },
  styleProfile: {
    visualMedium: [
      { value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9 },
    ],
    composition: [
      { value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9 },
    ],
    camera: [
      { value: "35mm lens rendering", evidence: ["Framing matches 35mm"], confidence: 0.6 },
      { value: "eye-level perspective", evidence: ["Horizon at eye level"], confidence: 0.6 },
    ],
    color: [
      { value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9 },
      { value: "muted gray shadows", evidence: ["Shadows stay neutral"], confidence: 0.85 },
      { value: "warm highlight bloom", evidence: ["Highlights are warm"], confidence: 0.6 },
    ],
    lighting: [
      { value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9 },
    ],
    formLanguage: [],
    materialTexture: [],
    atmosphere: [
      { value: "faint haze", evidence: ["Distant tones fade"], confidence: 0.3 },
    ],
    rendering: [
      { value: "fine grain", evidence: ["Fine grain is visible"], confidence: 0.8 },
    ],
  },
  styleInvariants: [
    { kind: "hard", dimension: "composition", value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9, sourceObservationIds: ["composition_1"] },
    { kind: "hard", dimension: "color", value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9, sourceObservationIds: ["color_1"] },
    { kind: "hard", dimension: "lighting", value: "soft top light", evidence: ["Soft shadow below"], confidence: 0.9, sourceObservationIds: ["lighting_1"] },
    { kind: "hard", dimension: "visualMedium", value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9, sourceObservationIds: ["visual_medium_1"] },
    { kind: "soft", dimension: "rendering", value: "subtle film finish", evidence: ["Tonal response is filmic"], confidence: 0.7, sourceObservationIds: ["rendering_1"] },
  ],
  negativeConstraints: ["watermark"],
  styleFingerprint: { tokens: ["editorial", "cobalt", "soft light"], scores: { realism: 0.9, abstraction: 0.1, contrast: 0.5, saturation: 0.7, softness: 0.7, detailDensity: 0.6, symmetry: 0.9, depth: 0.4, atmosphericIntensity: 0.3 } },
};

function tieredRecipe() {
  const result = normalizeVisualRecipeCandidate(tieredCandidate);
  if (result.kind !== "success") throw new Error("expected tiered fixture to normalize");
  return result.recipe;
}

/** plan-01 §1 PromptControlSnapshot 的测试侧形状（Task 1 类型落地后与 src/types/models.ts 对齐） */
interface DocumentControls {
  schemaVersion: 1;
  trigger: "manual" | "quick_recreate";
  intent: "reconstruction" | "same_style";
  detailLevel: "concise" | "standard" | "professional";
  editorMode: "variables" | "text" | "structured";
  customPromptDirty: boolean;
  enabledInvariantIds: string[];
  variableValues: Record<string, string>;
  enabledModifierNames: string[];
  modifierValues: Record<string, string>;
  adjustments: Array<{ invariantId: string; action: "strengthen" | "relax" | "replace" | "disable"; replacementValue?: string }>;
  customTemplate?: string;
}

function documentControls(
  recipe: ReturnType<typeof tieredRecipe>,
  overrides: Partial<DocumentControls> = {},
): DocumentControls {
  return {
    schemaVersion: 1,
    trigger: "manual",
    intent: "same_style",
    detailLevel: "standard",
    editorMode: "variables",
    customPromptDirty: false,
    enabledInvariantIds: recipe.styleInvariants.map((item) => item.id),
    variableValues: { subject: "a red kettle" },
    enabledModifierNames: ["mood"],
    modifierValues: { mood: "calm morning" },
    adjustments: [],
    ...overrides,
  };
}

interface TestSegment {
  sourceKind: "content" | "invariant" | "observation" | "modifier" | "adjustment";
  sourceId: string;
  dimension?: string;
  startIndex: number;
  endIndex: number;
}

function invariantSegmentIds(doc: { segments: TestSegment[] }) {
  return doc.segments.filter((segment) => segment.sourceKind === "invariant").map((segment) => segment.sourceId);
}

function observationSegments(doc: { segments: TestSegment[] }) {
  return doc.segments.filter((segment) => segment.sourceKind === "observation");
}

describe("composePromptDocument（plan-01 §2 / AC-02）", () => {
  it("reconstruction 意图使用原内容而不是变量模板", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { intent: "reconstruction" }));

    expect(doc.text).toContain("blue chair");
    expect(doc.text).not.toContain("{{subject}}");
    expect(doc.text).toContain("centered composition");
  });

  it("same_style 意图使用变量模板并保留 enabled modifier 占位符", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { intent: "same_style", detailLevel: "concise" }));

    expect(doc.text).toContain("{{subject}}");
    expect(doc.text).not.toContain("blue chair");
    expect(doc.text).toContain("{{mood}}");
    expect(
      doc.segments.filter((segment) => segment.sourceKind === "modifier").map((segment) => segment.sourceId),
    ).toContain("mood");
  });

  it("同一控制快照下三档的 enabled invariant ID 集合完全一致，仅补充 observation 数变化（AC-02）", () => {
    const recipe = tieredRecipe();
    const enabled = recipe.styleInvariants.map((item) => item.id);
    const tiers = (["concise", "standard", "professional"] as const).map((detailLevel) =>
      invariantSegmentIds(composePromptDocument(recipe, documentControls(recipe, { detailLevel }))),
    );

    expect(new Set(tiers[0])).toEqual(new Set(enabled));
    expect(new Set(tiers[1])).toEqual(new Set(enabled));
    expect(new Set(tiers[2])).toEqual(new Set(enabled));

    // soft invariant 不因切换到 concise 被删除
    const softInvariantId = recipe.styleInvariants.find((item) => item.kind === "soft")?.id;
    expect(softInvariantId).toBeDefined();
    expect(tiers[0]).toContain(softInvariantId);

    const observationCounts = (["concise", "standard", "professional"] as const).map((detailLevel) =>
      observationSegments(composePromptDocument(recipe, documentControls(recipe, { detailLevel }))).length,
    );
    expect(observationCounts[0]).toBe(0);
    expect(observationCounts[1]).toBe(1);
    expect(observationCounts[2]).toBe(4);
  });

  it("concise 不添加未覆盖 observation", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { detailLevel: "concise" }));

    expect(observationSegments(doc)).toEqual([]);
  });

  it("standard 每维至多加入一条置信度 ≥0.7 的最高未覆盖 observation", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { detailLevel: "standard" }));

    // color_2（0.85）是唯一 ≥0.7 的未覆盖项；camera 两条 0.6 不进入；已覆盖的 color_1 不重复
    expect(observationSegments(doc).map((segment) => segment.sourceId)).toEqual(["color_2"]);
  });

  it("professional 加入全部 ≥0.5 的未覆盖 observation，同分按 Recipe 原序", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { detailLevel: "professional" }));
    const ordered = observationSegments(doc).slice().sort((left, right) => left.startIndex - right.startIndex);
    const ids = ordered.map((segment) => segment.sourceId);

    expect(new Set(ids)).toEqual(new Set(["camera_1", "camera_2", "color_2", "color_3"]));
    // camera 两条置信度并列（0.6），按 Recipe 原序（camera_1 在前）输出
    expect(ids.indexOf("camera_1")).toBeLessThan(ids.indexOf("camera_2"));
    // <0.5 与已被启用 invariant 覆盖的 observation 不进入
    expect(ids).not.toContain("atmosphere_1");
    expect(ids).not.toContain("color_1");
    expect(ids).not.toContain("rendering_1");
  });

  it("每个文本片段记录合法字符范围并可定位来源值", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { detailLevel: "professional" }));
    const invariantValueById = new Map(recipe.styleInvariants.map((item) => [item.id, item.value]));

    expect(doc.segments.length).toBeGreaterThan(0);
    for (const segment of doc.segments) {
      expect(segment.startIndex).toBeGreaterThanOrEqual(0);
      expect(segment.endIndex).toBeGreaterThan(segment.startIndex);
      expect(segment.endIndex).toBeLessThanOrEqual(doc.text.length);
      expect(doc.text.slice(segment.startIndex, segment.endIndex).length).toBeGreaterThan(0);
      if (segment.dimension !== undefined) {
        expect(STYLE_DIMENSIONS).toContain(segment.dimension);
      }
      if (segment.sourceKind === "invariant") {
        const value = invariantValueById.get(segment.sourceId);
        expect(value).toBeDefined();
        expect(doc.text.slice(segment.startIndex, segment.endIndex)).toContain(value);
      }
    }
  });

  it("同一 Recipe 与控制快照重复编译结果完全一致", () => {
    const recipe = tieredRecipe();
    const controls = documentControls(recipe);

    expect(composePromptDocument(recipe, controls)).toEqual(composePromptDocument(recipe, controls));
  });

  it("片段维度按既有维度顺序稳定输出", () => {
    const recipe = tieredRecipe();
    const doc = composePromptDocument(recipe, documentControls(recipe, { detailLevel: "professional" }));
    const order = ["composition", "camera", "color", "lighting", "visualMedium", "formLanguage", "materialTexture", "atmosphere", "rendering"];
    const seen: string[] = [];
    for (const segment of doc.segments) {
      if (segment.dimension !== undefined && !seen.includes(segment.dimension)) {
        seen.push(segment.dimension);
      }
    }
    const ranks = seen.map((dimension) => order.indexOf(dimension));

    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  it("未启用的 invariant 不进入任何档，零启用不伪造规则", () => {
    const recipe = tieredRecipe();
    const enabled = recipe.styleInvariants
      .filter((item) => item.dimension !== "rendering")
      .map((item) => item.id);

    for (const detailLevel of ["concise", "standard", "professional"] as const) {
      const doc = composePromptDocument(recipe, documentControls(recipe, { detailLevel, enabledInvariantIds: enabled }));
      expect(invariantSegmentIds(doc).sort()).toEqual([...enabled].sort());
    }

    const empty = composePromptDocument(recipe, documentControls(recipe, { enabledInvariantIds: [] }));
    expect(invariantSegmentIds(empty)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// plan-01 §8.1 性能验收：10 个 invariants、20 个变量下单次重编译与摘要派生 ≤50ms。
// 使用「预热 + 多采样取中位数」的宽松隔离基线，避免墙钟抖动 flake。
// ---------------------------------------------------------------------------

function performanceRecipe(): VisualRecipeV2Success {
  const dimensions: StyleDimension[] = [
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
  const styleProfile = {} as Record<StyleDimension, StyleObservation[]>;
  const styleInvariants: StyleInvariant[] = [];

  dimensions.forEach((dimension, index) => {
    const observationId = `${dimension}_obs_1`;
    styleProfile[dimension] = [
      { id: observationId, value: `${dimension} baseline observation`, evidence: ["evidence"], confidence: 0.8 },
    ];
    styleInvariants.push({
      id: `${dimension}_invariant_1`,
      kind: index % 2 === 0 ? "hard" : "soft",
      dimension,
      value: `${dimension} invariant value ${index}`,
      evidence: ["evidence"],
      confidence: 0.9,
      sourceObservationIds: [observationId],
    });
  });
  // 第 10 条 invariant + 一条 0.6 未覆盖 observation，使 professional 档走全量补充路径
  styleProfile.composition.push({
    id: "composition_obs_2",
    value: "secondary composition observation",
    evidence: ["evidence"],
    confidence: 0.6,
  });
  styleInvariants.push({
    id: "composition_invariant_2",
    kind: "soft",
    dimension: "composition",
    value: "secondary composition invariant",
    evidence: ["evidence"],
    confidence: 0.7,
    sourceObservationIds: ["composition_obs_2"],
  });

  const contentVariables: ContentVariable[] = Array.from({ length: 20 }, (_, index) => ({
    name: `variable_${index + 1}`,
    label: `Variable ${index + 1}`,
    defaultValue: `default value ${index + 1}`,
    sourceField: "subject",
  }));

  return {
    schemaVersion: 2,
    extractionStatus: "ready",
    extractionReasons: [],
    contentDescription: {
      summary: "A performance fixture",
      subject: "performance fixture",
      subjectAttributes: [],
      supportingElements: [],
    },
    styleProfile,
    styleInvariants,
    contentVariables,
    optionalModifiers: [
      { name: "mood", label: "Mood", defaultValue: "calm", dimension: "atmosphere", enabledByDefault: false },
    ],
    negativeConstraints: ["watermark"],
    styleFingerprint: {
      tokens: ["fixture"],
      scores: {
        realism: 0.5,
        abstraction: 0.5,
        contrast: 0.5,
        saturation: 0.5,
        softness: 0.5,
        detailDensity: 0.5,
        symmetry: 0.5,
        depth: 0.5,
        atmosphericIntensity: 0.5,
      },
    },
    promptOutputs: {
      reconstructionPrompt: "",
      conciseTemplate: "",
      standardTemplate: "",
      professionalTemplate: "",
    },
  };
}

describe("composePromptDocument 性能（plan-01 §8.1）", () => {
  it("10 个 invariants、20 个变量下单次重编译与摘要派生 ≤50ms", () => {
    const recipe = performanceRecipe();
    expect(recipe.styleInvariants).toHaveLength(10);
    expect(recipe.contentVariables).toHaveLength(20);

    const controls: PromptControlSnapshot = {
      schemaVersion: 1,
      trigger: "manual",
      intent: "same_style",
      detailLevel: "professional",
      editorMode: "variables",
      customPromptDirty: false,
      enabledInvariantIds: recipe.styleInvariants.map((item) => item.id),
      variableValues: Object.fromEntries(
        recipe.contentVariables
          .filter((_, index) => index % 2 === 1)
          .map((variable) => [variable.name, `changed ${variable.name}`]),
      ),
      enabledModifierNames: ["mood"],
      modifierValues: { mood: "calm morning" },
      adjustments: [],
    };

    // 预热后采样，取中位数作为宽松隔离基线
    for (let warmup = 0; warmup < 10; warmup += 1) {
      composePromptDocument(recipe, controls);
      deriveKeepChangeSummary(recipe, controls);
    }

    const samples: number[] = [];
    for (let run = 0; run < 50; run += 1) {
      const start = performance.now();
      composePromptDocument(recipe, controls);
      deriveKeepChangeSummary(recipe, controls);
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    const median = samples[Math.floor(samples.length / 2)];

    expect(median).toBeLessThanOrEqual(50);
  });
});
