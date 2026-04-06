import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplicateImageGenProvider } from '../replicate-image-gen';

// Mock Replicate SDK
const mockCreate = vi.fn();
vi.mock('replicate', () => ({
  default: class {
    predictions = { create: mockCreate };
    constructor(_cfg: any) {}
  },
}));

describe('ReplicateImageGenProvider', () => {
  let provider: ReplicateImageGenProvider;

  beforeEach(() => {
    process.env.REPLICATE_API_TOKEN = 'test-token';
    mockCreate.mockReset();
    provider = new ReplicateImageGenProvider();
  });

  it('should throw error if REPLICATE_API_TOKEN is not set', () => {
    delete process.env.REPLICATE_API_TOKEN;
    expect(() => new ReplicateImageGenProvider()).toThrow(
      'REPLICATE_API_TOKEN environment variable is required for Replicate provider'
    );
  });

  it('should have correct name', () => {
    expect(provider.name).toBe('replicate');
  });

  it('should create prediction with correct parameters', async () => {
    const mockPrediction = { id: 'pred_789' };
    mockCreate.mockResolvedValue(mockPrediction);

    const result = await provider.generate({
      prompt: 'A beautiful landscape',
      negativePrompt: 'blurry, low quality',
      aspectRatio: '16:9',
      quality: 'standard',
      webhookUrl: 'https://example.com/webhook',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'black-forest-labs/flux-2-dev',
      input: {
        prompt: 'A beautiful landscape',
        aspect_ratio: '16:9',
        num_outputs: 1,
      },
      webhook: 'https://example.com/webhook',
      webhook_events_filter: ['completed'],
    });

    expect(result).toEqual({
      mode: 'async',
      externalId: 'pred_789',
    });
  });

  it('should throw error if webhookUrl is not provided', async () => {
    await expect(
      provider.generate({
        prompt: 'A beautiful landscape',
        negativePrompt: 'blurry, low quality',
        aspectRatio: '16:9',
        quality: 'standard',
      })
    ).rejects.toThrow('webhookUrl is required for Replicate provider');
  });

  it('should always return async mode', async () => {
    const mockPrediction = { id: 'pred_999' };
    mockCreate.mockResolvedValue(mockPrediction);

    const result = await provider.generate({
      prompt: 'Test prompt',
      negativePrompt: 'Test negative',
      aspectRatio: '1:1',
      quality: 'high',
      webhookUrl: 'https://example.com/webhook',
    });

    expect(result.mode).toBe('async');
    expect(result.externalId).toBe('pred_999');
  });
});
