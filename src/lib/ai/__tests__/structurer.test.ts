import { structureAnalysis, StructurerError } from "../structurer";

// Mock @google/genai
const mockGenerateContent = vi.fn();
const mockReplicateRun = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    }),
  };
});

vi.mock("replicate", () => {
  return {
    default: class MockReplicate {
      run = mockReplicateRun;
    },
  };
});

import { GoogleGenAI } from "@google/genai";
const MockedGoogleGenAI = vi.mocked(GoogleGenAI);

/** 完整有效的结构化结果 */
const VALID_RESULT = {
  recipe: {
    imageSummary: "A serene landscape",
    subject: "Mountain range",
    scene: "Alpine meadow",
    composition: "Rule of thirds",
    cameraLanguage: "Wide angle",
    lighting: "Golden hour",
    color: "Warm palette",
    texture: "Soft, natural",
    styleTags: ["landscape"],
    mood: "Peaceful",
    visualKeywords: ["mountain"],
    mustKeep: ["golden light"],
    replaceable: ["specific flowers"],
  },
  promptText: "A serene mountain landscape with golden light.",
  negativePromptText: "blurry, low quality",
  analysisTemplateContent: "Create {{subject}} with {{lighting}}.",
  analysisTemplateVariables: [
    {
      name: "subject",
      label: "Subject",
      defaultValue: "Mountain range",
      sourceField: "subject",
    },
    {
      name: "lighting",
      label: "Lighting",
      defaultValue: "Golden hour",
      sourceField: "lighting_color",
    },
  ],
  analysisTemplateStatus: "ready",
  analysisTemplateReason: null,
};

function mockValidResponse(overrides: Record<string, unknown> = {}) {
  const result = { ...VALID_RESULT, ...overrides };
  if (overrides.recipe) {
    result.recipe = { ...VALID_RESULT.recipe, ...(overrides.recipe as Record<string, unknown>) } as typeof VALID_RESULT.recipe;
  }
  mockGenerateContent.mockResolvedValue({
    text: JSON.stringify(result),
  });
  return result;
}

function mockInvalidRecipeResponse(recipeOverrides: Record<string, unknown>) {
  const result = {
    ...VALID_RESULT,
    recipe: { ...VALID_RESULT.recipe, ...recipeOverrides },
  };
  mockGenerateContent.mockResolvedValue({
    text: JSON.stringify(result),
  });
}

