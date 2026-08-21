import { GoogleGenAI } from "@google/genai";
import { VISION_SYSTEM_PROMPT } from "../prompts";
import type { VisionProvider } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 60_000;

/** Vision Understanding阶段失败 */
export class VisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionError";
  }
}

export class GeminiVisionProvider implements VisionProvider {
  readonly name = "gemini" as const;
  private readonly model: string;

  /** modelId 缺省时回退本地常量；应用路径一律由 models.json 解析后传入 */
  constructor(modelId?: string) {
    this.model = modelId ?? DEFAULT_MODEL;
  }

  async analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;
  }): Promise<{ mode: "sync"; result: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new VisionError("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: this.model,
          contents: [
            {
              role: "user",
              parts: [
                { text: VISION_SYSTEM_PROMPT },
                {
                  fileData: {
                    fileUri: params.imageUrl,
                    mimeType: params.mimeType,
                  },
                },
                {
                  text: "Please analyze this reference image in detail following the instructions above.",
                },
              ],
            },
          ],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new VisionError("Vision analysis timed out after 60s")),
            TIMEOUT_MS
          )
        ),
      ]);

      const text = response.text;
      if (!text) {
        throw new VisionError("Vision model returned empty response");
      }

      return { mode: "sync", result: text };
    } catch (error) {
      if (error instanceof VisionError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown vision error";
      throw new VisionError(`Vision analysis failed: ${message}`);
    }
  }
}
