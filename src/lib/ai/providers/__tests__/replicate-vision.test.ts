import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplicateVisionProvider } from '../replicate-vision';
import { VISION_SYSTEM_PROMPT } from '../../prompts';

// Mock Replicate SDK
const mockCreate = vi.fn();
vi.mock('replicate', () => ({
  default: class {
    predictions = { create: mockCreate };
    constructor(_cfg: any) {}
  },
}));

describe('ReplicateVisionProvider', () => {
  let provider: ReplicateVisionProvider;

  beforeEach(() => {
    process.env.REPLICATE_API_TOKEN = 'test-token';
    mockCreate.mockReset();
    provider = new ReplicateVisionProvider();
  });

  it('should throw error if REPLICATE_API_TOKEN is not set', () => {
    delete process.env.REPLICATE_API_TOKEN;
    expect(() => new ReplicateVisionProvider()).toThrow(
      'REPLICATE_API_TOKEN environment variable is required for Replicate provider'
    );
  });

  it('should have correct name', () => {
    expect(provider.name).toBe('replicate');
  });

  it('should create prediction with correct parameters', async () => {
    const mockPrediction = { id: 'pred_123' };
    mockCreate.mockResolvedValue(mockPrediction);

    const result = await provider.analyze({
      imageUrl: 'https://example.com/image.jpg',
      mimeType: 'image/jpeg',
      webhookUrl: 'https://example.com/webhook',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'google/gemini-2.0-flash-exp:free-preview',
      input: {
        image: 'https://example.com/image.jpg',
        prompt: VISION_SYSTEM_PROMPT,
      },
      webhook: 'https://example.com/webhook',
      webhook_events_filter: ['completed'],
    });

    expect(result).toEqual({
      mode: 'async',
      externalId: 'pred_123',
    });
  });

  it('should throw error if webhookUrl is not provided', async () => {
    await expect(
      provider.analyze({
        imageUrl: 'https://example.com/image.jpg',
        mimeType: 'image/jpeg',
      })
    ).rejects.toThrow('webhookUrl is required for Replicate provider');
  });

  it('should always return async mode', async () => {
    const mockPrediction = { id: 'pred_456' };
    mockCreate.mockResolvedValue(mockPrediction);

    const result = await provider.analyze({
      imageUrl: 'https://example.com/image.jpg',
      mimeType: 'image/png',
      webhookUrl: 'https://example.com/webhook',
    });

    expect(result.mode).toBe('async');
    expect(result.externalId).toBe('pred_456');
  });
});
