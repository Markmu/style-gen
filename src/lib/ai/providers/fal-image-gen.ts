import { createFalClient } from "@fal-ai/client";
import { ImageGenError } from "./types";
import type { ImageGenProvider } from "./types";

export { ImageGenError };

const TIMEOUT_MS = 120_000;
/** models.json 中 flux-2-dev 的 fal 绑定；直接构造未传 modelId 时的回退值 */
const DEFAULT_MODEL = "fal-ai/flux-2";

interface FalImage {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

interface FalImageOutput {
  images: FalImage[];
}

type FalImageSize = "landscape_16_9" | "landscape_4_3" | "square";

function toFalImageSize(aspectRatio: string): FalImageSize {
  if (aspectRatio === "16:9") return "landscape_16_9";
  if (aspectRatio === "4:3") return "landscape_4_3";
  return "square";
}

export class FalImageGenProvider implements ImageGenProvider {
  readonly name = "fal" as const;
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
  }): Promise<{ mode: "sync"; imageUrl: string; width: number; height: number }> {
    const apiKey = process.env.FAL_KEY;
    if (!apiKey) {
      throw new ImageGenError("FAL_KEY is not configured");
    }

    const client = createFalClient({
      credentials: apiKey,
    });

    try {
      const result = await Promise.race([
        client.subscribe(this.model, {
          input: {
            prompt: params.prompt,
            image_size: toFalImageSize(params.aspectRatio),
            num_images: 1,
          },
          logs: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ImageGenError("Image generation timed out after 120s")),
            TIMEOUT_MS
          )
        ),
      ]);

      const output = result.data as FalImageOutput;
      if (!output?.images || output.images.length === 0) {
        throw new ImageGenError("Model returned no images");
      }

      const image = output.images[0];
      return {
        mode: "sync",
        imageUrl: image.url,
        width: image.width,
        height: image.height,
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
