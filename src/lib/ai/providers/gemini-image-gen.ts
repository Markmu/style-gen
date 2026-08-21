import { GoogleGenAI } from "@google/genai";
import { ImageGenError } from "./types";
import type { ImageGenProvider } from "./types";

/** Nano Banana 2 Lite（官方命名），Gemini API 图像生成模型 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite-image";
const TIMEOUT_MS = 120_000;
const FALLBACK_WIDTH = 1024;
const FALLBACK_HEIGHT = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 从 PNG 的 IHDR 块解析宽高；非 PNG 或数据不足返回 null */
function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  // 偏移 12-15 为块类型 "IHDR"，其后紧跟 width/height 各 4 字节大端
  if (buffer.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** 从 JPEG 的 SOF 块解析宽高（模型实际返回 JPEG）；解析失败返回 null */
function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    // 跳过标记前的 0xFF 填充字节
    while (buffer[offset + 1] === 0xff) offset += 1;
    const marker = buffer[offset + 1];
    // 无长度字段的独立标记
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    // SOF0~SOF15（剔除 DHT/JPG/DAC），帧头结构：精度 1 字节 + 高 2 字节 + 宽 2 字节
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

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

    const ai = new GoogleGenAI({ apiKey });

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
          setTimeout(
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
      const dimensions =
        readPngDimensions(imageBuffer) ??
        readJpegDimensions(imageBuffer) ??
        { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };

      return {
        mode: "sync",
        imageBase64: inlineData.data,
        mimeType: inlineData.mimeType || "image/png",
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
    }
  }
}
