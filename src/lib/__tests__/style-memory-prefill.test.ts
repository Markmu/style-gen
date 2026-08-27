import {
  deriveStyleMemoryPrefill,
  type StyleMemoryPrefillInput,
} from "@/lib/style-memory-prefill";
import type {
  OptionalModifier,
  StoredVisualRecipe,
  StyleInvariant,
  VisualRecipe,
  VisualRecipeV2Success,
} from "@/types/models";

/**
 * plan-06 Task 2: deriveStyleMemoryPrefill 三分支单测（V2 全字段映射 / V1 映射 /
 * fallback 全缺失标记 + 空数组组进 missing），口径来自架构 §6.3 预填算法。
 */

function v2Invariant(
  id: string,
  kind: StyleInvariant["kind"],
  value: string,
): StyleInvariant {
  return {
    id,
    kind,
    value,
    evidence: [`evidence for ${id}`],
    confidence: 0.9,
    dimension: "color",
    sourceObservationIds: [id],
  };
}

function v2Modifier(
  name: OptionalModifier["name"],
  defaultValue: string,
): OptionalModifier {
  return {
    name,
    label: name === "mood" ? "Mood" : "Primary color",
    defaultValue,
    dimension: name === "mood" ? "atmosphere" : "color",
    enabledByDefault: false,
  };
}

/** 与 e2e fixture（analysis-v2-completed.json.recipe）同构，invariant 顺序刻意打乱 */
function v2SuccessRecipe(): VisualRecipeV2Success {
  return {
    schemaVersion: 2,
    extractionStatus: "ready",
    extractionReasons: [],
    contentDescription: {
      summary: "An amber bottle on a studio table",
      subjectAttributes: ["amber glass"],
      supportingElements: ["linen cloth"],
    },
    styleProfile: {
      visualMedium: [],
      composition: [],
      camera: [],
      color: [],
      lighting: [],
      formLanguage: [],
      materialTexture: [],
      atmosphere: [],
      rendering: [],
    },
    // soft 夹在 hard 之间：断言 hard 优先排序时 soft 必须重排到全部 hard 之后
    styleInvariants: [
      v2Invariant("inv-1", "hard", "warm amber and sand palette"),
      v2Invariant("inv-2", "soft", "calm restrained mood"),
      v2Invariant("inv-3", "hard", "soft directional window light"),
      v2Invariant("inv-4", "hard", "editorial product photography"),
      v2Invariant("inv-5", "hard", "matte linen against polished glass"),
    ],
    contentVariables: [],
    optionalModifiers: [
      v2Modifier("mood", "calm"),
      v2Modifier("primary_color", ""),
      v2Modifier("primary_color", "warm amber"),
    ],
    negativeConstraints: ["watermark", "distorted glass"],
    styleFingerprint: {
      tokens: ["editorial", "warm neutral", "soft window light"],
      scores: {
        realism: 0.5,
        abstraction: null,
        contrast: 0.4,
        saturation: 0.6,
        softness: 0.7,
        detailDensity: 0.5,
        symmetry: null,
        depth: 0.5,
        atmosphericIntensity: 0.4,
      },
    },
    promptOutputs: {
      reconstructionPrompt: "reconstruction",
      conciseTemplate: "concise",
      standardTemplate: "standard",
      professionalTemplate: "professional",
    },
  };
}

const legacyRecipe: VisualRecipe = {
  imageSummary: "A chrome orchid in a white studio",
  subject: "chrome orchid",
  scene: "white studio",
  composition: "asymmetric product framing",
  cameraLanguage: "macro lens",
  lighting: "large softbox reflection",
  color: "white, chrome, and pale blue",
  texture: "mirror metal petals",
  styleTags: ["product", "macro", "precision"],
  mood: "clean and premium",
  visualKeywords: ["chrome orchid", "softbox", "white studio"],
  mustKeep: ["chrome material", "clean studio"],
  replaceable: ["flower species"],
};

const fallbackRecipe: StoredVisualRecipe = {
  schemaVersion: 2,
  extractionStatus: "fallback",
  extractionReasons: ["structure_failed"],
  promptOutputs: null,
};

