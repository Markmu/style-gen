import { NextRequest, NextResponse } from "next/server";
import {
  createAnalysisTask,
  updateAnalysisTask,
} from "@/lib/repositories/analysis-task-repository";
import {
  upsertAsset,
  findAssetByIdForUser,
} from "@/lib/repositories/asset-repository";
import { structureAnalysis } from "@/lib/ai/structurer";
import {
  toAnalysisCompletionUpdate,
  toAnalysisFallbackUpdate,
} from "@/lib/ai/analysis-completion";
import { getVisionProvider } from "@/lib/ai/providers";
import { resolveVisionModel } from "@/lib/ai/model-config";
import { buildWebhookUrl, startTimeoutTimer } from "@/lib/ai/webhook-utils";
import { log } from "@/lib/ai/log";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { auth } from "@/auth";

/** Replicate 异步模式超时 5 分钟 */
const REPLICATE_TIMEOUT_MS = 5 * 60 * 1000;

/** 允许直接进入分析管线的图片 MIME（与 assets 表 mime_type CHECK 一致） */
const ANALYSIS_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * plan-03（ADR-6 / 架构 §6.6、§7.3）: 判别联合请求体。
 * - 上传模式：assetId/fileUrl/width/height/mimeType 均为 frontend_computed（既有契约）；
 * - 已有资产模式：仅接受 sourceAssetId，元数据全部由服务端按 userId 派生，
 *   混入任何客户端元数据字段一律 400，防止越权或元数据伪造。
 */
type AnalysisRequestBody =
  | {
      mode: "upload";
      assetId: string;
      fileUrl: string;
      width: number;
      height: number;
      mimeType: string;
    }
  | {
      mode: "existing_asset";
      sourceAssetId: string;
    };

/** 上传模式独有字段；已有资产模式下出现任意一个即视为非法联合 */
const UPLOAD_ONLY_FIELDS = [
  "assetId",
  "fileUrl",
  "width",
  "height",
  "mimeType",
] as const;

