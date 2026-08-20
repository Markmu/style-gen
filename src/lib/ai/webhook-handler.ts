import { validateWebhook } from 'replicate';
import { findAnalysisTaskByIdInternal, updateAnalysisTask } from '@/lib/repositories/analysis-task-repository';
import { findGenerationTaskByIdInternal, updateGenerationTask } from '@/lib/repositories/generation-task-repository';
import { findAssetById } from '@/lib/repositories/asset-repository';
import { structureAnalysis, StructurerError } from './structurer';
import { toAnalysisCompletionUpdate, toAnalysisFallbackUpdate } from './analysis-completion';
import { completeGenerationTask } from './generation-completion';
import { log, logError } from './log';

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

function summarizeOutput(output: unknown): Record<string, unknown> {
  if (typeof output === 'string') {
    return {
      outputType: 'string',
      outputLength: output.length,
      outputPreview: output.replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  }

  if (Array.isArray(output)) {
    const first = output[0];
    return {
      outputType: 'array',
      outputLength: output.length,
      firstItemType: typeof first,
      firstItemPreview:
        typeof first === 'string'
          ? first.replace(/\s+/g, ' ').trim().slice(0, 120)
          : null,
    };
  }

  if (output && typeof output === 'object') {
    return {
      outputType: 'object',
      outputKeys: Object.keys(output as Record<string, unknown>),
    };
  }

  return {
    outputType: output === null ? 'null' : typeof output,
  };
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

  log('webhook_received', {
    taskId,
    taskType,
    signatureValid,
  });

  // 签名验证失败
  if (!webhookSecret) {
    logError('webhook_signature_validation_failed', {
      taskId,
      taskType,
      reason: 'REPLICATE_WEBHOOK_SECRET not configured',
    });
    return {
      response: { ok: false, message: 'Webhook secret not configured' },
      status: 500,
    };
  }

  if (!signatureValid) {
    logError('webhook_signature_validation_failed', {
      taskId,
      taskType,
      reason: 'Invalid signature',
    });
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
    logError('webhook_payload_parse_failed', {
      taskId,
      taskType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
      log('webhook_analysis_processed', {
        taskId,
        status: prediction.status,
        duration,
        result,
      });
      return result;
    } else if (taskType === 'generation') {
      const result = await handleGenerationWebhook(taskId, prediction);
      const duration = Date.now() - startTime;
      log('webhook_generation_processed', {
        taskId,
        status: prediction.status,
        duration,
        result,
      });
      return result;
    } else {
      return {
        response: { ok: false, message: 'Invalid taskType' },
        status: 400,
      };
    }
  } catch (error) {
    logError('webhook_processing_failed', {
      taskId,
      taskType,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
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
    log('webhook_analysis_prediction_succeeded', {
      taskId,
      predictionId: prediction.id,
      ...summarizeOutput(prediction.output),
    });

    // 提取视觉分析结果文本
    const rawAnalysis = extractRawAnalysis(prediction.output);
    log('webhook_analysis_raw_extracted', {
      taskId,
      predictionId: prediction.id,
      rawAnalysisLength: rawAnalysis.length,
      rawAnalysisPreview: rawAnalysis.replace(/\s+/g, ' ').trim().slice(0, 120),
    });

    try {
      // 查询原始图片，传给 Structurer 做交叉验证
      const asset = task.sourceAssetId ? await findAssetById(task.sourceAssetId) : null;

      // 同步调用 Gemini 结构化整理
      const structStartTime = Date.now();
      log('webhook_analysis_structurer_started', { taskId, predictionId: prediction.id });
      const structured = await structureAnalysis(rawAnalysis, {
        taskId,
        source: 'analysis_webhook',
        ...(asset ? { imageUrl: asset.fileUrl, mimeType: asset.mimeType } : {}),
      });
      const analysisTemplateVariables = structured.analysisTemplateVariables ?? [];
      const analysisTemplateStatus = structured.analysisTemplateStatus ?? 'fallback';
      const analysisTemplateReason = structured.analysisTemplateReason ?? null;
      log('webhook_analysis_structurer_completed', {
        taskId,
        predictionId: prediction.id,
        duration: Date.now() - structStartTime,
        promptLength: structured.promptText.length,
        negativePromptLength: structured.negativePromptText.length,
        templateStatus: analysisTemplateStatus,
        templateVariableCount: analysisTemplateVariables.length,
        templateFallbackReason: analysisTemplateReason,
      });

      // 更新任务为Done状态
      await updateAnalysisTask(
        taskId,
        toAnalysisCompletionUpdate(structured, rawAnalysis),
      );

      return {
        response: { ok: true, message: 'Analysis completed successfully' },
        status: 200,
      };
    } catch (error) {
      // L3 降级：结构化失败时保存原始分析文本
      if (error instanceof StructurerError) {
        logError('webhook_analysis_structurer_failed', {
          taskId,
          predictionId: prediction.id,
          errorName: error.name,
          error: error.message,
          fallbackApplied: true,
        });
        await updateAnalysisTask(
          taskId,
          toAnalysisFallbackUpdate(rawAnalysis, error.message),
        );
        log('webhook_analysis_fallback_saved', {
          taskId,
          predictionId: prediction.id,
          errorStage: 'llm',
          promptLength: rawAnalysis.length,
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
 * 处理Generation Task Webhook 回调
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
      const userId = task.userId;
      if (!userId) {
        throw new Error('Task missing userId');
      }

      // Download Image、转存 R2、创建 Asset 并更新任务为Done状态
      await completeGenerationTask({
        taskId,
        userId,
        imageUrl,
        width: 1024, // 默认尺寸，实际应该从图片元数据获取
        height: 1024,
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
  const segments = extractTextSegments(output);
  if (segments.length > 0) {
    return segments.join('\n');
  }
  throw new Error('Failed to extract raw analysis from prediction output');
}

function extractTextSegments(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextSegments(item));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['output', 'text', 'result']) {
      const segments = extractTextSegments(obj[key]);
      if (segments.length > 0) {
        return segments;
      }
    }
  }

  return [];
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
