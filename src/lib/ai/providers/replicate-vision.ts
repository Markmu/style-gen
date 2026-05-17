import Replicate from 'replicate';
import type { VisionProvider } from './types';
import { VISION_SYSTEM_PROMPT } from '../prompts';

const MODEL = 'google/gemini-2.5-flash' as const;

export class ReplicateVisionProvider implements VisionProvider {
  readonly name = 'replicate' as const;
  private client: Replicate;

  constructor() {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required for Replicate provider');
    }
    this.client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  }

  async analyze(params: {
    imageUrl: string;
    mimeType: string;
    webhookUrl?: string;
  }): Promise<{ mode: 'async'; externalId: string }> {
    if (!params.webhookUrl) {
      throw new Error('webhookUrl is required for Replicate provider');
    }

    const prediction = await this.client.predictions.create({
      model: MODEL,
      input: {
        top_p: 0.95,
        images: [params.imageUrl],
        prompt: VISION_SYSTEM_PROMPT,
        videos: [],
        temperature: 1,
        dynamic_thinking: false,
        max_output_tokens: 65535,
      },
      webhook: params.webhookUrl,
      webhook_events_filter: ['completed'],
    });

    return { mode: 'async', externalId: prediction.id };
  }
}
