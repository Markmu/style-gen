import { NextRequest, NextResponse } from "next/server";
import { findAnalysisTaskById } from "@/lib/repositories/analysis-task-repository";
import {
  createGenerationTask,
  updateGenerationTask,
  listIterations,
} from "@/lib/repositories/generation-task-repository";
import { findById as findTemplateById } from "@/lib/repositories/template-repository";
import { createAsset } from "@/lib/repositories/asset-repository";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";
import { auth } from "@/auth";
import { getImageGenProvider } from "@/lib/ai/providers";
import { buildWebhookUrl, startTimeoutTimer } from "@/lib/ai/webhook-utils";
import type { IterationStatusFilter } from "@/types/models";

/** fal.ai 同步模式超时 120s */
const SYNC_GENERATION_TIMEOUT_MS = 120_000;

// ─── GET /api/generation：迭代列表（近期条与完整页面共用，架构 §6.1）────

/** status 白名单（默认 completed 兼容近期迭代条，架构 §7.3） */
const ITERATION_STATUS_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "processing",
  "completed",
  "failed",
]);

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { searchParams } = request.nextUrl;
    const rawPageSize = searchParams.get("pageSize");
    const cursor = searchParams.get("cursor") ?? null;
    const rawQ = searchParams.get("q");
    const rawStatus = searchParams.get("status");

    // q: trim 后 ≤ 100 字符，超出 400，不做静默截断（架构 §8.3）
    const trimmedQ = rawQ?.trim() ?? "";
    if (trimmedQ.length > 100) {
      return NextResponse.json(
        {
          error: "q must be 100 characters or fewer after trimming",
          code: "INVALID_REQUEST",
          retryable: false,
        },
        { status: 400 }
      );
    }
    const q = trimmedQ.length > 0 ? trimmedQ : undefined;

    // status: 白名单校验；缺省默认 completed（近期迭代条兼容）
    let status: IterationStatusFilter = "completed";
    if (rawStatus !== null) {
      if (!ITERATION_STATUS_FILTERS.has(rawStatus)) {
        return NextResponse.json(
          {
            error: "status must be one of: all, processing, completed, failed",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }
      status = rawStatus as IterationStatusFilter;
    }

    // pageSize clamp 到 [1, 50]
    let pageSize = 20;
    if (rawPageSize !== null) {
      const parsed = Number(rawPageSize);
      if (Number.isFinite(parsed)) {
        pageSize = Math.max(1, Math.min(50, Math.trunc(parsed)));
      }
    }

    const startTime = Date.now();
    const result = await listIterations({ userId, q, status, cursor, pageSize });
    const duration = Date.now() - startTime;

    log("iteration_list_queried", {
      duration,
      itemCount: result.items.length,
      hasQ: Boolean(q),
      statusFilter: status,
      userId,
    });

    return NextResponse.json({
      items: result.items.map((item) => ({
        id: item.id,
        status: item.status,
        promptSummary: item.promptSummary,
        resultFileUrl: item.resultFileUrl,
        params: item.params,
        createdAt: item.createdAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    logError("generation_history_list_failed", error, {
      path: request.nextUrl.pathname,
      query: request.nextUrl.search,
    });
    return NextResponse.json(
      { error: message, code: "SERVICE_UNAVAILABLE", retryable: true },
      { status: 500 }
    );
  }
}

// ─── POST /api/generation：创建Generation Task ────────────────────────────────

interface GenerationRequestBody {
  analysisTaskId: string;
  promptText: string;
  negativePromptText: string;
  params: {
    aspectRatio: string;
    quality: string;
  };
  /** plan-01（AC-02）: 工作台当前应用的 Style Memory id，可选 */
  sourceTemplateId?: string;
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

  // sourceTemplateId 可选；提供时必须是字符串且长度合法
  let sourceTemplateId: string | undefined;
  if (obj.sourceTemplateId !== undefined) {
    if (
      typeof obj.sourceTemplateId !== "string" ||
      obj.sourceTemplateId.length === 0 ||
      obj.sourceTemplateId.length > 26
    ) {
      return null;
    }
    sourceTemplateId = obj.sourceTemplateId;
  }

  return {
    analysisTaskId: obj.analysisTaskId,
    promptText: obj.promptText,
    negativePromptText: obj.negativePromptText,
    params: {
      aspectRatio: params.aspectRatio,
      quality: params.quality,
    },
    ...(sourceTemplateId !== undefined ? { sourceTemplateId } : {}),
  };
}

/** 结构化日志输出 */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

/** 结构化错误日志输出 */
function logError(event: string, error: unknown, data: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    error: message,
    stack,
    ...data,
  }));
}

/** fal.ai 同步模式：后台异步执行Generation Task（含 120s 超时） */
async function executeSyncGeneration(
  taskId: string,
  userId: string,
  providerResult: { imageUrl: string; width: number; height: number }
): Promise<void> {
  let aborted = false;

  // 使用 Promise.race 实现超时
  await Promise.race([
    executeSyncGenerationCore(taskId, userId, providerResult, () => aborted),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        aborted = true;
        reject(new Error("Generation timed out after 120s"));
      }, SYNC_GENERATION_TIMEOUT_MS);
      // 允许进程正常退出
      if (timer.unref) {
        timer.unref();
      }
    }),
  ]);
}

