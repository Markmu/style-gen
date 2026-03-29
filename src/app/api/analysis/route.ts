import { NextRequest, NextResponse } from "next/server";
import {
  createAnalysisTask,
  updateAnalysisTask,
} from "@/lib/repositories/analysis-task-repository";
import { upsertAsset } from "@/lib/repositories/asset-repository";
import { analyzeImage, VisionError } from "@/lib/ai/vision";
import { structureAnalysis, StructurerError } from "@/lib/ai/structurer";

/** 整体超时 60 秒 */
const OVERALL_TIMEOUT_MS = 60_000;

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

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
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
    const asset = await upsertAsset(validated.assetId, {
      fileUrl: validated.fileUrl,
      width: validated.width,
      height: validated.height,
      mimeType: validated.mimeType,
    });

    // 2. 创建 AnalysisTask 记录（status: 'pending'）
    let task = await createAnalysisTask({
      sourceAssetId: asset.id,
    });

    log("analysis_task_created", { taskId: task.id, assetId: asset.id });

    // 3. 更新任务状态为 'processing'
    task = await updateAnalysisTask(task.id, { status: "processing" });

    // 4. 带整体超时的两阶段 AI 分析
    try {
      const result = await Promise.race([
        executeAnalysisPipeline(validated.fileUrl, task.id, validated.mimeType),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Overall analysis timed out after 60s")),
            OVERALL_TIMEOUT_MS
          )
        ),
      ]);

      log("analysis_completed", { taskId: task.id, duration: Date.now() - startTime, status: "completed" });

      return NextResponse.json(result);
    } catch (error) {
      // 超时或未预期错误
      if (error instanceof Error && error.message.includes("timed out after 60s")) {
        const failedTask = await updateAnalysisTask(task.id, {
          status: "failed",
          errorMessage: "Analysis timed out after 60s",
          errorStage: "vision",
        });

        log("analysis_failed", { taskId: task.id, duration: Date.now() - startTime, reason: "timeout" });

        return NextResponse.json(
          { ...failedTask, error: "Analysis timed out after 60s", code: "ANALYSIS_TIMEOUT", retryable: true },
          { status: 500 }
        );
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    log("analysis_failed", { duration: Date.now() - startTime, reason: message });

    return NextResponse.json({ error: message, code: "SERVICE_UNAVAILABLE", retryable: true }, { status: 500 });
  }
}

/** 执行两阶段分析管线 */
async function executeAnalysisPipeline(fileUrl: string, taskId: string, mimeType: string) {
  // 阶段 1：视觉理解
  let rawAnalysis: string;
  try {
    log("vision_call_started", { taskId });
    const visionStartTime = Date.now();
    rawAnalysis = await analyzeImage(fileUrl, mimeType);
    log("vision_call_completed", { taskId, duration: Date.now() - visionStartTime });
  } catch (error) {
    // 视觉模型失败：任务标记 failed，errorStage: 'vision'
    const errorMessage =
      error instanceof VisionError ? error.message : "Vision analysis failed";

    log("vision_call_failed", { taskId, error: errorMessage });

    const failedTask = await updateAnalysisTask(taskId, {
      status: "failed",
      errorMessage,
      errorStage: "vision",
    });
    return failedTask;
  }

  // 阶段 2：LLM 结构化整理
  try {
    log("structurer_call_started", { taskId });
    const structStartTime = Date.now();
    const structured = await structureAnalysis(rawAnalysis);
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
