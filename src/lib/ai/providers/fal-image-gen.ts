import { generateImage } from '../image-gen';
import type { ImageGenProvider } from './types';

/**
 * fal.ai ImageGen Provider 实现
 * 包装现有的 generateImage 函数，返回同步结果
 */
export class FalImageGenProvider implements ImageGenProvider {
  readonly name = 'fal' as const;

  async generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<{ mode: 'sync'; imageUrl: string; width: number; height: number }> {
    // fal.ai 是同步调用，忽略 webhookUrl 参数和 quality 参数（现有实现不支持）
    const result = await generateImage({
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      aspectRatio: params.aspectRatio,
      quality: params.quality,
    });
    return { mode: 'sync', imageUrl: result.imageUrl, width: result.width, height: result.height };
  }
}