/** 校验请求体（判别联合） */
function validateBody(body: unknown): AnalysisRequestBody | null {
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;

  if (obj.sourceAssetId !== undefined) {
    // 已有资产模式：仅接受 sourceAssetId，拒绝混入任何客户端元数据
    if (
      typeof obj.sourceAssetId !== "string" ||
      obj.sourceAssetId.length === 0 ||
      obj.sourceAssetId.length > 26
    ) {
      return null;
    }
    if (UPLOAD_ONLY_FIELDS.some((field) => obj[field] !== undefined)) {
      return null;
    }
    return { mode: "existing_asset", sourceAssetId: obj.sourceAssetId };
  }

  if (typeof obj.assetId !== "string" || !obj.assetId) return null;
  if (typeof obj.fileUrl !== "string" || !obj.fileUrl) return null;
  if (typeof obj.width !== "number" || obj.width <= 0) return null;
  if (typeof obj.height !== "number" || obj.height <= 0) return null;
  if (typeof obj.mimeType !== "string" || !obj.mimeType) return null;

  return {
    mode: "upload",
    assetId: obj.assetId,
    fileUrl: obj.fileUrl,
    width: obj.width,
    height: obj.height,
    mimeType: obj.mimeType,
  };
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

    // plan-03（架构 §8.3）: 用户级限流（10 次/小时），超限不读 Provider 不建任务
    const rateLimit = checkRateLimit(
      userId,
      "analysis",
      RATE_LIMIT_CONFIGS.analysis
    );
    if (rateLimit && !rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", code: "RATE_LIMITED", retryable: true },
        { status: 429 }
      );
    }

    const body: unknown = await request.json();
    const validated = validateBody(body);

    if (!validated) {
      return NextResponse.json(
        { error: "Invalid request body. Required: assetId, fileUrl, width, height, mimeType or sourceAssetId", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 1. 解析来源 Asset（上传模式 upsert；已有资产模式服务端按 userId 读取，不复制不改类型）
    let sourceAsset: { id: string; fileUrl: string; mimeType: string };
    if (validated.mode === "existing_asset") {
      // plan-03（ADR-6）: 元数据全部服务端派生；不存在/不归属统一 404，不泄露存在性
      const asset = await findAssetByIdForUser(validated.sourceAssetId, userId);
      if (!asset) {
        return NextResponse.json(
          { error: "Source asset not found", code: "NOT_FOUND", retryable: false },
          { status: 404 }
        );
      }
      if (!ANALYSIS_IMAGE_MIME_TYPES.has(asset.mimeType)) {
        return NextResponse.json(
          { error: "Source asset is not a supported image", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }

      log("analysis_existing_asset_started", {
        assetId: asset.id,
        userId,
        assetType: asset.type,
      });

      sourceAsset = {
        id: asset.id,
        fileUrl: asset.fileUrl,
        mimeType: asset.mimeType,
      };
    } else {
      log("analysis_request_received", { assetId: validated.assetId });

      const asset = await upsertAsset(userId, validated.assetId, {
        fileUrl: validated.fileUrl,
        width: validated.width,
        height: validated.height,
        mimeType: validated.mimeType,
      });
      sourceAsset = {
        id: asset.id,
        fileUrl: validated.fileUrl,
        mimeType: validated.mimeType,
      };
    }

    // 2. 解析视觉模型 → VisionProvider（models.json SSOT）
    const visionResolution = resolveVisionModel();
    const visionProvider = getVisionProvider(visionResolution);
    log("vision_provider_selected", {
      provider: visionProvider.name,
      model: visionResolution.providerModelId,
      userId,
      assetId: sourceAsset.id,
    });

    // 3. 创建 AnalysisTask 记录（status: 'pending'）
    let task = await createAnalysisTask(userId, {
      sourceAssetId: sourceAsset.id,
      provider: visionProvider.name,
      modelName: visionResolution.providerModelId,
    });

    log("analysis_task_created", { taskId: task.id, assetId: sourceAsset.id, provider: visionProvider.name });

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
        imageUrl: sourceAsset.fileUrl,
        mimeType: sourceAsset.mimeType,
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
        const syncResult = await executeSyncPipeline(task.id, result.result, sourceAsset.fileUrl, sourceAsset.mimeType);
        log("analysis_completed", {
          taskId: task.id,
          duration: Date.now() - startTime,
          status: "completed",
          mode: 'sync',
          templateStatus: syncResult.analysisTemplateStatus,
          templateVariableCount: syncResult.analysisTemplateVariables.length,
          templateFallbackReason: syncResult.analysisTemplateReason,
        });
        return NextResponse.json(syncResult);
      }

      // Replicate 异步模式：保存 externalId + 启动超时定时器 + 立即返回
      await updateAnalysisTask(task.id, { externalId: result.externalId });
      startTimeoutTimer(task.id, 'analysis', REPLICATE_TIMEOUT_MS, {
        timeoutMessage: `Webhook callback not received within ${REPLICATE_TIMEOUT_MS / 1000}s`,
        timeoutEvent: 'analysis_timeout',
      });

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
  // 阶段 2：LLM Structuring整理
  try {
    log("structurer_call_started", { taskId });
    const structStartTime = Date.now();
    const structured = await structureAnalysis(rawAnalysis, {
      taskId,
      source: "analysis_route",
      ...(imageUrl ? { imageUrl, mimeType } : {}),
    });
    log("structurer_call_completed", {
      taskId,
      duration: Date.now() - structStartTime,
      templateStatus: structured.analysisTemplateStatus,
      templateVariableCount: structured.analysisTemplateVariables.length,
      templateFallbackReason: structured.analysisTemplateReason,
    });

    // 成功：保存 recipe、promptText、negativePromptText、rawResponse
    const completedTask = await updateAnalysisTask(
      taskId,
      toAnalysisCompletionUpdate(structured, rawAnalysis),
    );

    return completedTask;
  } catch (error) {
    // L3 降级：LLM 失败（含未预期错误）时降级返回原始视觉分析
    const errorMessage =
      error instanceof Error ? error.message : "Unknown structurer error";

    log("structurer_call_failed", { taskId, error: errorMessage, degraded: true });

    return await updateAnalysisTask(
      taskId,
      toAnalysisFallbackUpdate(rawAnalysis, errorMessage),
    );
  }
}
