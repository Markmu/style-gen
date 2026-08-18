import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createTemplate,
  findByName,
  findAllByUserId,
} from "@/lib/repositories/template-repository";
import { findAnalysisTaskById } from "@/lib/repositories/analysis-task-repository";
import {
  findGenerationTaskById,
  linkTemplateToGenerationTask,
} from "@/lib/repositories/generation-task-repository";
import { findAssetById } from "@/lib/repositories/asset-repository";
import { normalizeVariableName } from "@/lib/template-parser";
import type { TemplateVariable } from "@/types/models";

/** 从 session 获取 userId，未认证返回 401 */
async function requireAuth(_request: Request): Promise<{ userId: string } | Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }
  return { userId: session.user.id };
}

/** 结构化日志 [架构8.5 可观测性] */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

// ─── Rate Limit：内存级滑动窗口计数器（30 times/小时/IP）[架构8.3] ───

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): Response | null {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + 3600000 });
    return null;
  }

  if (entry.count >= 30) {
    return NextResponse.json(
      { error: "Too Many Requests", code: "RATE_LIMITED", retryable: true },
      { status: 429 }
    );
  }

  entry.count++;
  return null;
}

// ─── 请求体校验 ───

interface CreateTemplateRequest {
  name: string;
  content: string;
  variables?: TemplateVariable[];
  sourceAnalysisTaskId?: string;
  sourceAssetId?: string;
  sourceImageUrl?: string;
  /** plan-01（AC-06）: 来源迭代 id，保存成功迭代为 Style Memory 时携带 */
  sourceGenerationTaskId?: string;
}

const VALID_SOURCE_FIELDS = new Set([
  "subject",
  "scene",
  "visual_style",
  "lighting_color",
  "composition",
  "camera_language",
  "texture",
  "mood",
]);

function validateVariables(value: unknown): TemplateVariable[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) return null;

  const variables: TemplateVariable[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === "string" ? normalizeVariableName(obj.name) : null;
    if (!name) return null;
    if (typeof obj.defaultValue !== "string" || obj.defaultValue.length > 500) return null;
    if (obj.label !== undefined && (typeof obj.label !== "string" || obj.label.length > 80)) return null;
    if (
      obj.sourceField !== undefined &&
      (typeof obj.sourceField !== "string" || !VALID_SOURCE_FIELDS.has(obj.sourceField))
    ) {
      return null;
    }

    variables.push({
      name,
      defaultValue: obj.defaultValue,
      ...(typeof obj.label === "string" && obj.label ? { label: obj.label } : {}),
      ...(typeof obj.sourceField === "string" ? { sourceField: obj.sourceField as TemplateVariable["sourceField"] } : {}),
    });
  }

  return variables;
}

function validateSourceAssetId(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 26) return null;
  return trimmed;
}

/** plan-01: sourceGenerationTaskId 与来源资产同规格（26 位 ULID） */
function validateSourceGenerationTaskId(
  value: unknown
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 26) return null;
  return trimmed;
}

function validateSourceImageUrl(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 4096) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function validateCreateBody(body: unknown): CreateTemplateRequest | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length < 1 || obj.name.length > 50) return null;
  if (typeof obj.content !== "string" || obj.content.length === 0 || obj.content.length > 10000) return null;
  if (obj.sourceAnalysisTaskId !== undefined && typeof obj.sourceAnalysisTaskId !== "string") return null;
  const variables = validateVariables(obj.variables);
  if (variables === null) return null;
  const sourceAssetId = validateSourceAssetId(obj.sourceAssetId);
  if (sourceAssetId === null) return null;
  const sourceImageUrl = validateSourceImageUrl(obj.sourceImageUrl);
  if (sourceImageUrl === null) return null;
  const sourceGenerationTaskId = validateSourceGenerationTaskId(obj.sourceGenerationTaskId);
  if (sourceGenerationTaskId === null) return null;

  return {
    name: obj.name.trim(),
    content: obj.content,
    ...(variables !== undefined ? { variables } : {}),
    sourceAnalysisTaskId: obj.sourceAnalysisTaskId as string | undefined,
    ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
    ...(sourceImageUrl !== undefined ? { sourceImageUrl } : {}),
    ...(sourceGenerationTaskId !== undefined ? { sourceGenerationTaskId } : {}),
  };
}

