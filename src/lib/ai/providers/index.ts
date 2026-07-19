import { GeminiVisionProvider } from './gemini-vision';
import { GeminiStructurerProvider } from './gemini-structurer';
import { FalImageGenProvider } from './fal-image-gen';
import { ReplicateVisionProvider } from './replicate-vision';
import { ReplicateImageGenProvider } from './replicate-image-gen';
import { ReplicateStructurerProvider } from './replicate-structurer';
import type { VisionProvider, StructurerProvider, ImageGenProvider } from './types';

/**
 * 获取视觉分析 Provider 实例
 * 根据 VISION_PROVIDER 环境Variables选择 Provider
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
 * 获取结构化整理 Provider 实例
 * 默认跟随 VISION_PROVIDER，确保分析链路内的 LLM 调用与启用的 Provider 一致
 */
export function getStructurerProvider(): StructurerProvider {
  const provider = process.env.STRUCTURER_PROVIDER || process.env.VISION_PROVIDER || 'replicate';
  switch (provider) {
    case 'gemini':
      return new GeminiStructurerProvider();
    case 'replicate':
      return new ReplicateStructurerProvider();
    default:
      throw new Error(`Unknown structurer provider: ${provider}`);
  }
}

/**
 * 获取图像生成 Provider 实例
 * 根据 IMAGE_GEN_PROVIDER 环境Variables选择 Provider
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
export {
  GeminiVisionProvider,
  GeminiStructurerProvider,
  FalImageGenProvider,
  ReplicateVisionProvider,
  ReplicateStructurerProvider,
  ReplicateImageGenProvider,
};
export type { VisionProvider, StructurerProvider, StructurerContext, ImageGenProvider } from './types';
