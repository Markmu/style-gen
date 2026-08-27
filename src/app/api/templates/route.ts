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
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { TemplateVariable, TemplateVerificationStatus } from "@/types/models";

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

/**
 * plan-02（架构 §8.3）：写端点共享限流。
 * identifier 取 session userId（登录用户），30 次/小时（templateWrite）。
 */
function enforceTemplateWriteRateLimit(userId: string): Response | null {
  const result = checkRateLimit(
    userId,
    "templateWrite",
    RATE_LIMIT_CONFIGS.templateWrite
  );
  if (result && !result.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", code: "RATE_LIMITED", retryable: true },
      { status: 429 }
    );
  }
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
  /** plan-02（架构 §7.3）扩展体：说明（user_input ≤500） */
  description?: string;
  /** plan-02：核心保留规则（user_input ≤12 条 × ≤200 字符，编辑触发回退） */
  retainedRules?: string[];
  /** plan-02：排除约束（user_input ≤12 条 × ≤200 字符，编辑触发回退） */
  negativeConstraints?: string[];
  /** plan-02：风格指纹（frontend_computed ≤16 条 × ≤80 字符，仅展示） */
  styleTokens?: string[];
  /** plan-02：增强方向（frontend_computed ≤16 条 × ≤80 字符，仅展示） */
  enhancementHints?: string[];
  /** plan-02：代表结果迭代，须等于 sourceGenerationTaskId（架构 §6.3） */
  representativeGenerationTaskId?: string;
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

/** plan-02：说明字段（user_input ≤500，trim 空串等同未提供） */
function validateDescription(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 500) return null;
  return trimmed;
}

/**
 * plan-02：字符串数组上限校验（架构 §8.3）。
 * 规则/排除 ≤12 条 × ≤200 字符；token/增强 ≤16 条 × ≤80 字符。
 */
function validateBoundedStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number
): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) return null;
  for (const item of value) {
    if (typeof item !== "string" || item.length > maxLength) return null;
  }
  return value;
}

function validateCreateBody(body: unknown): CreateTemplateRequest | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  // plan-02（ADR-1 信任边界）：verificationStatus 只能由服务端写点派生
  if (obj.verificationStatus !== undefined) return null;

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

  // plan-02 扩展体（架构 §7.3）
  const description = validateDescription(obj.description);
  if (description === null) return null;
  const retainedRules = validateBoundedStringArray(obj.retainedRules, 12, 200);
  if (retainedRules === null) return null;
  const negativeConstraints = validateBoundedStringArray(obj.negativeConstraints, 12, 200);
  if (negativeConstraints === null) return null;
  const styleTokens = validateBoundedStringArray(obj.styleTokens, 16, 80);
  if (styleTokens === null) return null;
  const enhancementHints = validateBoundedStringArray(obj.enhancementHints, 16, 80);
  if (enhancementHints === null) return null;
  const representativeGenerationTaskId = validateSourceGenerationTaskId(
    obj.representativeGenerationTaskId
  );
  if (representativeGenerationTaskId === null) return null;
  // 保存时代表结果只能是来源迭代自身（相关集单元素形态，架构 §6.3）
  if (
    representativeGenerationTaskId !== undefined &&
    representativeGenerationTaskId !== sourceGenerationTaskId
  ) {
    return null;
  }

  return {
    name: obj.name.trim(),
    content: obj.content,
    ...(variables !== undefined ? { variables } : {}),
    sourceAnalysisTaskId: obj.sourceAnalysisTaskId as string | undefined,
    ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
    ...(sourceImageUrl !== undefined ? { sourceImageUrl } : {}),
    ...(sourceGenerationTaskId !== undefined ? { sourceGenerationTaskId } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(retainedRules !== undefined ? { retainedRules } : {}),
    ...(negativeConstraints !== undefined ? { negativeConstraints } : {}),
    ...(styleTokens !== undefined ? { styleTokens } : {}),
    ...(enhancementHints !== undefined ? { enhancementHints } : {}),
    ...(representativeGenerationTaskId !== undefined
      ? { representativeGenerationTaskId }
      : {}),
  };
}