describe("deriveStyleMemoryPrefill — V2 成功配方全字段映射", () => {
  it("四组均来自配方：不变量值（hard 优先）/negativeConstraints/modifier 默认值/指纹 tokens", () => {
    const result = deriveStyleMemoryPrefill({
      recipe: v2SuccessRecipe(),
      recipeSource: "snapshot",
      // V2 分支不消费负面提示文本：与配方不同的值不得进入排除约束
      negativePromptText: "heavy grain overlay, embedded text",
    } satisfies StyleMemoryPrefillInput);

    // 4 条 hard 全部预填，且 soft（calm restrained mood）重排到全部 hard 之后
    expect(result.retainedRules).toEqual([
      "warm amber and sand palette",
      "soft directional window light",
      "editorial product photography",
      "matte linen against polished glass",
      "calm restrained mood",
    ]);
    const softIndex = result.retainedRules.indexOf("calm restrained mood");
    for (const hard of [
      "warm amber and sand palette",
      "soft directional window light",
      "editorial product photography",
      "matte linen against polished glass",
    ]) {
      expect(softIndex).toBeGreaterThan(result.retainedRules.indexOf(hard));
    }

    // 排除约束来自配方而非负面提示文本
    expect(result.negativeConstraints).toEqual(["watermark", "distorted glass"]);
    // 增强方向 ← optionalModifiers.defaultValue（空值被过滤）
    expect(result.enhancementHints).toEqual(["calm", "warm amber"]);
    // 风格指纹 ← tokens
    expect(result.styleTokens).toEqual(["editorial", "warm neutral", "soft window light"]);
    expect(result.missing).toEqual([]);
  });

  it("空数组组进入 missing：空排除约束、无默认值 modifier、空 tokens 全部标记", () => {
    const recipe = v2SuccessRecipe();
    recipe.negativeConstraints = [];
    recipe.optionalModifiers = [v2Modifier("mood", "")];
    recipe.styleFingerprint = { ...recipe.styleFingerprint, tokens: [] };

    const result = deriveStyleMemoryPrefill({
      recipe,
      recipeSource: "snapshot",
    } satisfies StyleMemoryPrefillInput);

    expect(result.negativeConstraints).toEqual([]);
    expect(result.enhancementHints).toEqual([]);
    expect(result.styleTokens).toEqual([]);
    expect(result.missing).toEqual(["constraints", "tokens", "enhancements"]);
  });

  it("超过 POST 上限时收敛：规则 ≤12 条 × ≤200 字符，token ≤16 条 × ≤80 字符", () => {
    const recipe = v2SuccessRecipe();
    recipe.negativeConstraints = Array.from({ length: 15 }, (_, index) => `no-${index}`);
    recipe.styleInvariants = Array.from({ length: 14 }, (_, index) =>
      v2Invariant(`inv-many-${index}`, "hard", "x".repeat(260)),
    );

    const result = deriveStyleMemoryPrefill({
      recipe,
      recipeSource: "snapshot",
    } satisfies StyleMemoryPrefillInput);

    expect(result.retainedRules).toHaveLength(12);
    expect(result.retainedRules[0]).toHaveLength(200);
    expect(result.negativeConstraints).toHaveLength(12);
  });
});

describe("deriveStyleMemoryPrefill — V1 旧配方映射", () => {
  it("mustKeep/styleTags/visualKeywords 映射，负面提示文本整体作为一条排除约束", () => {
    const result = deriveStyleMemoryPrefill({
      recipe: legacyRecipe,
      recipeSource: "snapshot",
      negativePromptText: "  heavy grain overlay, embedded text  ",
    } satisfies StyleMemoryPrefillInput);

    expect(result.retainedRules).toEqual(["chrome material", "clean studio"]);
    // trim 非空整体一条（不按逗号拆分）
    expect(result.negativeConstraints).toEqual([
      "heavy grain overlay, embedded text",
    ]);
    expect(result.styleTokens).toEqual(["product", "macro", "precision"]);
    expect(result.enhancementHints).toEqual([
      "chrome orchid",
      "softbox",
      "white studio",
    ]);
    expect(result.missing).toEqual([]);
  });

  it("负面提示文本为空时排除约束缺失进入 missing", () => {
    const result = deriveStyleMemoryPrefill({
      recipe: legacyRecipe,
      recipeSource: "snapshot",
      negativePromptText: "",
    } satisfies StyleMemoryPrefillInput);

    expect(result.negativeConstraints).toEqual([]);
    expect(result.missing).toEqual(["constraints"]);
  });
});

describe("deriveStyleMemoryPrefill — fallback / null / missing 全缺失标记", () => {
  it("V2 fallback 配方（无规则结构）：四组全空 + missing 全标记，不推测补齐", () => {
    const result = deriveStyleMemoryPrefill({
      recipe: fallbackRecipe,
      recipeSource: "snapshot",
      negativePromptText: "watermark",
    } satisfies StyleMemoryPrefillInput);

    expect(result).toEqual({
      retainedRules: [],
      negativeConstraints: [],
      styleTokens: [],
      enhancementHints: [],
      missing: ["rules", "constraints", "tokens", "enhancements"],
    });
  });

  it("recipe=null：同样四组全空 + missing 全标记", () => {
    const result = deriveStyleMemoryPrefill({
      recipe: null,
      recipeSource: "fallback",
    } satisfies StyleMemoryPrefillInput);

    expect(result.retainedRules).toEqual([]);
    expect(result.missing).toEqual([
      "rules",
      "constraints",
      "tokens",
      "enhancements",
    ]);
  });

  it("recipeSource=missing：即使误传配方对象也按缺失处理（防御）", () => {
    const result = deriveStyleMemoryPrefill({
      recipe: v2SuccessRecipe(),
      recipeSource: "missing",
    } satisfies StyleMemoryPrefillInput);

    expect(result.retainedRules).toEqual([]);
    expect(result.styleTokens).toEqual([]);
    expect(result.missing).toHaveLength(4);
  });
});
