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

export interface StructurerContext {
  taskId?: string;
  source?: 'analysis_route' | 'analysis_webhook';
  /** 原始图片 URL，传给 LLM 以便交叉验证视觉分析 */
  imageUrl?: string;
  /** 图片 MIME 类型 */
  mimeType?: string;
}

/** 结构化整理 Provider 接口 */
export interface StructurerProvider {
  readonly name: 'replicate' | 'gemini';

  structure(params: {
    rawAnalysis: string;
    context?: StructurerContext;
  }): Promise<string>;
}

/** 图像生成 Provider 同步返回：二选一 */
export type ImageGenSyncResult =
  | { mode: 'sync'; imageUrl: string; width: number; height: number }
  | {
      mode: 'sync';
      /** 内联 base64 图片（无托管 URL 的 Provider，如 Gemini） */
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
    };

/** 图像生成 Provider 接口 */
export interface ImageGenProvider {
  readonly name: 'replicate' | 'fal' | 'gemini';

  generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<ImageGenSyncResult | { mode: 'async'; externalId: string }>;
}

/** 生图模型调用失败 */
export class ImageGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageGenError';
  }
}
