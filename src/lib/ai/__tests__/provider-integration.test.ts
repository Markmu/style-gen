import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVisionProvider, getStructurerProvider, getImageGenProvider } from '@/lib/ai/providers';
import { GeminiVisionProvider } from '@/lib/ai/providers/gemini-vision';
import { GeminiStructurerProvider } from '@/lib/ai/providers/gemini-structurer';
import { ReplicateVisionProvider } from '@/lib/ai/providers/replicate-vision';
import { ReplicateStructurerProvider } from '@/lib/ai/providers/replicate-structurer';
import { FalImageGenProvider } from '@/lib/ai/providers/fal-image-gen';
import { ReplicateImageGenProvider } from '@/lib/ai/providers/replicate-image-gen';

describe('Provider Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 重置环境变量
    process.env = { ...originalEnv };
    // Mock Replicate API Token 以避免构造函数抛出错误
    process.env.REPLICATE_API_TOKEN = 'test-token';
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe('getVisionProvider', () => {
    it('VISION_PROVIDER=gemini 返回 GeminiVisionProvider', () => {
      process.env.VISION_PROVIDER = 'gemini';
      const provider = getVisionProvider();
      expect(provider).toBeInstanceOf(GeminiVisionProvider);
      expect(provider.name).toBe('gemini');
    });

    it('VISION_PROVIDER=replicate 返回 ReplicateVisionProvider', () => {
      process.env.VISION_PROVIDER = 'replicate';
      const provider = getVisionProvider();
      expect(provider).toBeInstanceOf(ReplicateVisionProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未设置环境变量时默认使用 replicate', () => {
      delete process.env.VISION_PROVIDER;
      const provider = getVisionProvider();
      expect(provider).toBeInstanceOf(ReplicateVisionProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未知 provider 名称时抛出明确错误', () => {
      process.env.VISION_PROVIDER = 'unknown';
      expect(() => getVisionProvider()).toThrow('Unknown vision provider: unknown');
    });
  });

  describe('getImageGenProvider', () => {
    it('IMAGE_GEN_PROVIDER=fal 返回 FalImageGenProvider', () => {
      process.env.IMAGE_GEN_PROVIDER = 'fal';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(FalImageGenProvider);
      expect(provider.name).toBe('fal');
    });

    it('IMAGE_GEN_PROVIDER=replicate 返回 ReplicateImageGenProvider', () => {
      process.env.IMAGE_GEN_PROVIDER = 'replicate';
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(ReplicateImageGenProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未设置环境变量时默认使用 replicate', () => {
      delete process.env.IMAGE_GEN_PROVIDER;
      const provider = getImageGenProvider();
      expect(provider).toBeInstanceOf(ReplicateImageGenProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未知 provider 名称时抛出明确错误', () => {
      process.env.IMAGE_GEN_PROVIDER = 'unknown';
      expect(() => getImageGenProvider()).toThrow('Unknown image gen provider: unknown');
    });
  });

  describe('getStructurerProvider', () => {
    it('VISION_PROVIDER=gemini 返回 GeminiStructurerProvider', () => {
      process.env.VISION_PROVIDER = 'gemini';
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(GeminiStructurerProvider);
      expect(provider.name).toBe('gemini');
    });

    it('VISION_PROVIDER=replicate 返回 ReplicateStructurerProvider', () => {
      process.env.VISION_PROVIDER = 'replicate';
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(ReplicateStructurerProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未设置环境变量时默认使用 replicate', () => {
      delete process.env.VISION_PROVIDER;
      const provider = getStructurerProvider();
      expect(provider).toBeInstanceOf(ReplicateStructurerProvider);
      expect(provider.name).toBe('replicate');
    });

    it('未知 provider 名称时抛出明确错误', () => {
      process.env.VISION_PROVIDER = 'unknown';
      expect(() => getStructurerProvider()).toThrow('Unknown structurer provider: unknown');
    });
  });

  describe('多 Provider 独立配置', () => {
    it('VISION_PROVIDER 和 IMAGE_GEN_PROVIDER 可以独立配置', () => {
      process.env.VISION_PROVIDER = 'gemini';
      process.env.IMAGE_GEN_PROVIDER = 'fal';

      const visionProvider = getVisionProvider();
      const structurerProvider = getStructurerProvider();
      const imageGenProvider = getImageGenProvider();

      expect(visionProvider).toBeInstanceOf(GeminiVisionProvider);
      expect(visionProvider.name).toBe('gemini');
      expect(structurerProvider).toBeInstanceOf(GeminiStructurerProvider);
      expect(structurerProvider.name).toBe('gemini');
      expect(imageGenProvider).toBeInstanceOf(FalImageGenProvider);
      expect(imageGenProvider.name).toBe('fal');
    });

    it('可以同时使用 replicate 作为默认 Provider', () => {
      delete process.env.VISION_PROVIDER;
      delete process.env.IMAGE_GEN_PROVIDER;

      const visionProvider = getVisionProvider();
      const structurerProvider = getStructurerProvider();
      const imageGenProvider = getImageGenProvider();

      expect(visionProvider).toBeInstanceOf(ReplicateVisionProvider);
      expect(visionProvider.name).toBe('replicate');
      expect(structurerProvider).toBeInstanceOf(ReplicateStructurerProvider);
      expect(structurerProvider.name).toBe('replicate');
      expect(imageGenProvider).toBeInstanceOf(ReplicateImageGenProvider);
      expect(imageGenProvider.name).toBe('replicate');
    });
  });
});
