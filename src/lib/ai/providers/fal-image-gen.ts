import { createFalClient } from "@fal-ai/client";
import { ImageGenError } from "./types";
import type { ImageGenProvider } from "./types";

export { ImageGenError };

const TIMEOUT_MS = 120_000;
const FAL_MODEL_ID = "fal-ai/flux/dev";

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
        client.subscribe(FAL_MODEL_ID, {
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