describe("structurer", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    MockedGoogleGenAI.mockImplementation(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      } as unknown as InstanceType<typeof GoogleGenAI>;
    });
    process.env = {
      ...ORIGINAL_ENV,
      VISION_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-api-key",
      REPLICATE_API_TOKEN: "test-replicate-token",
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.useRealTimers();
  });

  describe("structureAnalysis", () => {
    it("正常返回结构化结果", async () => {
      mockValidResponse();

      const result = await structureAnalysis("raw analysis text");

      expect(result).toEqual({
        ...VALID_RESULT,
        promptText: "Create Mountain range with Golden hour.",
      });
      expect(result.recipe.imageSummary).toBe("A serene landscape");
      expect(result.promptText).toBe("Create Mountain range with Golden hour.");
      expect(result.negativePromptText).toBe("blurry, low quality");
      expect(result.analysisTemplateStatus).toBe("ready");
      expect(result.analysisTemplateVariables).toHaveLength(2);
    });

    it("使用 JSON mode (responseMimeType: application/json)", async () => {
      mockValidResponse();

      await structureAnalysis("raw analysis text");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseMimeType: "application/json",
          }),
        })
      );
    });

    it("缺少 API Key 时抛出 StructurerError", async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        StructurerError
      );
      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "GEMINI_API_KEY is not configured"
      );
    });

    it("超时 30s后抛出 StructurerError", async () => {
      vi.useFakeTimers();

      mockGenerateContent.mockReturnValue(new Promise(() => {}));

      const promise = structureAnalysis("raw analysis");

      vi.advanceTimersByTime(30_000);

      await expect(promise).rejects.toThrow(StructurerError);
      await expect(
        (async () => {
          mockGenerateContent.mockReturnValue(new Promise(() => {}));
          const p = structureAnalysis("raw analysis");
          vi.advanceTimersByTime(30_000);
          return p;
        })()
      ).rejects.toThrow("Structure analysis timed out after 30s");
    });

    it("模型返回空响应时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({ text: "" });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        StructurerError
      );
      mockGenerateContent.mockResolvedValue({ text: "" });
      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "Structurer model returned empty response"
      );
    });

    it("JSON 解析失败时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "not valid json {{{",
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        StructurerError
      );
    });

    it("Markdown code fence 包裹的 JSON 也能成功解析", async () => {
      process.env.VISION_PROVIDER = "replicate";
      mockReplicateRun.mockResolvedValue([
        "```json\n",
        JSON.stringify(VALID_RESULT, null, 2),
        "\n```",
      ]);

      const result = await structureAnalysis("raw analysis text", {
        taskId: "task-1",
        source: "analysis_webhook",
      });

      expect(result).toEqual({
        ...VALID_RESULT,
        promptText: "Create Mountain range with Golden hour.",
      });
    });

    it("StructurerError 透传不被二次包装", async () => {
      const originalError = new StructurerError("Custom structurer error");
      mockGenerateContent.mockRejectedValue(originalError);

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        originalError
      );
    });

    it("VISION_PROVIDER=replicate 时通过 Replicate provider 调用", async () => {
      process.env.VISION_PROVIDER = "replicate";
      mockReplicateRun.mockResolvedValue([JSON.stringify(VALID_RESULT)]);

      const result = await structureAnalysis("raw analysis text", {
        taskId: "task-1",
        source: "analysis_webhook",
      });

      expect(result).toEqual({
        ...VALID_RESULT,
        promptText: "Create Mountain range with Golden hour.",
      });
      expect(mockReplicateRun).toHaveBeenCalledWith(
        "google/gemini-2.5-flash",
        expect.objectContaining({
          input: expect.objectContaining({
            system_instruction: expect.stringContaining(
              "Output ONLY valid JSON"
            ),
            prompt: expect.stringContaining("raw analysis text"),
            temperature: 0,
            thinking_budget: 0,
          }),
          wait: {
            mode: "block",
            timeout: 30,
          },
        })
      );
    });

    it("VISION_PROVIDER=replicate 但缺少 token 时抛出 StructurerError", async () => {
      process.env.VISION_PROVIDER = "replicate";
      delete process.env.REPLICATE_API_TOKEN;

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        StructurerError
      );
      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "REPLICATE_API_TOKEN environment variable is required for Replicate provider"
      );
    });
  });

  describe("validateStructuredResult", () => {
    it("缺少 recipe 时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          promptText: "prompt",
          negativePromptText: "negative",
        }),
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "missing recipe object"
      );
    });

    it("缺少 promptText 时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          recipe: VALID_RESULT.recipe,
          negativePromptText: "negative",
        }),
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "missing or empty promptText"
      );
    });

    it("promptText 为空字符串时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          recipe: VALID_RESULT.recipe,
          promptText: "",
          negativePromptText: "negative",
        }),
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "missing or empty promptText"
      );
    });

    it("缺少 negativePromptText 时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          recipe: VALID_RESULT.recipe,
          promptText: "prompt",
        }),
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "missing negativePromptText"
      );
    });

    it("recipe 缺少必需字符串字段 (imageSummary) 时抛出 StructurerError", async () => {
      const badRecipe = { ...VALID_RESULT.recipe };
      delete (badRecipe as Record<string, unknown>).imageSummary;
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          recipe: badRecipe,
          promptText: "prompt",
          negativePromptText: "negative",
        }),
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        'missing or empty field "imageSummary"'
      );
    });

    it('recipe 字符串字段为空 (subject: "") 时抛出 StructurerError', async () => {
      mockInvalidRecipeResponse({ subject: "" });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        'missing or empty field "subject"'
      );
    });

    it("recipe 缺少数组字段 (styleTags) 时抛出 StructurerError", async () => {
      const badRecipe = { ...VALID_RESULT.recipe };
      delete (badRecipe as Record<string, unknown>).styleTags;
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({
          recipe: badRecipe,
          promptText: "prompt",
          negativePromptText: "negative",
        }),
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        '"styleTags" must be a non-empty array'
      );
    });

    it("recipe 数组为空 (visualKeywords: []) 时抛出 StructurerError", async () => {
      mockInvalidRecipeResponse({ visualKeywords: [] });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        '"visualKeywords" must be a non-empty array'
      );
    });

    it("完整有效数据通过验证", async () => {
      mockValidResponse();

      const result = await structureAnalysis("raw analysis");

      expect(result.recipe).toEqual(VALID_RESULT.recipe);
      expect(result.promptText).toBe("Create Mountain range with Golden hour.");
      expect(result.negativePromptText).toBe(VALID_RESULT.negativePromptText);
      expect(result.analysisTemplateContent).toBe(VALID_RESULT.analysisTemplateContent);
      expect(result.analysisTemplateStatus).toBe("ready");
    });

    it("缺少自动模板字段时降级为 fallback 但保留普通 prompt", async () => {
      const legacyResult = {
        recipe: VALID_RESULT.recipe,
        promptText: "Legacy prompt text",
        negativePromptText: "negative",
      };
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(legacyResult),
      });

      const result = await structureAnalysis("raw analysis");

      expect(result.promptText).toBe("Legacy prompt text");
      expect(result.analysisTemplateContent).toBeNull();
      expect(result.analysisTemplateVariables).toEqual([]);
      expect(result.analysisTemplateStatus).toBe("fallback");
      expect(result.analysisTemplateReason).toContain("missing");
    });

    it("过滤正文外Variables并按模板正文首次出现顺序渲染默认值", async () => {
      mockValidResponse({
        promptText: "Provider prompt",
        analysisTemplateContent: "{{lighting}} around {{subject}}.",
        analysisTemplateVariables: [
          { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" },
          { name: "extra", defaultValue: "ignored", label: "Extra", sourceField: "mood" },
          { name: "lighting", defaultValue: "soft daylight", label: "Lighting", sourceField: "lighting_color" },
        ],
        analysisTemplateStatus: "partial",
      });

      const result = await structureAnalysis("raw analysis");

      expect(result.analysisTemplateStatus).toBe("partial");
      expect(result.analysisTemplateVariables.map((item) => item.name)).toEqual([
        "lighting",
        "subject",
      ]);
      expect(result.promptText).toBe("soft daylight around glass chair.");
    });

    it("模板正文过长时 fallback 且不透传正文和Variables", async () => {
      mockValidResponse({
        analysisTemplateContent: `{{subject}} ${"x".repeat(6001)}`,
        analysisTemplateVariables: [
          { name: "subject", defaultValue: "mountain", label: "Subject", sourceField: "subject" },
        ],
      });

      const result = await structureAnalysis("raw analysis");

      expect(result.analysisTemplateStatus).toBe("fallback");
      expect(result.analysisTemplateContent).toBeNull();
      expect(result.analysisTemplateVariables).toEqual([]);
      expect(result.promptText).toBe(VALID_RESULT.promptText);
    });

    it("parsed 为 null 时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "null",
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "not an object"
      );
    });

    it("parsed 为非对象 (字符串) 时抛出 StructurerError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: '"just a string"',
      });

      await expect(structureAnalysis("raw analysis")).rejects.toThrow(
        "not an object"
      );
    });
  });
});
