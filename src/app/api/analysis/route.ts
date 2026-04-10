import { NextRequest, NextResponse } from "next/server";
import {
  createAnalysisTask,
  updateAnalysisTask,
  findAnalysisTaskByIdInternal,
} from "@/lib/repositories/analysis-task-repository";
import { upsertAsset } from "@/lib/repositories/asset-repository";
import { structureAnalysis, StructurerError } from "@/lib/ai/structurer";
import { getVisionProvider } from "@/lib/ai/providers";
import { buildWebhookUrl } from "@/lib/ai/webhook-utils";
import { auth } from "@/auth";

/** Replicate 异步模式超时 5 分钟 */
const REPLICATE_TIMEOUT_MS = 5 * 60 * 1000;

interface AnalysisRequestBody {
  assetId: string;
  fileUrl: string;
  width: number;
  height: number;
  mimeType: string;
}

/** 校验请求体 */
function validateBody(body: unknown): AnalysisRequestBody | null {
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;

  if (typeof obj.assetId !== "string" || !obj.assetId) return null;
  if (typeof obj.fileUrl !== "string" || !obj.fileUrl) return null;
  if (typeof obj.width !== "number" || obj.width <= 0) return null;
  if (typeof obj.height !== "number" || obj.height <= 0) return null;
  if (typeof obj.mimeType !== "string" || !obj.mimeType) return null;

  return {
    assetId: obj.assetId,
    fileUrl: obj.fileUrl,
    width: obj.width,
    height: obj.height,
    mimeType: obj.mimeType,
  };
}

/** 结构化日志输出 */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

/**
 * 启动超时定时器
 * 用于 Replicate 异步模式：5 分钟后检查任务状态，仍未 processing 则标记 failed
 */