// ─── POST /api/templates — 创建模板 ───

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. 认证
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // 2. Rate Limit 检查（仅对 POST 生效）
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rateLimitResponse = checkRateLimit(ip);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. 校验请求体
    const body: unknown = await request.json();
    const validated = validateCreateBody(body);

    if (!validated) {
      return NextResponse.json(
        { error: "Invalid request parameters", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 4. 同名检测
    const existing = await findByName(userId, validated.name);
    if (existing) {
      log("template_name_conflict", { name: validated.name, userId });
      return NextResponse.json(
        { error: "A template with this name already exists", code: "TEMPLATE_NAME_CONFLICT", retryable: false },
        { status: 409 }
      );
    }

    let sourceAssetId = validated.sourceAssetId;

    if (validated.sourceAnalysisTaskId) {
      const sourceAnalysisTask = await findAnalysisTaskById(
        validated.sourceAnalysisTaskId,
        userId,
      );
      if (!sourceAnalysisTask) {
        return NextResponse.json(
          { error: "Invalid source analysis task", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      if (sourceAssetId && sourceAssetId !== sourceAnalysisTask.sourceAssetId) {
        return NextResponse.json(
          { error: "Source analysis task and asset do not match", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      sourceAssetId = sourceAnalysisTask.sourceAssetId;
    }

    let sourceImageUrl: string | undefined;
    if (sourceAssetId) {
      const sourceAsset = await findAssetById(sourceAssetId);
      if (
        !sourceAsset ||
        sourceAsset.userId !== userId ||
        sourceAsset.type !== "reference"
      ) {
        return NextResponse.json(
          { error: "Invalid source asset", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      sourceImageUrl = sourceAsset.fileUrl;
    } else if (validated.sourceImageUrl) {
      return NextResponse.json(
        { error: "Source image URL requires a database-backed source", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // plan-01（AC-06）: 来源迭代校验——归属当前用户、completed 且有结果资产
    if (validated.sourceGenerationTaskId) {
      const sourceGenerationTask = await findGenerationTaskById(
        validated.sourceGenerationTaskId,
        userId,
      );
      if (
        !sourceGenerationTask ||
        sourceGenerationTask.status !== "completed" ||
        !sourceGenerationTask.resultAssetId
      ) {
        return NextResponse.json(
          { error: "Invalid source generation task", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
    }

    // 5. 创建模板
    const template = await createTemplate(userId, {
      name: validated.name,
      content: validated.content,
      ...(validated.variables !== undefined ? { variables: validated.variables } : {}),
      ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
      ...(sourceImageUrl !== undefined ? { sourceImageUrl } : {}),
    });

    // plan-01（ADR-5）: 保存动作是来源迭代关联的唯一写入点
    if (validated.sourceGenerationTaskId) {
      await linkTemplateToGenerationTask(
        template.id,
        validated.sourceGenerationTaskId,
        userId,
      );
    }

    log("template_created", {
      templateId: template.id,
      name: template.name,
      variableCount: template.variables.length,
      defaultValueCount: template.variables.filter((variable) => variable.defaultValue).length,
      sourceAnalysisTaskIdPresent: Boolean(validated.sourceAnalysisTaskId),
      sourceAssetIdPresent: Boolean(sourceAssetId),
      sourceImageUrlPresent: Boolean(template.sourceImageUrl),
      sourceGenerationTaskIdPresent: Boolean(validated.sourceGenerationTaskId),
      duration: Date.now() - startTime,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "create", error: message });

    const isDbUnavailable =
      message.includes("connection") ||
      message.includes("timeout") ||
      message.includes("ECONNREFUSED");

    return NextResponse.json(
      {
        error: message,
        code: isDbUnavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
        retryable: true,
      },
      { status: isDbUnavailable ? 503 : 500 }
    );
  }
}

// ─── GET /api/templates — 模板列表（cursor-based 分页） ───

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. 认证
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // 2. 提取并校验 query params
    const { searchParams } = new URL(request.url);
    const cursorParam = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const searchParam = searchParams.get("search");

    let cursor: string | undefined;
    if (cursorParam !== null) {
      // 校验 cursor 是否为合法 ISO 8601 日期
      const parsed = new Date(cursorParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid cursor. Use an ISO 8601 date string", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      cursor = parsed.toISOString();
    }

    let limit = 10;
    if (limitParam !== null) {
      const parsed = Number(limitParam);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
        return NextResponse.json(
          { error: "limit must be an integer from 1 to 50", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    // search 参数校验：长度限制 ≤ 100 字符
    let search: string | undefined;
    if (searchParam !== null) {
      if (searchParam.length > 100) {
        return NextResponse.json(
          { error: "search must be 100 characters or fewer", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      // trim 后空字符串等同于不过滤
      const trimmed = searchParam.trim();
      if (trimmed.length > 0) {
        search = trimmed;
      }
    }

    // 3. 查询列表
    const result = await findAllByUserId(userId, { cursor, limit, search });

    log("template_list_queried", {
      userId,
      itemCount: result.items.length,
      hasMore: result.hasMore,
      ...(search ? { search, userId } : {}),
      duration: Date.now() - startTime,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "list", error: message });

    const isDbUnavailable =
      message.includes("connection") ||
      message.includes("timeout") ||
      message.includes("ECONNREFUSED");

    return NextResponse.json(
      {
        error: message,
        code: isDbUnavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
        retryable: true,
      },
      { status: isDbUnavailable ? 503 : 500 }
    );
  }
}
