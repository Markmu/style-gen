import { GoogleGenAI } from "@google/genai";
import { VISION_SYSTEM_PROMPT } from "./prompts";

const GEMINI_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 60_000;

/** 视觉理解阶段失败 */
export class VisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionError";
  }
}

/**
 * 调用 Gemini 视觉模型分析图片，返回原始分析文本
 * @param imageUrl 图片公共 URL
 * @returns 原始视觉分析文本
 */
export async function analyzeImage(imageUrl: string, mimeType: string = "image/jpeg"): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new VisionError("GEMINI_API_KEY is not configured");
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
              { text: VISION_SYSTEM_PROMPT },
              {
                fileData: {
                  fileUri: imageUrl,
                  mimeType,
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

    return text;
  } catch (error) {
    if (error instanceof VisionError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Unknown vision error";
    throw new VisionError(`Vision analysis failed: ${message}`);
  }
}