function startTimeoutTimer(taskId: string, timeoutMs: number): void {
  const timer = setTimeout(async () => {
    try {
      const task = await findAnalysisTaskByIdInternal(taskId);
      if (task && task.status === 'processing') {
        await updateAnalysisTask(taskId, {
          status: 'failed',
          errorMessage: `Webhook callback not received within ${timeoutMs / 1000}s`,
          errorStage: 'vision',
        });
        log('analysis_timeout', { taskId, timeoutMs });
      }
    } catch (error) {
      log('analysis_timeout_check_failed', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, timeoutMs);

  // 允许 Node.js 进程正常退出
  if (timer.unref) timer.unref();
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 认证：从 session 获取 userId
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const body: unknown = await request.json();
    const validated = validateBody(body);

    if (!validated) {
      return NextResponse.json(
        { error: "Invalid request body. Required: assetId, fileUrl, width, height, mimeType", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    log("analysis_request_received", { assetId: validated.assetId });

    // 1. 创建 Asset 记录（type: 'reference'）
    const asset = await upsertAsset(userId, validated.assetId, {
      fileUrl: validated.fileUrl,
      width: validated.width,
      height: validated.height,
      mimeType: validated.mimeType,
    });

    // 2. 获取 VisionProvider
    const visionProvider = getVisionProvider();
    log("vision_provider_selected", {
      provider: visionProvider.name,
      userId,
      assetId: validated.assetId,
    });

    // 3. 创建 AnalysisTask 记录（status: 'pending'）
    let task = await createAnalysisTask(userId, {
      sourceAssetId: asset.id,
      provider: visionProvider.name,
      modelName: visionProvider.name === 'replicate' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash',
    });

    log("analysis_task_created", { taskId: task.id, assetId: asset.id, provider: visionProvider.name });

    // 4. 更新任务状态为 'processing'
    task = await updateAnalysisTask(task.id, { status: "processing" });

    // 5. 调用 Provider 分析
    const webhookUrl = buildWebhookUrl('analysis', task.id);
    const providerStartTime = Date.now();

    log("vision_provider_call_started", {
      taskId: task.id,
      provider: visionProvider.name,
      model: task.modelName,
    });

    try {
      const result = await visionProvider.analyze({
        imageUrl: validated.fileUrl,
        mimeType: validated.mimeType,
        webhookUrl,
      });

      const providerDuration = Date.now() - providerStartTime;
      log("vision_provider_call_completed", {
        taskId: task.id,
        provider: visionProvider.name,
        mode: result.mode,
        duration: providerDuration,
      });

      // 6. 根据模式分支处理
      if (result.mode === 'sync') {
        // Gemini 同步模式：保留原有两阶段管线逻辑
        const syncResult = await executeSyncPipeline(task.id, result.result, validated.fileUrl, validated.mimeType);
        log("analysis_completed", {
          taskId: task.id,
          duration: Date.now() - startTime,
          status: "completed",
          mode: 'sync',
        });
        return NextResponse.json(syncResult);
      }

      // Replicate 异步模式：保存 externalId + 启动超时定时器 + 立即返回
      await updateAnalysisTask(task.id, { externalId: result.externalId });
      startTimeoutTimer(task.id, REPLICATE_TIMEOUT_MS);

      log("analysis_task_submitted", {
        taskId: task.id,
        externalId: result.externalId,
        duration: Date.now() - startTime,
        mode: 'async',
      });

      return NextResponse.json(
        { id: task.id, status: 'processing' },
        { status: 201 }
      );
    } catch (error) {
      // Provider 调用失败
      const errorMessage = error instanceof Error ? error.message : "Vision provider call failed";
      log("vision_provider_call_failed", {
        taskId: task.id,
        provider: visionProvider.name,
        error: errorMessage,
      });

      const failedTask = await updateAnalysisTask(task.id, {
        status: "failed",
        errorMessage,
        errorStage: "vision",
      });

      return NextResponse.json(
        { ...failedTask, error: errorMessage, code: "VISION_PROVIDER_ERROR", retryable: true },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    log("analysis_failed", { duration: Date.now() - startTime, reason: message });

    return NextResponse.json({ error: message, code: "SERVICE_UNAVAILABLE", retryable: true }, { status: 500 });
  }
}

/**
 * 执行同步模式的两阶段分析管线
 * 直接接收视觉分析结果文本（Gemini 模式）
 */
async function executeSyncPipeline(taskId: string, rawAnalysis: string, imageUrl?: string, mimeType?: string) {
  // 阶段 2：LLM 结构化整理
  try {
    log("structurer_call_started", { taskId });
    const structStartTime = Date.now();
    const structured = await structureAnalysis(rawAnalysis, {
      taskId,
      source: "analysis_route",
      ...(imageUrl ? { imageUrl, mimeType } : {}),
    });
    log("structurer_call_completed", { taskId, duration: Date.now() - structStartTime });

    // 成功：保存 recipe、promptText、negativePromptText、rawResponse
    const completedTask = await updateAnalysisTask(taskId, {
      status: "completed",
      recipe: structured.recipe,
      promptText: structured.promptText,
      negativePromptText: structured.negativePromptText,
      rawResponse: rawAnalysis,
    });

    return completedTask;
  } catch (error) {
    // L3 降级：LLM 失败时降级返回原始视觉分析
    if (error instanceof StructurerError) {
      log("structurer_call_failed", { taskId, error: error.message, degraded: true });

      const degradedTask = await updateAnalysisTask(taskId, {
        status: "completed",
        recipe: null,
        promptText: rawAnalysis,
        negativePromptText: "",
        rawResponse: rawAnalysis,
        errorMessage: error.message,
        errorStage: "llm",
      });
      return degradedTask;
    }

    // 其他未预期错误也走降级
    const errorMessage =
      error instanceof Error ? error.message : "Unknown structurer error";

    log("structurer_call_failed", { taskId, error: errorMessage, degraded: true });

    const degradedTask = await updateAnalysisTask(taskId, {
      status: "completed",
      recipe: null,
      promptText: rawAnalysis,
      negativePromptText: "",
      rawResponse: rawAnalysis,
      errorMessage,
      errorStage: "llm",
    });
    return degradedTask;
  }
}
