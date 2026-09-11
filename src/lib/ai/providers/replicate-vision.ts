import { singleAttemptPostFetch } from './single-attempt-fetch';
import Replicate from 'replicate';
import type { VisionProvider } from './types';
import { VISION_SYSTEM_PROMPT, MULTI_REFERENCE_INSTRUCTIONS } from '../prompts';

const DEFAULT_MODEL = 'google/gemini-2.5-flash' as const;

export class ReplicateVisionProvider implements VisionProvider {
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

  async analyze(params: {
    imageUrl: string;
    mimeType: string;
    images?: { imageUrl: string; mimeType: string }[];
    webhookUrl?: string;
  }): Promise<{ mode: 'async'; externalId: string }> {
    if (!params.webhookUrl) {
      throw new Error('webhookUrl is required for Replicate provider');
    }

    const client = new Replicate({auth: process.env.REPLICATE_API_TOKEN, fetch: singleAttemptPostFetch()});
    const prediction = await client.predictions.create({
      model: this.model,
      input: {
        top_p: 0.95,
        images: (params.images ?? [params]).map(image=>image.imageUrl),
        prompt: VISION_SYSTEM_PROMPT + ((params.images?.length ?? 1)>1 ? MULTI_REFERENCE_INSTRUCTIONS : ''),
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
