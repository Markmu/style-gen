import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVisionProvider, getStructurerProvider, getImageGenProvider } from '../index';
import { GeminiVisionProvider } from '../gemini-vision';
import { GeminiStructurerProvider } from '../gemini-structurer';
import { GeminiImageGenProvider } from '../gemini-image-gen';
import { FalImageGenProvider } from '../fal-image-gen';
import { ReplicateVisionProvider } from '../replicate-vision';
import { ReplicateStructurerProvider } from '../replicate-structurer';
import { ReplicateImageGenProvider } from '../replicate-image-gen';

describe('Provider Factory', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('getVisionProvider', () => {
    it('VISION_PROVIDER=gemini 时返回 GeminiVisionProvider', () => {
      process.env.VISION_PROVIDER = 'gemini';
      const provider = getVisionProvider();
      expect(provider).toBeInstanceOf(GeminiVisionProvider);
      expect(provider.name).toBe('gemini');
    });

    it('VISION_PROVIDER 未设置时默认返回 Replicate Provider', () => {
      delete process.env.VISION_PROVIDER;
      process.env.REPLICATE_API_TOKEN = 'test-token';
      const provider = getVisionProvider();
      expect(provider).toBeInstanceOf(ReplicateVisionProvider);
      expect(provider.name).toBe('replicate');
    });

    it('VISION_PROVIDER=replicate 时返回 Replicate Provider', () => {
      process.env.VISION_PROVIDER = 'replicate';
      process.env.REPLICATE_API_TOKEN = 'test-token';
      const provider = getVisionProvider();
      expect(provider).toBeInstanceOf(ReplicateVisionProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未知 provider 名称时抛出错误', () => {
      process.env.VISION_PROVIDER = 'unknown';
      expect(() => getVisionProvider()).toThrow(
        'Unknown vision provider: unknown'
      );
    });
  });

  describe('getImageGenProvider', () => {
    it('IMAGE_GEN_PROVIDER=fal 时返回 FalImageGenProvider', () => {
      process.env.IMAGE_GEN_PROVIDER = 'fal';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(FalImageGenProvider);
      expect(provider.name).toBe('fal');
    });

    it('IMAGE_GEN_PROVIDER 未设置时默认返回 Replicate Provider', () => {
      delete process.env.IMAGE_GEN_PROVIDER;
      process.env.REPLICATE_API_TOKEN = 'test-token';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(ReplicateImageGenProvider);
      expect(provider.name).toBe('replicate');
    });

    it('IMAGE_GEN_PROVIDER=replicate 时返回 Replicate Provider', () => {
      process.env.IMAGE_GEN_PROVIDER = 'replicate';
      process.env.REPLICATE_API_TOKEN = 'test-token';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(ReplicateImageGenProvider);
      expect(provider.name).toBe('replicate');
    });

    it('IMAGE_GEN_PROVIDER=gemini 时返回 GeminiImageGenProvider', () => {
      process.env.IMAGE_GEN_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'test-api-key';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(GeminiImageGenProvider);
      expect(provider.name).toBe('gemini');
    });

    it('未知 provider 名称时抛出错误', () => {
      process.env.IMAGE_GEN_PROVIDER = 'unknown';
      expect(() => getImageGenProvider()).toThrow(
        'Unknown image gen provider: unknown'
      );
    });

    it('显式传入解析结果时优先于 env 选择', () => {
      process.env.IMAGE_GEN_PROVIDER = 'fal';
      const provider = getImageGenProvider({
        modelId: 'nano-banana-2-lite',
        label: 'Nano Banana 2 Lite',
        provider: 'gemini',
        providerModelId: 'gemini-3.1-flash-lite-image',
      });
      expect(provider).toBeInstanceOf(GeminiImageGenProvider);
      expect(provider.name).toBe('gemini');
    });

    it('未指定模型时 env 驱动默认模型选择（gemini 部署行为保留）', () => {
      process.env.IMAGE_GEN_PROVIDER = 'gemini';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(GeminiImageGenProvider);
      expect(provider.name).toBe('gemini');
    });
  });

  describe('getStructurerProvider', () => {
    it('STRUCTURER_PROVIDER 可独立覆盖 VISION_PROVIDER', () => {
      process.env.VISION_PROVIDER = 'replicate';
      process.env.STRUCTURER_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'test-api-key';
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(GeminiStructurerProvider);
      expect(provider.name).toBe('gemini');
    });

    it('VISION_PROVIDER=gemini 时返回 GeminiStructurerProvider', () => {
      process.env.VISION_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'test-api-key';
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(GeminiStructurerProvider);
      expect(provider.name).toBe('gemini');
    });

    it('VISION_PROVIDER 未设置时默认返回 ReplicateStructurerProvider', () => {
      delete process.env.VISION_PROVIDER;
      process.env.REPLICATE_API_TOKEN = 'test-token';
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(ReplicateStructurerProvider);
      expect(provider.name).toBe('replicate');
    });

    it('VISION_PROVIDER=replicate 时返回 ReplicateStructurerProvider', () => {
      process.env.VISION_PROVIDER = 'replicate';
      process.env.REPLICATE_API_TOKEN = 'test-token';
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(ReplicateStructurerProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未知 provider 名称时抛出错误', () => {
      process.env.VISION_PROVIDER = 'unknown';
      expect(() => getStructurerProvider()).toThrow(
        'Unknown structurer provider: unknown'
      );
    });
  });
});
