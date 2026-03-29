import { NextRequest, NextResponse } from "next/server";
import { findAnalysisTaskById } from "@/lib/repositories/analysis-task-repository";
import {
  createGenerationTask,
  updateGenerationTask,
} from "@/lib/repositories/generation-task-repository";
import { createAsset } from "@/lib/repositories/asset-repository";
import { generateImage, ImageGenError } from "@/lib/ai/image-gen";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";
import { auth } from "@/auth";

/** 生成超时 120 秒 */
const GENERATION_TIMEOUT_MS = 120_000;

interface GenerationRequestBody {
  analysisTaskId: string;
  promptText: string;
  negativePromptText: string;
  params: {
    aspectRatio: string;
    quality: string;
  };
}

/** 校验请求体 */
function validateBody(body: unknown): GenerationRequestBody | null {
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;

  if (typeof obj.analysisTaskId !== "string" || !obj.analysisTaskId) return null;
  if (typeof obj.promptText !== "string" || !obj.promptText) return null;
  if (typeof obj.negativePromptText !== "string") return null;

  if (!obj.params || typeof obj.params !== "object") return null;
  const params = obj.params as Record<string, unknown>;
  if (typeof params.aspectRatio !== "string" || !params.aspectRatio) return null;
  if (typeof params.quality !== "string" || !params.quality) return null;

  return {
    analysisTaskId: obj.analysisTaskId,
    promptText: obj.promptText,
    negativePromptText: obj.negativePromptText,
    params: {
      aspectRatio: params.aspectRatio,
      quality: params.quality,
    },
  };
}

/** 结构化日志输出 */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

/** 后台异步执行生成任务（含 120s 超时） */
async function executeGeneration(
  taskId: string,
  userId: string,
  params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
  }
): Promise<void> {
  // a. 更新任务状态为 processing
  await updateGenerationTask(taskId, { status: "processing" });

  let aborted = false;

  // 使用 Promise.race 实现超时
  await Promise.race([
    executeGenerationCore(taskId, userId, params, () => aborted),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        aborted = true;
        reject(new Error("Generation timed out after 120s"));
      }, GENERATION_TIMEOUT_MS);
      // 允许进程正常退出
      if (timer.unref) {
        timer.unref();
      }
    }),
  ]);
}

/** 生成核心逻辑 */
async function executeGenerationCore(
  taskId: string,
  userId: string,
  params: {
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    quality: string;
  },
  isAborted: () => boolean
): Promise<void> {

  // b. 调用生图模型
  log("image_gen_call_started", { taskId });
  const genStartTime = Date.now();
  const result = await generateImage({
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    aspectRatio: params.aspectRatio,
    quality: params.quality,
  });
  log("image_gen_call_completed", { taskId, duration: Date.now() - genStartTime });

  // 超时后不再继续更新状态
  if (isAborted()) return;

  // c. 下载临时图片，上传到 R2
  const r2Key = `generated/${taskId}/result.webp`;
  const imageResponse = await fetch(result.imageUrl);
  if (!imageResponse.ok) {
    throw new ImageGenError(
      `Failed to download generated image: ${imageResponse.status}`
    );
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  await uploadBuffer(r2Key, imageBuffer, "image/webp");

  // 再次检查 aborted 状态
  if (isAborted()) return;

  // d. 创建 Asset 记录
  const asset = await createAsset(userId, {
    type: "generated",
    fileUrl: getPublicUrl(r2Key),
    thumbnailUrl: null,
    width: result.width,
    height: result.height,
    mimeType: "image/webp",
  });

  // 最终检查 aborted 状态，避免覆盖 failed 状态
  if (isAborted()) return;

  // e. 更新 GenerationTask 为 completed
  await updateGenerationTask(taskId, {
    status: "completed",
    resultAssetId: asset.id,
  });

  log("generation_completed", { taskId, status: "completed" });
}

export async function POST(request: NextRequest) {
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
        {
          error:
            "Invalid request body. Required: analysisTaskId, promptText, negativePromptText, params (aspectRatio, quality)",
          code: "INVALID_REQUEST",
          retryable: false,
        },
        { status: 400 }
      );
    }

    // 1. 校验 analysisTaskId 对应的任务存在且 status 为 completed
    const analysisTask = await findAnalysisTaskById(validated.analysisTaskId, userId);
    if (!analysisTask) {
      return NextResponse.json(
        { error: "Analysis task not found", code: "NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }
    if (analysisTask.status !== "completed") {
      return NextResponse.json(
        { error: "Analysis task is not completed", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 2. 创建 GenerationTask 记录（status: 'pending'）
    const task = await createGenerationTask(userId, {
      analysisTaskId: validated.analysisTaskId,
      promptSnapshot: validated.promptText,
      negativePromptSnapshot: validated.negativePromptText,
      params: validated.params,
      modelName: "flux.2",
    });

    log("generation_request_received", { taskId: task.id, analysisTaskId: validated.analysisTaskId });
    log("generation_task_created", { taskId: task.id });

    // 3. 立即返回 taskId 和 status
    const response = NextResponse.json(
      { id: task.id, status: task.status },
      { status: 201 }
    );

    // 4. 后台异步执行（fire-and-forget）
    void executeGeneration(task.id, userId, {
      prompt: validated.promptText,
      negativePrompt: validated.negativePromptText,
      aspectRatio: validated.params.aspectRatio,
      quality: validated.params.quality,
    }).catch(async (err: unknown) => {
      // 失败时更新任务状态
      const errorMessage =
        err instanceof Error ? err.message : "Unknown generation error";

      log("generation_failed", { taskId: task.id, reason: errorMessage });

      await updateGenerationTask(task.id, {
        status: "failed",
        errorMessage,
      });
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message, code: "SERVICE_UNAVAILABLE", retryable: true }, { status: 500 });
  }
}
