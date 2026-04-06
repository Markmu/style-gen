import { validateWebhook } from 'replicate';
import { findAnalysisTaskByIdInternal, updateAnalysisTask } from '@/lib/repositories/analysis-task-repository';
import { findGenerationTaskByIdInternal, updateGenerationTask } from '@/lib/repositories/generation-task-repository';
import { structureAnalysis, StructurerError } from './structurer';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';
import { createAsset } from '@/lib/repositories/asset-repository';

/** Replicate Webhook Payload */
interface ReplicatePrediction {
  id: string;
  status: 'succeeded' | 'failed' | 'canceled';
  output: unknown;
  error: string | null;
}

/** Webhook 处理输入参数 */
export interface WebhookInput {
  taskType: 'analysis' | 'generation';
  taskId: string;
  request: Request;
}

/** Webhook 处理结果 */
export interface WebhookResult {
  response: { ok: boolean; message?: string };
  status: number;
}

/**
 * 处理 Replicate Webhook 回调
 * 使用 Replicate SDK 的 validateWebhook 验证签名并分发到相应的处理逻辑
 */
export async function handleReplicateWebhook(input: WebhookInput): Promise<WebhookResult> {
  const startTime = Date.now();
  const { taskType, taskId, request } = input;

  // 1. 读取请求体
  let signatureRequest: Request;
  let body: string;
  try {
    signatureRequest = request.clone();
    body = await request.text();
  } catch {
    return {
      response: { ok: false, message: 'Failed to read request body' },
      status: 400,
    };
  }

  // 2. 验证签名（使用 Replicate SDK）
  const webhookSecret = process.env.REPLICATE_WEBHOOK_SECRET;
  let signatureValid = false;

  if (webhookSecret) {
    try {
      signatureValid = await validateWebhook(signatureRequest, webhookSecret);
    } catch {
      signatureValid = false;
    }
  }

  console.log(JSON.stringify({
    event: 'webhook_received',
    timestamp: new Date().toISOString(),
    taskId,
    taskType,
    signatureValid,
  }));

  // 签名验证失败
  if (!webhookSecret) {
    console.error(JSON.stringify({
      event: 'webhook_signature_validation_failed',
      timestamp: new Date().toISOString(),
      taskId,
      taskType,
      reason: 'REPLICATE_WEBHOOK_SECRET not configured',
    }));
    return {
      response: { ok: false, message: 'Webhook secret not configured' },
      status: 500,
    };
  }

  if (!signatureValid) {
    console.error(JSON.stringify({
      event: 'webhook_signature_validation_failed',
      timestamp: new Date().toISOString(),
      taskId,
      taskType,
      reason: 'Invalid signature',
    }));
    return {
      response: { ok: false, message: 'Invalid signature' },
      status: 401,
    };
  }

  // 3. 解析 payload
  let prediction: ReplicatePrediction;
  try {
    prediction = JSON.parse(body);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'webhook_payload_parse_failed',
      timestamp: new Date().toISOString(),
      taskId,
      taskType,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return {
      response: { ok: false, message: 'Invalid payload' },
      status: 400,
    };
  }

  // 3. 根据 taskType 分发处理
  try {
    if (taskType === 'analysis') {
      const result = await handleAnalysisWebhook(taskId, prediction);
      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        event: 'webhook_analysis_processed',
        timestamp: new Date().toISOString(),
        taskId,
        status: prediction.status,
        duration,
        result,
      }));
      return result;
    } else if (taskType === 'generation') {
      const result = await handleGenerationWebhook(taskId, prediction);
      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        event: 'webhook_generation_processed',
        timestamp: new Date().toISOString(),
        taskId,
        status: prediction.status,
        duration,
        result,
      }));
      return result;
    } else {
      return {
        response: { ok: false, message: 'Invalid taskType' },
        status: 400,
      };
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: 'webhook_processing_failed',
      timestamp: new Date().toISOString(),
      taskId,
      taskType,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return {
      response: { ok: false, message: 'Processing failed' },
      status: 500,
    };
  }
}

/**
 * 处理分析任务 Webhook 回调
 */
