import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { findAnalysisTaskByIdInternal, updateAnalysisTask } from '@/lib/repositories/analysis-task-repository';
import { findGenerationTaskByIdInternal, updateGenerationTask } from '@/lib/repositories/generation-task-repository';
import { structureAnalysis, StructurerError } from '../structurer';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';
import { createAsset } from '@/lib/repositories/asset-repository';

const { validateWebhookMock } = vi.hoisted(() => ({
  validateWebhookMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@/lib/repositories/analysis-task-repository');
vi.mock('@/lib/repositories/generation-task-repository');
vi.mock('../structurer');
vi.mock('@/lib/r2');
vi.mock('@/lib/repositories/asset-repository');
vi.mock('replicate', () => {
  return {
    validateWebhook: validateWebhookMock,
  };
});

describe('webhook-handler', () => {
  let handleReplicateWebhook: typeof import('../webhook-handler').handleReplicateWebhook;
  const mockTaskId = 'test-task-id';
  const mockWebhookSecret = 'test-webhook-secret';

  beforeAll(async () => {
    ({ handleReplicateWebhook } = await import('../webhook-handler'));
  });

  beforeEach(() => {
    process.env.REPLICATE_WEBHOOK_SECRET = mockWebhookSecret;
    vi.mocked(getPublicUrl).mockImplementation((key) => `https://r2.example.com/${key}`);
    validateWebhookMock.mockReset();
    // 默认让签名验证通过（大部分测试关注签名之后的逻辑）
    validateWebhookMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** 创建模拟的 Request 对象 */
  function createMockRequest(body: string, signature?: string): Request {
    const headers = new Headers();
    if (signature) {
      headers.set('Webhook-Signature', signature);
      headers.set('Webhook-Id', 'wh_test_id');
      headers.set('Webhook-Timestamp', String(Math.floor(Date.now() / 1000)));
    }
    return new Request('https://example.com/webhook', {
      method: 'POST',
      headers,
      body: new TextEncoder().encode(body),
    });
  }

  describe('签名验证', () => {
    it('应该拒绝无效签名', async () => {
      const body = JSON.stringify({ id: 'pred-1', status: 'succeeded', output: 'test' });
      const request = createMockRequest(body, 'invalid-signature');

      // 覆盖默认：让签名验证失败
      validateWebhookMock.mockResolvedValue(false);

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(401);
      expect(result.response.ok).toBe(false);
      expect(result.response.message).toBe('Invalid signature');
    });

    it('应该接受有效签名', async () => {
      const body = JSON.stringify({ id: 'pred-1', status: 'succeeded', output: 'test output' });
      const request = createMockRequest(body, 'v1,sig');

      // 签名验证通过（beforeEach 已设置默认为 true）
      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue({
        id: mockTaskId,
        sourceAssetId: 'asset-1',
        status: 'processing',
        recipe: null,
        promptText: null,
        negativePromptText: null,
        rawResponse: null,
        errorMessage: null,
        errorStage: null,
        provider: 'replicate',
        externalId: 'pred-1',
        modelName: 'test-model',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(structureAnalysis).mockResolvedValue({
        recipe: {
          imageSummary: 'test summary',
          subject: 'test subject',
          scene: 'test scene',
          composition: 'test composition',
          cameraLanguage: 'test camera',
          lighting: 'test lighting',
          color: 'test color',
          texture: 'test texture',
          styleTags: ['tag1', 'tag2'],
          mood: 'test mood',
          visualKeywords: ['keyword1', 'keyword2'],
          mustKeep: ['keep1'],
          replaceable: ['replace1'],
        },
        promptText: 'test prompt',
        negativePromptText: 'test negative',
      });

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
    });
  });

  describe('分析回调处理', () => {
    const mockAnalysisTask = {
      id: mockTaskId,
      sourceAssetId: 'asset-1',
      status: 'processing' as const,
      recipe: null,
      promptText: null,
      negativePromptText: null,
      rawResponse: null,
      errorMessage: null,
      errorStage: null,
      provider: 'replicate' as const,
      externalId: 'pred-1',
      modelName: 'test-model',
      userId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('应该成功处理分析回调并更新任务', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: 'raw analysis text',
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue(mockAnalysisTask);
      vi.mocked(structureAnalysis).mockResolvedValue({
        recipe: {
          imageSummary: 'test summary',
          subject: 'test subject',
          scene: 'test scene',
          composition: 'test composition',
          cameraLanguage: 'test camera',
          lighting: 'test lighting',
          color: 'test color',
          texture: 'test texture',
          styleTags: ['tag1', 'tag2'],
          mood: 'test mood',
          visualKeywords: ['keyword1', 'keyword2'],
          mustKeep: ['keep1'],
          replaceable: ['replace1'],
        },
        promptText: 'test prompt',
        negativePromptText: 'test negative',
      });
      vi.mocked(updateAnalysisTask).mockResolvedValue({
        ...mockAnalysisTask,
        status: 'completed',
      });

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(updateAnalysisTask).toHaveBeenCalledWith(mockTaskId, {
        status: 'completed',
        recipe: expect.any(Object),
        promptText: 'test prompt',
        negativePromptText: 'test negative',
        rawResponse: 'raw analysis text',
      });
    });

    it('应该在结构化失败时进行 L3 降级', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: 'raw analysis text',
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue(mockAnalysisTask);
      vi.mocked(structureAnalysis).mockRejectedValue(
        new StructurerError('Structurer failed')
      );
      vi.mocked(updateAnalysisTask).mockResolvedValue({
        ...mockAnalysisTask,
        status: 'completed',
      });

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(updateAnalysisTask).toHaveBeenCalledWith(mockTaskId, {
        status: 'completed',
        promptText: 'raw analysis text',
        rawResponse: 'raw analysis text',
        errorStage: 'llm',
        errorMessage: expect.any(String),
      });
    });

    it('应该处理分析任务失败', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'failed',
        output: null,
        error: 'Vision model failed',
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue(mockAnalysisTask);
      vi.mocked(updateAnalysisTask).mockResolvedValue({
        ...mockAnalysisTask,
        status: 'failed',
      });

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(updateAnalysisTask).toHaveBeenCalledWith(mockTaskId, {
        status: 'failed',
        errorMessage: 'Vision model failed',
        errorStage: 'vision',
      });
    });

    it('应该在任务不存在时返回 404', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: 'test',
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue(null);

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: 'non-existent-task',
        request,
      });

      expect(result.status).toBe(404);
      expect(result.response.ok).toBe(false);
    });

    it('应该在任务已为终态时跳过处理（幂等性）', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: 'test',
      });
      const request = createMockRequest(body, 'v1,sig');

      const completedTask = { ...mockAnalysisTask, status: 'completed' as const };
      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue(completedTask);

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(result.response.message).toBe('Task already in terminal state');
      expect(structureAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('生成回调处理', () => {
    const mockGenerationTask = {
      id: mockTaskId,
      analysisTaskId: 'analysis-1',
      status: 'processing' as const,
      promptSnapshot: 'test prompt',
      negativePromptSnapshot: 'test negative',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'test-model',
      provider: 'replicate' as const,
      externalId: 'pred-1',
      resultAssetId: null,
      errorMessage: null,
      userId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('应该成功处理生成回调并创建 Asset', async () => {
      const imageUrl = 'https://replicate.example.com/image.webp';
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: imageUrl,
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findGenerationTaskByIdInternal).mockResolvedValue(mockGenerationTask);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      } as Response);

      vi.mocked(uploadBuffer).mockResolvedValue(undefined);
      vi.mocked(createAsset).mockResolvedValue({
        id: 'asset-1',
        type: 'generated',
        fileUrl: 'https://r2.example.com/generated/task-1/result.webp',
        thumbnailUrl: null,
        width: 1024,
        height: 1024,
        mimeType: 'image/webp',
        userId: 'user-1',
        createdAt: new Date(),
      });
      vi.mocked(updateGenerationTask).mockResolvedValue({
        ...mockGenerationTask,
        status: 'completed',
      });

      const result = await handleReplicateWebhook({
        taskType: 'generation',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(uploadBuffer).toHaveBeenCalledWith(
        `generated/${mockTaskId}/result.webp`,
        expect.any(Buffer),
        'image/webp'
      );
      expect(createAsset).toHaveBeenCalledWith('user-1', {
        type: 'generated',
        fileUrl: 'https://r2.example.com/generated/test-task-id/result.webp',
        thumbnailUrl: null,
        width: 1024,
        height: 1024,
        mimeType: 'image/webp',
      });
      expect(updateGenerationTask).toHaveBeenCalledWith(mockTaskId, {
        status: 'completed',
        resultAssetId: 'asset-1',
      });
    });

    it('应该处理生成任务失败', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'failed',
        output: null,
        error: 'Generation failed',
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findGenerationTaskByIdInternal).mockResolvedValue(mockGenerationTask);
      vi.mocked(updateGenerationTask).mockResolvedValue({
        ...mockGenerationTask,
        status: 'failed',
      });

      const result = await handleReplicateWebhook({
        taskType: 'generation',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(updateGenerationTask).toHaveBeenCalledWith(mockTaskId, {
        status: 'failed',
        errorMessage: 'Generation failed',
      });
    });

    it('应该在任务已为终态时跳过处理（幂等性）', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: 'https://example.com/image.webp',
      });
      const request = createMockRequest(body, 'v1,sig');

      const completedTask = { ...mockGenerationTask, status: 'completed' as const };
      vi.mocked(findGenerationTaskByIdInternal).mockResolvedValue(completedTask);

      const result = await handleReplicateWebhook({
        taskType: 'generation',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(result.response.message).toBe('Task already in terminal state');
    });

    it('应该在 userId 缺失时失败', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: 'https://example.com/image.webp',
      });
      const request = createMockRequest(body, 'v1,sig');

      const taskWithoutUser = { ...mockGenerationTask, userId: null };
      vi.mocked(findGenerationTaskByIdInternal).mockResolvedValue(taskWithoutUser);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      } as Response);

      vi.mocked(uploadBuffer).mockResolvedValue(undefined);
      vi.mocked(updateGenerationTask).mockResolvedValue({
        ...taskWithoutUser,
        status: 'failed',
      });

      const result = await handleReplicateWebhook({
        taskType: 'generation',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(500);
      expect(result.response.ok).toBe(false);
    });
  });

  describe('边界场景', () => {
    it('应该处理空的 prediction output', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'succeeded',
        output: null,
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue({
        id: mockTaskId,
        sourceAssetId: 'asset-1',
        status: 'processing',
        recipe: null,
        promptText: null,
        negativePromptText: null,
        rawResponse: null,
        errorMessage: null,
        errorStage: null,
        provider: 'replicate',
        externalId: 'pred-1',
        modelName: 'test-model',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(updateAnalysisTask).mockResolvedValue({
        id: mockTaskId,
        sourceAssetId: 'asset-1',
        status: 'failed',
        recipe: null,
        promptText: null,
        negativePromptText: null,
        rawResponse: null,
        errorMessage: 'Failed to extract raw analysis from prediction output',
        errorStage: null,
        provider: 'replicate',
        externalId: 'pred-1',
        modelName: 'test-model',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(500);
      expect(result.response.ok).toBe(false);
    });

    it('应该处理无效的 JSON payload', async () => {
      const invalidBody = 'invalid json{{{';
      const request = createMockRequest(invalidBody, 'v1,sig');

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(400);
      expect(result.response.ok).toBe(false);
      expect(result.response.message).toBe('Invalid payload');
    });

    it('应该处理 canceled 状态', async () => {
      const body = JSON.stringify({
        id: 'pred-1',
        status: 'canceled',
        output: null,
        error: 'Prediction canceled',
      });
      const request = createMockRequest(body, 'v1,sig');

      vi.mocked(findAnalysisTaskByIdInternal).mockResolvedValue({
        id: mockTaskId,
        sourceAssetId: 'asset-1',
        status: 'processing',
        recipe: null,
        promptText: null,
        negativePromptText: null,
        rawResponse: null,
        errorMessage: null,
        errorStage: null,
        provider: 'replicate',
        externalId: 'pred-1',
        modelName: 'test-model',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(updateAnalysisTask).mockResolvedValue({
        id: mockTaskId,
        sourceAssetId: 'asset-1',
        status: 'failed',
        recipe: null,
        promptText: null,
        negativePromptText: null,
        rawResponse: null,
        errorMessage: 'Prediction canceled',
        errorStage: 'vision',
        provider: 'replicate',
        externalId: 'pred-1',
        modelName: 'test-model',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await handleReplicateWebhook({
        taskType: 'analysis',
        taskId: mockTaskId,
        request,
      });

      expect(result.status).toBe(200);
      expect(result.response.ok).toBe(true);
      expect(updateAnalysisTask).toHaveBeenCalledWith(mockTaskId, {
        status: 'failed',
        errorMessage: 'Prediction canceled',
        errorStage: 'vision',
      });
    });
  });
});
