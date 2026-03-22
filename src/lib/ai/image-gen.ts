import { createFalClient } from "@fal-ai/client";

const TIMEOUT_MS = 120_000;
const FAL_MODEL_ID = "fal-ai/flux/dev";

/** 生图模型调用失败 */
export class ImageGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageGenError";
  }
}

interface FalImage {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

interface FalImageOutput {
  images: FalImage[];
}

/**
 * 调用 fal.ai FLUX.2 模型生成图片
 * @returns 临时图片 URL 和尺寸（需转存到 R2）
 */
export async function generateImage(params: {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  quality: string;
}): Promise<{ imageUrl: string; width: number; height: number }> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new ImageGenError("FAL_KEY is not configured");
  }

  const client = createFalClient({
    credentials: apiKey,
  });

  try {
    const result = await Promise.race([
      client.subscribe(FAL_MODEL_ID, {
        input: {
          prompt: params.prompt,
          image_size: params.aspectRatio === "16:9"
            ? "landscape_16_9"
            : params.aspectRatio === "4:3"
              ? "landscape_4_3"
              : "square",
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