async function handleAnalysisWebhook(
  taskId: string,
  prediction: ReplicatePrediction
): Promise<WebhookResult> {
  // 1. 查询任务
  const task = await findAnalysisTaskByIdInternal(taskId);
  if (!task) {
    return {
      response: { ok: false, message: 'Task not found' },
      status: 404,
    };
  }

  // 2. 幂等性检查
  if (task.status === 'completed' || task.status === 'failed') {
    return {
      response: { ok: true, message: 'Task already in terminal state' },
      status: 200,
    };
  }

  // 3. 处理失败状态
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    await updateAnalysisTask(taskId, {
      status: 'failed',
      errorMessage: prediction.error ?? 'Replicate prediction failed',
      errorStage: 'vision',
    });
    return {
      response: { ok: true, message: 'Task marked as failed' },
      status: 200,
    };
  }

  // 4. 处理成功状态
  if (prediction.status === 'succeeded') {
    // 提取视觉分析结果文本
    const rawAnalysis = extractRawAnalysis(prediction.output);

    try {
      // 同步调用 Gemini 结构化整理
      const structured = await structureAnalysis(rawAnalysis);

      // 更新任务为完成状态
      await updateAnalysisTask(taskId, {
        status: 'completed',
        recipe: structured.recipe,
        promptText: structured.promptText,
        negativePromptText: structured.negativePromptText,
        rawResponse: rawAnalysis,
      });

      return {
        response: { ok: true, message: 'Analysis completed successfully' },
        status: 200,
      };
    } catch (error) {
      // L3 降级：结构化失败时保存原始分析文本
      if (error instanceof StructurerError) {
        await updateAnalysisTask(taskId, {
          status: 'completed',
          promptText: rawAnalysis,
          rawResponse: rawAnalysis,
          errorStage: 'llm',
          errorMessage: error.message,
        });
        return {
          response: { ok: true, message: 'Analysis completed with fallback' },
          status: 200,
        };
      }

      // 其他错误
      throw error;
    }
  }

  return {
    response: { ok: false, message: `Unhandled prediction status: ${prediction.status}` },
    status: 400,
  };
}

/**
 * 处理生成任务 Webhook 回调
 */
async function handleGenerationWebhook(
  taskId: string,
  prediction: ReplicatePrediction
): Promise<WebhookResult> {
  // 1. 查询任务
  const task = await findGenerationTaskByIdInternal(taskId);
  if (!task) {
    return {
      response: { ok: false, message: 'Task not found' },
      status: 404,
    };
  }

  // 2. 幂等性检查
  if (task.status === 'completed' || task.status === 'failed') {
    return {
      response: { ok: true, message: 'Task already in terminal state' },
      status: 200,
    };
  }

  // 3. 处理失败状态
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    await updateGenerationTask(taskId, {
      status: 'failed',
      errorMessage: prediction.error ?? 'Replicate prediction failed',
    });
    return {
      response: { ok: true, message: 'Task marked as failed' },
      status: 200,
    };
  }

  // 4. 处理成功状态
  if (prediction.status === 'succeeded') {
    // 提取生成图片 URL
    const imageUrl = extractImageUrl(prediction.output);

    if (!imageUrl) {
      await updateGenerationTask(taskId, {
        status: 'failed',
        errorMessage: 'Failed to extract image URL from prediction output',
      });
      return {
        response: { ok: false, message: 'Failed to extract image URL' },
        status: 500,
      };
    }

    try {
      // 下载图片并上传到 R2
      const imageBuffer = await downloadImage(imageUrl);
      const r2Key = `generated/${taskId}/result.webp`;
      await uploadBuffer(r2Key, imageBuffer, 'image/webp');

      // 创建 Asset 记录
      const userId = task.userId;
      if (!userId) {
        throw new Error('Task missing userId');
      }

      const asset = await createAsset(userId, {
        type: 'generated',
        fileUrl: getPublicUrl(r2Key),
        thumbnailUrl: null,
        width: 1024, // 默认尺寸，实际应该从图片元数据获取
        height: 1024,
        mimeType: 'image/webp',
      });

      // 更新任务为完成状态
      await updateGenerationTask(taskId, {
        status: 'completed',
        resultAssetId: asset.id,
      });

      return {
        response: { ok: true, message: 'Generation completed successfully' },
        status: 200,
      };
    } catch (error) {
      await updateGenerationTask(taskId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Failed to process generated image',
      });
      throw error;
    }
  }

  return {
    response: { ok: false, message: `Unhandled prediction status: ${prediction.status}` },
    status: 400,
  };
}

/**
 * 从 prediction output 提取原始分析文本
 */
function extractRawAnalysis(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === 'string') {
      return first;
    }
  }

  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if (typeof obj.output === 'string') {
      return obj.output;
    }
    if (typeof obj.text === 'string') {
      return obj.text;
    }
    if (typeof obj.result === 'string') {
      return obj.result;
    }
  }

  throw new Error('Failed to extract raw analysis from prediction output');
}

/**
 * 从 prediction output 提取生成图片 URL
 */
function extractImageUrl(output: unknown): string | null {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === 'string') {
      return first;
    }
  }

  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if (typeof obj.output === 'string') {
      return obj.output;
    }
    if (typeof obj.url === 'string') {
      return obj.url;
    }
    if (typeof obj.image === 'string') {
      return obj.image;
    }
  }

  return null;
}

/**
 * 下载图片到 Buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
