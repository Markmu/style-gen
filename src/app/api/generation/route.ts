import { NextRequest, NextResponse } from "next/server";
import { findAnalysisTaskById } from "@/lib/repositories/analysis-task-repository";
import {
  createGenerationTask,
  updateGenerationTask,
  listIterations,
  getDirectionIterationFeed,
  type DirectionIterationItemRow,
} from "@/lib/repositories/generation-task-repository";
import { findById as findTemplateById } from "@/lib/repositories/template-repository";
import { auth } from "@/auth";
import { getImageGenProvider } from "@/lib/ai/providers";
import {
  resolveImageGenModel,
  UnknownModelError,
} from "@/lib/ai/model-config";
import { buildWebhookUrl, startTimeoutTimer } from "@/lib/ai/webhook-utils";
import { completeGenerationTask } from "@/lib/ai/generation-completion";
import { log, logError, logErrorDetail } from "@/lib/ai/log";
import type { ImageGenSyncResult } from "@/lib/ai/providers/types";
import { isSupportedAspectRatio } from "@/lib/generation/aspect-ratio";
import { isVisualRecipeV2Success } from "@/lib/visual-recipe";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { ResolvedModelBinding } from "@/lib/ai/model-config";
import type {
  DirectionIterationListItem,
  IterationStatusFilter,
  ImageGenProviderName,
  PromptControlSnapshot,
  StoredVisualRecipe,
  TemplateVariable,
} from "@/types/models";

/** 同步模式（fal.ai / Gemini）超时 120s（架构 §8.2，fake-timer 回归锁定） */
const SYNC_GENERATION_TIMEOUT_MS = 120_000;

/** Replicate 异步模式超时 5 分钟（架构 §8.2，提交成功后启动 timeout timer） */
const REPLICATE_ASYNC_TIMEOUT_MS = 300_000;

// ─── GET /api/generation：迭代列表（近期条与完整页面共用，架构 §6.1）────

/** status 白名单（默认 completed 兼容近期迭代条，架构 §7.3） */
const ITERATION_STATUS_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "processing",
  "completed",
  "failed",
]);

