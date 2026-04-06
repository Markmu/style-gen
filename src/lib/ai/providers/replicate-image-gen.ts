import Replicate from 'replicate';
import type { ImageGenProvider } from './types';

const MODEL = 'black-forest-labs/flux-2-dev' as const;

export class ReplicateImageGenProvider implements ImageGenProvider {
  readonly name = 'replicate' as const;
  private client: Replicate;

  constructor() {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required for Replicate provider');
    }
    this.client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
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
      model: MODEL,
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
