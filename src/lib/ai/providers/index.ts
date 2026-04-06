import { GeminiVisionProvider } from './gemini-vision';
import { FalImageGenProvider } from './fal-image-gen';
import { ReplicateVisionProvider } from './replicate-vision';
import { ReplicateImageGenProvider } from './replicate-image-gen';
import type { VisionProvider, ImageGenProvider } from './types';

/**
 * 获取视觉分析 Provider 实例
 * 根据 VISION_PROVIDER 环境变量选择 Provider
 */
export function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER || 'replicate';
  switch (provider) {
    case 'gemini':
      return new GeminiVisionProvider();
    case 'replicate':
      return new ReplicateVisionProvider();
    default:
      throw new Error(`Unknown vision provider: ${provider}`);
  }
}

/**
 * 获取图像生成 Provider 实例
 * 根据 IMAGE_GEN_PROVIDER 环境变量选择 Provider
 */
export function getImageGenProvider(): ImageGenProvider {
  const provider = process.env.IMAGE_GEN_PROVIDER || 'replicate';
  switch (provider) {
    case 'fal':
      return new FalImageGenProvider();
    case 'replicate':
      return new ReplicateImageGenProvider();
    default:
      throw new Error(`Unknown image gen provider: ${provider}`);
  }
}

// 导出类型和实现供外部使用
export { GeminiVisionProvider, FalImageGenProvider, ReplicateVisionProvider, ReplicateImageGenProvider };
export type { VisionProvider, ImageGenProvider } from './types';
