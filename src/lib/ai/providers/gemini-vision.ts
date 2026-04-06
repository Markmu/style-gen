import { analyzeImage } from '../vision';
import type { VisionProvider } from './types';

/**
 * Gemini Vision Provider 实现
 * 包装现有的 analyzeImage 函数，返回同步结果
 */
export class GeminiVisionProvider implements VisionProvider {
  readonly name = 'gemini' as const;

  async analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;
  }): Promise<{ mode: 'sync'; result: string }> {
    // Gemini 是同步调用，忽略 webhookUrl 参数
    const result = await analyzeImage(params.imageUrl, params.mimeType);
    return { mode: 'sync', result };
  }
}