/** fal.ai 同步模式核心逻辑 */
async function executeSyncGenerationCore(
  taskId: string,
  userId: string,
  providerResult: { imageUrl: string; width: number; height: number },
  isAborted: () => boolean
): Promise<void> {
  // Download临时图片，上传到 R2
  const r2Key = `generated/${taskId}/result.webp`;
  const imageResponse = await fetch(providerResult.imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  await uploadBuffer(r2Key, imageBuffer, "image/webp");

  // 超时后不再继续更新状态
  if (isAborted()) return;

  // 创建 Asset 记录
  const asset = await createAsset(userId, {
    type: "generated",
    fileUrl: getPublicUrl(r2Key),
    thumbnailUrl: null,
    width: providerResult.width,
    height: providerResult.height,
    mimeType: "image/webp",
  });

  // 最终检查 aborted 状态，避免覆盖 failed 状态
  if (isAborted()) return;

  // 更新 GenerationTask 为 completed
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

    // 1.5 plan-01: sourceTemplateId 服务端归属校验（架构 §8.3）
    if (validated.sourceTemplateId) {
      const sourceTemplate = await findTemplateById(
        validated.sourceTemplateId,
        userId
      );
      if (!sourceTemplate) {
        return NextResponse.json(
          { error: "Invalid source template", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
    }

    // 2. 获取 Provider
    const imageGenProvider = getImageGenProvider();

    log("generation_request_received", {
      taskId: "pending",
      analysisTaskId: validated.analysisTaskId,
      provider: imageGenProvider.name,
    });

    // 3. 创建 GenerationTask 记录（status: 'pending'）
    // plan-01（ADR-2）: 服务端从所引用 analysis task 固化提交时上下文快照
    const task = await createGenerationTask(userId, {
      analysisTaskId: validated.analysisTaskId,
      promptSnapshot: validated.promptText,
      negativePromptSnapshot: validated.negativePromptText,
      params: validated.params,
      modelName: imageGenProvider.name === 'replicate' ? 'black-forest-labs/flux-2-dev' : 'flux.2',
      provider: imageGenProvider.name,
      recipeSnapshot: analysisTask.recipe ?? null,
      variablesSnapshot: analysisTask.analysisTemplateVariables ?? [],
      ...(validated.sourceTemplateId !== undefined
        ? { sourceTemplateId: validated.sourceTemplateId }
        : {}),
    });

    log("generation_task_created", {
      taskId: task.id,
      provider: imageGenProvider.name,
      modelName: imageGenProvider.name === 'replicate' ? 'black-forest-labs/flux-2-dev' : 'flux.2',
    });

    // 4. 更新状态为 processing
    await updateGenerationTask(task.id, { status: "processing" });

    // 5. 调用 Provider
    const webhookUrl = buildWebhookUrl('generation', task.id);

    log("provider_generate_started", {
      taskId: task.id,
      provider: imageGenProvider.name,
      model: task.modelName,
      mode: 'async',
    });

    const providerResult = await imageGenProvider.generate({
      prompt: validated.promptText,
      negativePrompt: validated.negativePromptText,
      aspectRatio: validated.params.aspectRatio,
      quality: validated.params.quality,
      webhookUrl,
    });

    log("provider_generate_completed", {
      taskId: task.id,
      provider: imageGenProvider.name,
      mode: providerResult.mode,
    });

    // 6. 根据 Provider 返回模式分支处理
    if (providerResult.mode === 'sync') {
      // fal.ai 同步模式：保留原有 fire-and-forget 逻辑
      void executeSyncGeneration(task.id, userId, providerResult).catch(async (err) => {
        const errorMessage = err instanceof Error ? err.message : "Unknown generation error";
        log("generation_failed", { taskId: task.id, reason: errorMessage });
        await updateGenerationTask(task.id, {
          status: "failed",
          errorMessage,
        });
      });
    } else {
      // Replicate 异步模式：保存 externalId + 启动超时定时器
      await updateGenerationTask(task.id, { externalId: providerResult.externalId });
      startTimeoutTimer(task.id, 'generation', 5 * 60 * 1000);
      log("generation_async_submitted", {
        taskId: task.id,
        externalId: providerResult.externalId,
      });
    }

    // 7. 立即返回 taskId 和 status
    return NextResponse.json(
      { id: task.id, status: "processing" },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    logError("generation_create_failed", error);
    return NextResponse.json(
      { error: message, code: "SERVICE_UNAVAILABLE", retryable: true },
      { status: 500 }
    );
  }
}
