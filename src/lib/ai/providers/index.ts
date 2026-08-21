import { GeminiVisionProvider } from './gemini-vision';
import { GeminiStructurerProvider } from './gemini-structurer';
import { GeminiImageGenProvider } from './gemini-image-gen';
import { FalImageGenProvider } from './fal-image-gen';
import { ReplicateVisionProvider } from './replicate-vision';
import { ReplicateImageGenProvider } from './replicate-image-gen';
import { ReplicateStructurerProvider } from './replicate-structurer';
import type { VisionProvider, StructurerProvider, ImageGenProvider } from './types';
import {
  resolveImageGenModel,
  resolveStructurerModel,
  resolveVisionModel,
} from '../model-config';
import type {
  ResolvedModelBinding,
} from '../model-config';
import type {
  ImageGenProviderName,
  StructurerProviderName,
  VisionProviderName,
} from '@/types/models';

/**
 * 获取视觉分析 Provider 实例
 * 未传入解析结果时按 models.json 默认模型 + VISION_PROVIDER 覆盖规则解析
 */
export function getVisionProvider(
  resolved?: ResolvedModelBinding<VisionProviderName>
): VisionProvider {
  const binding = resolved ?? resolveVisionModel();
  switch (binding.provider) {
    case 'gemini':
      return new GeminiVisionProvider(binding.providerModelId);
    case 'replicate':
      return new ReplicateVisionProvider(binding.providerModelId);
    default:
      throw new Error(`Unknown vision provider: ${binding.provider}`);
  }
}

/**
 * 获取结构化整理 Provider 实例
 * 默认跟随 STRUCTURER_PROVIDER → VISION_PROVIDER 环境链与 models.json 默认模型
 */
export function getStructurerProvider(
  resolved?: ResolvedModelBinding<StructurerProviderName>
): StructurerProvider {
  const binding = resolved ?? resolveStructurerModel();
  switch (binding.provider) {
    case 'gemini':
      return new GeminiStructurerProvider(binding.providerModelId);
    case 'replicate':
      return new ReplicateStructurerProvider(binding.providerModelId);
    default:
      throw new Error(`Unknown structurer provider: ${binding.provider}`);
  }
}

/**
 * 获取图像生成 Provider 实例
 * 未传入解析结果时按 models.json 默认模型 + IMAGE_GEN_PROVIDER 覆盖规则解析
 */
export function getImageGenProvider(
  resolved?: ResolvedModelBinding<ImageGenProviderName>
): ImageGenProvider {
  const binding = resolved ?? resolveImageGenModel();
  switch (binding.provider) {
    case 'fal':
      return new FalImageGenProvider(binding.providerModelId);
    case 'gemini':
      return new GeminiImageGenProvider(binding.providerModelId);
    case 'replicate':
      return new ReplicateImageGenProvider(binding.providerModelId);
    default:
      throw new Error(`Unknown image gen provider: ${binding.provider}`);
  }
}

// 导出类型和实现供外部使用
export {
  GeminiVisionProvider,
  GeminiStructurerProvider,
  GeminiImageGenProvider,
  FalImageGenProvider,
  ReplicateVisionProvider,
  ReplicateStructurerProvider,
  ReplicateImageGenProvider,
};
export type { VisionProvider, StructurerProvider, StructurerContext, ImageGenProvider, ImageGenSyncResult } from './types';
