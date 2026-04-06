/** 视觉分析 Provider 接口 */
export interface VisionProvider {
  readonly name: 'replicate' | 'gemini';

  analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;
  }): Promise<
    | { mode: 'sync'; result: string }
    | { mode: 'async'; externalId: string }
  >;
}

/** 图像生成 Provider 接口 */
export interface ImageGenProvider {
  readonly name: 'replicate' | 'fal';

  generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<
    | { mode: 'sync'; imageUrl: string; width: number; height: number }
    | { mode: 'async'; externalId: string }
  >;
}
