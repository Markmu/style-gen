import { GoogleGenAI } from "@google/genai";
import type { VisualRecipe } from "@/types/models";
import { STRUCTURER_SYSTEM_PROMPT } from "./prompts";

const GEMINI_MODEL = "gemini-2.0-flash";
const TIMEOUT_MS = 30_000;

/** LLM 结构化整理阶段失败 */
export class StructurerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructurerError";
  }
}

/** structureAnalysis 的返回类型 */
export interface StructuredResult {
  recipe: VisualRecipe;
  promptText: string;
  negativePromptText: string;
}

/**
 * 调用 Gemini LLM 将视觉分析文本整理为结构化 VisualRecipe + Prompt
 * @param rawAnalysis 视觉理解阶段的原始分析文本
 * @returns 结构化结果：recipe、promptText、negativePromptText
 */
export async function structureAnalysis(
  rawAnalysis: string
): Promise<StructuredResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new StructurerError("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: STRUCTURER_SYSTEM_PROMPT },
              {
                text: `Here is the visual analysis to structure:\n\n${rawAnalysis}`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new StructurerError(
                "Structure analysis timed out after 30s"
              )
            ),
          TIMEOUT_MS
        )
      ),
    ]);

    const text = response.text;
    if (!text) {
      throw new StructurerError("Structurer model returned empty response");
    }

    const parsed: unknown = JSON.parse(text);
    const result = validateStructuredResult(parsed);
    return result;
  } catch (error) {
    if (error instanceof StructurerError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Unknown structurer error";
    throw new StructurerError(`Structure analysis failed: ${message}`);
  }
}

/** 验证并断言 parsed 数据符合 StructuredResult 结构 */
function validateStructuredResult(parsed: unknown): StructuredResult {
  if (!parsed || typeof parsed !== "object") {
    throw new StructurerError("Invalid JSON structure: not an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.recipe || typeof obj.recipe !== "object") {
    throw new StructurerError("Invalid JSON structure: missing recipe object");
  }

  if (typeof obj.promptText !== "string" || !obj.promptText) {
    throw new StructurerError(
      "Invalid JSON structure: missing or empty promptText"
    );
  }

  if (typeof obj.negativePromptText !== "string") {
    throw new StructurerError(
      "Invalid JSON structure: missing negativePromptText"
    );
  }

  const recipe = obj.recipe as Record<string, unknown>;
  const requiredStrings = [
    "imageSummary",
    "subject",
    "scene",
    "composition",
    "cameraLanguage",
    "lighting",
    "color",
    "texture",
    "mood",
  ] as const;

  for (const field of requiredStrings) {
    if (typeof recipe[field] !== "string" || !recipe[field]) {
      throw new StructurerError(
        `Invalid recipe: missing or empty field "${field}"`
      );
    }
  }

  const requiredArrays = [
    "styleTags",
    "visualKeywords",
    "mustKeep",
    "replaceable",
  ] as const;

  for (const field of requiredArrays) {
    if (!Array.isArray(recipe[field]) || recipe[field].length === 0) {
      throw new StructurerError(
        `Invalid recipe: "${field}" must be a non-empty array`
      );
    }
  }

  return {
    recipe: recipe as unknown as VisualRecipe,
    promptText: obj.promptText as string,
    negativePromptText: obj.negativePromptText as string,
  };
}