// ─── POST /api/templates — 创建模板（Style Memory 保存流程提交体，架构 §6.3） ───

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. 认证
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // 2. Rate Limit 检查（仅对 POST 生效；plan-02 起用共享 templateWrite 配置）
    const rateLimitResponse = enforceTemplateWriteRateLimit(userId);
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

    // plan-01（AC-06）: 来源迭代校验——归属当前用户、completed 且有结果资产。
    // plan-02：代表结果必须等于来源迭代，故该校验同时覆盖代表的合法性（架构 §6.3）。
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

    // 5. 创建模板（plan-01：verificationStatus 由 repository 派生——带代表结果 → user_verified）
    const template = await createTemplate(userId, {
      name: validated.name,
      content: validated.content,
      ...(validated.variables !== undefined ? { variables: validated.variables } : {}),
      ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
      ...(sourceImageUrl !== undefined ? { sourceImageUrl } : {}),
      ...(validated.description !== undefined ? { description: validated.description } : {}),
      ...(validated.retainedRules !== undefined ? { retainedRules: validated.retainedRules } : {}),
      ...(validated.negativeConstraints !== undefined
        ? { negativeConstraints: validated.negativeConstraints }
        : {}),
      ...(validated.styleTokens !== undefined ? { styleTokens: validated.styleTokens } : {}),
      ...(validated.enhancementHints !== undefined
        ? { enhancementHints: validated.enhancementHints }
        : {}),
      ...(validated.representativeGenerationTaskId !== undefined
        ? { representativeGenerationTaskId: validated.representativeGenerationTaskId }
        : {}),
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
      verificationStatus: template.verificationStatus,
      retainedRuleCount: validated.retainedRules?.length ?? 0,
      negativeConstraintCount: validated.negativeConstraints?.length ?? 0,
      representativePresent: Boolean(validated.representativeGenerationTaskId),
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

// ─── GET /api/templates — Style Memory 列表（cursor-based 分页 + status 筛选，架构 §6.1） ───

/** status 白名单（架构 §6.1）：all | user_verified | pending_verification，缺省 all */
const LIST_STATUS_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "user_verified",
  "pending_verification",
]);

/** 游标为 (sortTs,id) 编码串（ISO 8601 日期 + "::" + id，plan-01 起 repository 口径） */
const CURSOR_SEPARATOR = "::";

function parseListCursor(cursorParam: string): string | null {
  const separatorIndex = cursorParam.lastIndexOf(CURSOR_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex + CURSOR_SEPARATOR.length >= cursorParam.length) {
    return null;
  }
  const sortTs = Date.parse(cursorParam.slice(0, separatorIndex));
  if (Number.isNaN(sortTs)) return null;
  return cursorParam;
}

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
    const statusParam = searchParams.get("status");

    let cursor: string | undefined;
    if (cursorParam !== null) {
      const parsed = parseListCursor(cursorParam);
      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid cursor. Use a (ISO 8601 date)::id encoded string", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      cursor = parsed;
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

    // plan-02：status 白名单校验（all 与缺省不携带筛选）
    let verificationStatus: TemplateVerificationStatus | undefined;
    if (statusParam !== null) {
      if (!LIST_STATUS_FILTERS.has(statusParam)) {
        return NextResponse.json(
          { error: "status must be one of all | user_verified | pending_verification", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      if (statusParam !== "all") {
        verificationStatus = statusParam as TemplateVerificationStatus;
      }
    }

    // 3. 查询列表（plan-01 列表联查，返回 StyleMemoryListItem 分页结构）
    const result = await findAllByUserId(userId, {
      cursor,
      limit,
      ...(search ? { search } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
    });

    log("template_list_queried", {
      userId,
      itemCount: result.items.length,
      hasMore: result.hasMore,
      ...(search ? { search, userId } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
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