/** 方向 feed 条目 → DTO（createdAt ISO 序列化） */
function serializeDirectionItem(
  item: DirectionIterationItemRow
): DirectionIterationListItem {
  return {
    id: item.id,
    status: item.status,
    promptSummary: item.promptSummary,
    resultFileUrl: item.resultFileUrl,
    params: item.params,
    createdAt: item.createdAt.toISOString(),
    resultAssetId: item.resultAssetId,
    errorMessage: item.errorMessage,
  };
}

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

    // plan-03（ADR-5 / AC-04）: view=direction 返回当前方向分组 feed。
    // view 是白名单枚举：仅 "direction" 合法，未知值 400，不静默回退普通列表。
    const rawView = searchParams.get("view");
    if (rawView !== null) {
      if (rawView !== "direction") {
        return NextResponse.json(
          {
            error: "view must be 'direction' when provided",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }

      const analysisTaskId = searchParams.get("analysisTaskId");
      if (!analysisTaskId) {
        return NextResponse.json(
          {
            error: "analysisTaskId is required for direction view",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }

      // 方向 pageSize 仅 1-5 整数（completed 限额；active/latestFailure 恒为 1），不 clamp
      let directionPageSize = 5;
      if (rawPageSize !== null) {
        const parsed = Number(rawPageSize);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
          return NextResponse.json(
            {
              error: "direction pageSize must be an integer between 1 and 5",
              code: "INVALID_REQUEST",
              retryable: false,
            },
            { status: 400 }
          );
        }
        directionPageSize = parsed;
      }

      const startTime = Date.now();
      const feed = await getDirectionIterationFeed(
        userId,
        analysisTaskId,
        directionPageSize
      );

      log("direction_iterations_queried", {
        duration: Date.now() - startTime,
        completedCount: feed.completed.length,
        hasActive: feed.active !== null,
        hasLatestFailure: feed.latestFailure !== null,
        userId,
        analysisTaskId,
      });

      return NextResponse.json({
        completed: feed.completed.map(serializeDirectionItem),
        active: feed.active ? serializeDirectionItem(feed.active) : null,
        latestFailure: feed.latestFailure
          ? serializeDirectionItem(feed.latestFailure)
          : null,
      });
    }

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
    logErrorDetail("generation_history_list_failed", error, {
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
    /** models.json 中的稳定模型 id；缺省时服务端按配置默认模型解析 */
    model?: string;
  };
  /** plan-01（AC-02）: 工作台当前应用的 Style Memory id，可选 */
  sourceTemplateId?: string;
  /** plan-03（ADR-4）: 提交时 Prompt 控制快照，可选；结构/引用校验见 validatePromptControlSnapshot */
  promptControlSnapshot?: unknown;
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
  // plan-03（架构 §6.3/§7.3）: 画幅必须在共享白名单内（SUPPORTED_ASPECT_RATIOS SSOT）
  if (!isSupportedAspectRatio(params.aspectRatio)) return null;
  if (typeof params.quality !== "string" || !params.quality) return null;

  // model 可选；提供时必须是短横线/字母数字的模型 id（具体存在性由 models.json 解析判定）
  let model: string | undefined;
  if (params.model !== undefined) {
    if (
      typeof params.model !== "string" ||
      params.model.length === 0 ||
      params.model.length > 100 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(params.model)
    ) {
      return null;
    }
    model = params.model;
  }

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

  // promptControlSnapshot 可选；提供时必须是纯对象（完整校验依赖 Recipe，延后到 analysis 读取后）
  if (
    obj.promptControlSnapshot !== undefined &&
    (typeof obj.promptControlSnapshot !== "object" ||
      obj.promptControlSnapshot === null ||
      Array.isArray(obj.promptControlSnapshot))
  ) {
    return null;
  }

  return {
    analysisTaskId: obj.analysisTaskId,
    promptText: obj.promptText,
    negativePromptText: obj.negativePromptText,
    params: {
      aspectRatio: params.aspectRatio,
      quality: params.quality,
      ...(model !== undefined ? { model } : {}),
    },
    ...(sourceTemplateId !== undefined ? { sourceTemplateId } : {}),
    ...(obj.promptControlSnapshot !== undefined
      ? { promptControlSnapshot: obj.promptControlSnapshot }
      : {}),
  };
}

// ─── plan-03: PromptControlSnapshot 服务端校验（ADR-4 / 架构 §7.3、§8.3） ────

const SNAPSHOT_TRIGGERS: ReadonlySet<string> = new Set([
  "manual",
  "quick_recreate",
]);
const SNAPSHOT_INTENTS: ReadonlySet<string> = new Set([
  "reconstruction",
  "same_style",
]);
const SNAPSHOT_DETAIL_LEVELS: ReadonlySet<string> = new Set([
  "concise",
  "standard",
  "professional",
]);
const SNAPSHOT_EDITOR_MODES: ReadonlySet<string> = new Set([
  "variables",
  "text",
  "structured",
]);
const ADJUSTMENT_ACTIONS: ReadonlySet<string> = new Set([
  "strengthen",
  "relax",
  "replace",
  "disable",
]);
/** 快照上限（架构 §7.3）：≤20 变量、≤10 adjustments、单值 200、customTemplate 6000 */
const SNAPSHOT_MAX_VARIABLES = 20;
const SNAPSHOT_MAX_ADJUSTMENTS = 10;
const SNAPSHOT_MAX_VALUE_LENGTH = 200;
const SNAPSHOT_MAX_CUSTOM_TEMPLATE_LENGTH = 6000;

/**
 * plan-03（ADR-4 / 架构 §7.3、§8.3）: PromptControlSnapshot 结构校验。
 * 不依赖 Recipe：schemaVersion、枚举（trigger/intent/detailLevel/editorMode）、
 * 上限（≤20 变量、≤10 adjustments）、长度（单值 ≤200、customTemplate ≤6000）。
 * 合法返回同引用对象，非法返回 null。
 */
function validatePromptControlSnapshotShape(
  value: unknown
): PromptControlSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  if (obj.schemaVersion !== 1) return null;
  if (typeof obj.trigger !== "string" || !SNAPSHOT_TRIGGERS.has(obj.trigger))
    return null;
  if (typeof obj.intent !== "string" || !SNAPSHOT_INTENTS.has(obj.intent))
    return null;
  if (
    typeof obj.detailLevel !== "string" ||
    !SNAPSHOT_DETAIL_LEVELS.has(obj.detailLevel)
  )
    return null;
  if (
    typeof obj.editorMode !== "string" ||
    !SNAPSHOT_EDITOR_MODES.has(obj.editorMode)
  )
    return null;
  if (typeof obj.customPromptDirty !== "boolean") return null;

  if (!Array.isArray(obj.enabledInvariantIds)) return null;
  for (const invariantId of obj.enabledInvariantIds) {
    if (typeof invariantId !== "string") return null;
  }
  if (!Array.isArray(obj.enabledModifierNames)) return null;
  for (const modifierName of obj.enabledModifierNames) {
    if (typeof modifierName !== "string") return null;
  }

  if (
    obj.variableValues === null ||
    typeof obj.variableValues !== "object" ||
    Array.isArray(obj.variableValues)
  )
    return null;
  const variableKeys = Object.keys(obj.variableValues as Record<string, unknown>);
  if (variableKeys.length > SNAPSHOT_MAX_VARIABLES) return null;
  for (const key of variableKeys) {
    const variableValue = (obj.variableValues as Record<string, unknown>)[key];
    if (
      typeof variableValue !== "string" ||
      variableValue.length > SNAPSHOT_MAX_VALUE_LENGTH
    ) {
      return null;
    }
  }

  if (
    obj.modifierValues === null ||
    typeof obj.modifierValues !== "object" ||
    Array.isArray(obj.modifierValues)
  )
    return null;
  for (const modifierValue of Object.values(
    obj.modifierValues as Record<string, unknown>
  )) {
    if (
      typeof modifierValue !== "string" ||
      modifierValue.length > SNAPSHOT_MAX_VALUE_LENGTH
    ) {
      return null;
    }
  }

  if (!Array.isArray(obj.adjustments)) return null;
  if (obj.adjustments.length > SNAPSHOT_MAX_ADJUSTMENTS) return null;
  for (const adjustment of obj.adjustments) {
    if (!adjustment || typeof adjustment !== "object") return null;
    const adj = adjustment as Record<string, unknown>;
    if (typeof adj.invariantId !== "string") return null;
    if (typeof adj.action !== "string" || !ADJUSTMENT_ACTIONS.has(adj.action))
      return null;
    if (adj.replacementValue !== undefined) {
      if (
        typeof adj.replacementValue !== "string" ||
        adj.replacementValue.length > SNAPSHOT_MAX_VALUE_LENGTH
      ) {
        return null;
      }
    }
  }

  if (obj.customTemplate !== undefined) {
    if (
      typeof obj.customTemplate !== "string" ||
      obj.customTemplate.length > SNAPSHOT_MAX_CUSTOM_TEMPLATE_LENGTH
    ) {
      return null;
    }
  }

  return value as PromptControlSnapshot;
}

/**
 * plan-03（ADR-4）: PromptControlSnapshot 的 Recipe 引用校验。
 * invariant 引用集合取 V2 `styleInvariants`；变量名集合取 V2 `contentVariables`，
 * 回退 analysisTemplateVariables。快照不参与权限决定（模型事实 SSOT，拒绝伪造引用）。
 * 通过返回 true。
 */
function validatePromptControlSnapshotReferences(
  snapshot: PromptControlSnapshot,
  recipe: StoredVisualRecipe | null,
  analysisTemplateVariables: TemplateVariable[]
): boolean {
  const v2Recipe = isVisualRecipeV2Success(recipe) ? recipe : null;
  const invariantIds = new Set<string>(
    v2Recipe ? v2Recipe.styleInvariants.map((i) => i.id) : []
  );
  const variableNames = new Set<string>(
    v2Recipe && v2Recipe.contentVariables.length > 0
      ? v2Recipe.contentVariables.map((v) => v.name)
      : analysisTemplateVariables.map((v) => v.name)
  );

  for (const invariantId of snapshot.enabledInvariantIds) {
    if (!invariantIds.has(invariantId)) return false;
  }
  for (const key of Object.keys(snapshot.variableValues)) {
    if (!variableNames.has(key)) return false;
  }
  for (const adjustment of snapshot.adjustments) {
    if (!invariantIds.has(adjustment.invariantId)) return false;
  }
  return true;
}

/** 错误文本输出前截断（安全摘要口径，与方向 feed 一致） */
function truncateForOutput(message: string, maxLength = 200): string {
  return message.length > maxLength ? message.slice(0, maxLength) : message;
}

/** 同步模式（fal.ai / Gemini）：后台异步执行Generation Task（含 120s 超时） */
async function executeSyncGeneration(
  taskId: string,
  userId: string,
  providerResult:
    | { imageUrl: string; width: number; height: number }
    | { imageBase64: string; mimeType: string; width: number; height: number }
): Promise<void> {
  let aborted = false;

  // 使用 Promise.race 实现超时
  await Promise.race([
    completeGenerationTask({
      taskId,
      userId,
      ...providerResult,
      isAborted: () => aborted,
    }).then((completed) => {
      if (completed) {
        log("generation_completed", { taskId, status: "completed" });
      }
    }),
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

    // plan-03（架构 §8.3）: 用户级限流兜底（20 次/小时）；仅成本兜底，非跨实例幂等层
    const rateLimit = checkRateLimit(
      userId,
      "generation",
      RATE_LIMIT_CONFIGS.generation
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
        {
          error:
            "Invalid request body. Required: analysisTaskId, promptText, negativePromptText, params (aspectRatio, quality)",
          code: "INVALID_REQUEST",
          retryable: false,
        },
        { status: 400 }
      );
    }

    // 1. plan-03（ADR-4）: promptControlSnapshot 结构/枚举/上限/长度校验（不依赖 Recipe，
    //    在读取分析任务前拒绝，任务不创建、Provider 不调用）
    let promptControlSnapshot: PromptControlSnapshot | null = null;
    if (validated.promptControlSnapshot !== undefined) {
      promptControlSnapshot = validatePromptControlSnapshotShape(
        validated.promptControlSnapshot
      );
      if (promptControlSnapshot === null) {
        log("prompt_control_snapshot_rejected", {
          analysisTaskId: validated.analysisTaskId,
          userId,
          stage: "shape",
        });
        return NextResponse.json(
          {
            error: "Invalid promptControlSnapshot",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }
    }

    // 2. 校验 analysisTaskId 对应的任务存在且 status 为 completed
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

    // 2.5 plan-03（ADR-4）: 快照引用校验（invariant/变量名 ⊆ 所引用分析任务的 Recipe）
    if (
      promptControlSnapshot !== null &&
      !validatePromptControlSnapshotReferences(
        promptControlSnapshot,
        analysisTask.recipe ?? null,
        analysisTask.analysisTemplateVariables ?? []
      )
    ) {
      log("prompt_control_snapshot_rejected", {
        analysisTaskId: validated.analysisTaskId,
        userId,
        stage: "recipe_references",
      });
      return NextResponse.json(
        {
          error: "Invalid promptControlSnapshot",
          code: "INVALID_REQUEST",
          retryable: false,
        },
        { status: 400 }
      );
    }
    // trigger 取自快照；存量请求无快照时记 manual（§8.5）
    const trigger = promptControlSnapshot?.trigger ?? "manual";

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

    // 2. 解析模型 → Provider（models.json SSOT；未知模型拒绝）
    let modelResolution: ResolvedModelBinding<ImageGenProviderName>;
    try {
      modelResolution = resolveImageGenModel(validated.params.model);
    } catch (error) {
      if (error instanceof UnknownModelError) {
        return NextResponse.json(
          { error: error.message, code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      throw error;
    }
    const imageGenProvider = getImageGenProvider(modelResolution);

    log("generation_request_received", {
      taskId: "pending",
      analysisTaskId: validated.analysisTaskId,
      provider: imageGenProvider.name,
      model: modelResolution.modelId,
      providerModelId: modelResolution.providerModelId,
      trigger,
    });

    // 3. 创建 GenerationTask 记录（status: 'pending'）
    // plan-01（ADR-2）: 服务端从所引用 analysis task 固化提交时上下文快照
    // plan-03（ADR-4）: 固化 Prompt 控制快照；存量请求持久化 null
    const task = await createGenerationTask(userId, {
      analysisTaskId: validated.analysisTaskId,
      promptSnapshot: validated.promptText,
      negativePromptSnapshot: validated.negativePromptText,
      params: validated.params,
      modelName: modelResolution.providerModelId,
      provider: modelResolution.provider,
      recipeSnapshot: analysisTask.recipe ?? null,
      variablesSnapshot: analysisTask.analysisTemplateVariables ?? [],
      promptControlSnapshot,
      ...(validated.sourceTemplateId !== undefined
        ? { sourceTemplateId: validated.sourceTemplateId }
        : {}),
    });

    log("generation_task_created", {
      taskId: task.id,
      provider: imageGenProvider.name,
      modelName: task.modelName,
    });

    // 4. 更新状态为 processing
    await updateGenerationTask(task.id, { status: "processing" });

    // 5. 调用 Provider
    // plan-03（AC-07 / 架构 §6.4.3）: task 进入 processing 后，Provider 启动/提交
    // 必须位于显式 try/catch；同步抛错先 best-effort 回写 failed（安全截断摘要），
    // 再返回可重试错误；终态写入失败输出 critical 日志，不留永久 processing。
    const webhookUrl = buildWebhookUrl('generation', task.id);

    log("provider_generate_started", {
      taskId: task.id,
      provider: imageGenProvider.name,
      model: task.modelName,
    });

    let providerResult: ImageGenSyncResult | { mode: "async"; externalId: string };
    try {
      providerResult = await imageGenProvider.generate({
        prompt: validated.promptText,
        negativePrompt: validated.negativePromptText,
        aspectRatio: validated.params.aspectRatio,
        quality: validated.params.quality,
        webhookUrl,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Image provider failed to start";
      const safeSummary = truncateForOutput(errorMessage);

      log("generation_provider_start_failed", {
        taskId: task.id,
        analysisTaskId: task.analysisTaskId,
        provider: imageGenProvider.name,
        error: safeSummary,
      });

      try {
        await updateGenerationTask(task.id, {
          status: "failed",
          errorMessage: safeSummary,
        });
      } catch (writeError) {
        // 终态写入失败：critical 兜底告警（§8.5），只含任务标识/provider，不含 Prompt 全文
        logError("generation_failed_status_write_failed", {
          taskId: task.id,
          analysisTaskId: task.analysisTaskId,
          provider: imageGenProvider.name,
          error:
            writeError instanceof Error
              ? writeError.message
              : String(writeError),
        });
      }

      return NextResponse.json(
        { error: errorMessage, code: "SERVICE_UNAVAILABLE", retryable: true },
        { status: 500 }
      );
    }

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
      // Replicate 异步模式：保存 externalId + 启动超时定时器（固定 300_000ms）
      await updateGenerationTask(task.id, { externalId: providerResult.externalId });
      startTimeoutTimer(task.id, 'generation', REPLICATE_ASYNC_TIMEOUT_MS);
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
    logErrorDetail("generation_create_failed", error);
    return NextResponse.json(
      { error: message, code: "SERVICE_UNAVAILABLE", retryable: true },
      { status: 500 }
    );
  }
}
