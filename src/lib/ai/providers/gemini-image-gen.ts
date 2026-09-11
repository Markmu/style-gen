import { validateImageBytes } from '@/lib/generation/output';
import { GoogleGenAI } from "@google/genai";
import { ImageGenError } from "./types";
import type { ImageGenProvider } from "./types";

/** Nano Banana 2 Lite（官方命名），Gemini API 图像生成模型 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite-image";
const TIMEOUT_MS = 120_000;


export class GeminiImageGenProvider implements ImageGenProvider {
  readonly name = "gemini" as const;
  private readonly model: string;

  /** modelId 缺省时回退本地常量；应用路径一律由 models.json 解析后传入 */
  constructor(modelId?: string) {
    this.model = modelId ?? DEFAULT_MODEL;
  }

  async generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<{
    mode: "sync";
    imageBase64: string;
    mimeType: string;
    width: number;
    height: number;
  }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ImageGenError("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 }, timeout: TIMEOUT_MS } });

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: this.model,
          contents: [{ role: "user", parts: [{ text: params.prompt }] }],
          config: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: params.aspectRatio },
          },
        }),
        new Promise<never>((_, reject) =>
          timeout=setTimeout(
            () => reject(new ImageGenError("Image generation timed out after 120s")),
            TIMEOUT_MS
          )
        ),
      ]);

      // 模型可能穿插返回思考文本 parts，只取携带图片数据的那一个
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const inlineData = parts.find((part) => part.inlineData?.data)?.inlineData;
      if (!inlineData?.data) {
        throw new ImageGenError("Model returned no images");
      }

      const imageBuffer = Buffer.from(inlineData.data, "base64");
      const dimensions=await validateImageBytes(imageBuffer);

      return {
        mode: "sync",
        imageBase64: inlineData.data,
        mimeType: dimensions.mimeType,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch (error) {
      if (error instanceof ImageGenError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "Unknown image generation error";
      throw new ImageGenError(`Image generation failed: ${message}`);
    } finally { clearTimeout(timeout); }
  }
}
