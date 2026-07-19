import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVisionProvider, getStructurerProvider, getImageGenProvider } from '../index';
import { GeminiVisionProvider } from '../gemini-vision';
import { GeminiStructurerProvider } from '../gemini-structurer';
import { FalImageGenProvider } from '../fal-image-gen';
import { ReplicateVisionProvider } from '../replicate-vision';
import { ReplicateStructurerProvider } from '../replicate-structurer';
import { ReplicateImageGenProvider } from '../replicate-image-gen';
import { analyzeImage } from '../../vision';
import { generateImage } from '../../image-gen';

// Mock vision 和 image-gen 模块
vi.mock('../../vision', () => ({
  analyzeImage: vi.fn(),
}));

vi.mock('../../image-gen', () => ({
  generateImage: vi.fn(),
}));

const mockAnalyzeImage = vi.mocked(analyzeImage);
const mockGenerateImage = vi.mocked(generateImage);

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

    it('未知 provider 名称时抛出错误', () => {
      process.env.IMAGE_GEN_PROVIDER = 'unknown';
      expect(() => getImageGenProvider()).toThrow(
        'Unknown image gen provider: unknown'
      );
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

  describe('GeminiVisionProvider', () => {
    it('analyze 方法返回同步结果', async () => {
      process.env.VISION_PROVIDER = 'gemini';
      const provider = getVisionProvider();

      mockAnalyzeImage.mockResolvedValue('Test analysis result');

      const result = await provider.analyze({
        imageUrl: 'https://example.com/image.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result).toEqual({
        mode: 'sync',
        result: 'Test analysis result',
      });
      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        'image/jpeg'
      );
    });

    it('analyze 方法忽略 webhookUrl 参数', async () => {
      process.env.VISION_PROVIDER = 'gemini';
      const provider = getVisionProvider();

      mockAnalyzeImage.mockResolvedValue('Analysis result');

      const result = await provider.analyze({
        imageUrl: 'https://example.com/image.jpg',
        mimeType: 'image/png',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result.mode).toBe('sync');
      // 验证没有将 webhookUrl 传递给底层的 analyzeImage
      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        'image/png'
      );
    });
  });

  describe('FalImageGenProvider', () => {
    it('generate 方法返回同步结果', async () => {
      process.env.IMAGE_GEN_PROVIDER = 'fal';
      const provider = getImageGenProvider();

      mockGenerateImage.mockResolvedValue({
        imageUrl: 'https://example.com/generated.jpg',
        width: 1024,
        height: 1024,
      });

      const result = await provider.generate({
        prompt: 'A beautiful landscape',
        negativePrompt: 'blurry, low quality',
        aspectRatio: '1:1',
        quality: 'standard',
      });

      expect(result).toEqual({
        mode: 'sync',
        imageUrl: 'https://example.com/generated.jpg',
        width: 1024,
        height: 1024,
      });
      expect(mockGenerateImage).toHaveBeenCalledWith({
        prompt: 'A beautiful landscape',
        negativePrompt: 'blurry, low quality',
        aspectRatio: '1:1',
        quality: 'standard',
      });
    });

    it('generate 方法忽略 webhookUrl 参数', async () => {
      process.env.IMAGE_GEN_PROVIDER = 'fal';
      const provider = getImageGenProvider();

      mockGenerateImage.mockResolvedValue({
        imageUrl: 'https://example.com/generated.jpg',
        width: 1024,
        height: 1024,
      });

      const result = await provider.generate({
        prompt: 'Test prompt',
        negativePrompt: '',
        aspectRatio: '16:9',
        quality: 'high',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result.mode).toBe('sync');
      // 验证 webhookUrl 没有传递给底层的 generateImage
      expect(mockGenerateImage).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        negativePrompt: '',
        aspectRatio: '16:9',
        quality: 'high',
      });
    });
  });
});
