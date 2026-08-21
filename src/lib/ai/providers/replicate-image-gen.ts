import Replicate from 'replicate';
import type { ImageGenProvider } from './types';

const DEFAULT_MODEL = 'black-forest-labs/flux-2-dev' as const;

export class ReplicateImageGenProvider implements ImageGenProvider {
  readonly name = 'replicate' as const;
  private client: Replicate;
  private readonly model: string;

  /** modelId 缺省时回退本地常量；应用路径一律由 models.json 解析后传入 */
  constructor(modelId?: string) {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required for Replicate provider');
    }
    this.client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    this.model = modelId ?? DEFAULT_MODEL;
  }

  async generate(params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
    webhookUrl?: string;
  }): Promise<{ mode: 'async'; externalId: string }> {
    if (!params.webhookUrl) {
      throw new Error('webhookUrl is required for Replicate provider');
    }

    const prediction = await this.client.predictions.create({
      model: this.model,
      input: {
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
        num_outputs: 1,
      },
      webhook: params.webhookUrl,
      webhook_events_filter: ['completed'],
    });

    return { mode: 'async', externalId: prediction.id };
  }
}
