import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  deleteTemplate,
  updateTemplate,
  findByName,
  findStyleMemoryDetail,
} from "@/lib/repositories/template-repository";
import { findAssetById } from "@/lib/repositories/asset-repository";
import { normalizeVariableName } from "@/lib/template-parser";
import { ruleSetsChanged } from "@/lib/style-memory-rules";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { StyleMemoryRecord, TemplateVariable } from "@/types/models";

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

/**
 * plan-02：说明字段（架构 §7.3）。PUT 支持 null（清空）与非空字符串（≤500）；
 * trim 空串等同清空。返回 null 表示非法。
 */
function validateUpdateDescription(value: unknown): string | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length > 500) return false;
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * plan-02：规则/排除数组上限校验（架构 §8.3）：≤12 条 × ≤200 字符。
 */
function validateRuleArray(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) return null;
  for (const item of value) {
    if (typeof item !== "string" || item.length > 200) return null;
  }
  return value;
}

// ─── GET /api/templates/:id — Style Memory 详情（架构 §6.2 四分区 DTO） ───

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    // 1. 认证
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // 2. 获取模板 ID
    const { id } = await params;

    // 3. 查询详情（plan-01：含规则四元组、来源迭代、代表结果、usage 聚合与读时防御降级）
    const detail = await findStyleMemoryDetail(id, userId);
    if (!detail) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    log("template_detail_queried", {
      templateId: id,
      name: detail.name,
      verificationStatus: detail.verificationStatus,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "get_detail", error: message });

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

// ─── DELETE /api/templates/:id — Delete模板 ───

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    // 1. 认证
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // 2. Rate Limit（plan-02：写端点共享限流）
    const rateLimitResponse = enforceTemplateWriteRateLimit(userId);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. 获取模板 ID
    const { id } = await params;

    // 4. Delete模板（Repository 内部校验归属 + 不存在时抛异常）
    try {
      await deleteTemplate(id, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Template not found";
      log("template_delete_failed", { templateId: id, userId, error: message });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    log("template_deleted", {
      templateId: id,
      duration: Date.now() - startTime,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "delete", error: message });

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

// ─── PUT /api/templates/:id — 编辑五字段（架构 §6.4：name/description/variables/retainedRules/negativeConstraints） ───

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    // 1. 认证
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    // 2. Rate Limit（plan-02：写端点共享限流）
    const rateLimitResponse = enforceTemplateWriteRateLimit(userId);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. 获取模板 ID
    const { id } = await params;

    // 4. 解析请求体
    let body: {
      name?: string;
      content?: string;
      variables?: unknown;
      sourceAnalysisTaskId?: unknown;
      sourceAssetId?: unknown;
      sourceImageUrl?: unknown;
      description?: unknown;
      retainedRules?: unknown;
      negativeConstraints?: unknown;
      verificationStatus?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // plan-02（ADR-1 信任边界）：verificationStatus 只能由服务端写点派生
    if (body.verificationStatus !== undefined) {
      return NextResponse.json(
        { error: "verificationStatus cannot be set through the request body", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 5. 校验至少提供一个可编辑字段（plan-02 五字段 + 兼容的 content/source 字段）
    if (
      !body.name &&
      !body.content &&
      body.variables === undefined &&
      body.sourceAssetId === undefined &&
      body.sourceImageUrl === undefined &&
      body.description === undefined &&
      body.retainedRules === undefined &&
      body.negativeConstraints === undefined
    ) {
      return NextResponse.json(
        { error: "Provide at least one updatable field", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 6. 校验 name 格式（如果提供）
    if (body.name !== undefined && (body.name.length < 1 || body.name.length > 50)) {
      return NextResponse.json(
        { error: "Name must be 1-50 characters", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 7. 校验 content 格式（兼容既有工作台链路；不触发状态回退）
    if (body.content !== undefined && (body.content.length === 0 || body.content.length > 10000)) {
      return NextResponse.json(
        { error: "Content must be 1-10000 characters", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    const variables = validateVariables(body.variables);
    if (variables === null) {
      return NextResponse.json(
        { error: "Invalid variables parameter", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // plan-02：description（string | null，≤500；trim 空串等同清空）
    const description = validateUpdateDescription(body.description);
    if (description === false) {
      return NextResponse.json(
        { error: "description must be a string of 500 characters or fewer, or null", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // plan-02：规则/排除数组（≤12 条 × ≤200 字符）
    const retainedRules = validateRuleArray(body.retainedRules);
    if (retainedRules === null) {
      return NextResponse.json(
        { error: "retainedRules must be at most 12 items of 200 characters each", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }
    const negativeConstraints = validateRuleArray(body.negativeConstraints);
    if (negativeConstraints === null) {
      return NextResponse.json(
        { error: "negativeConstraints must be at most 12 items of 200 characters each", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    if (
      body.sourceAnalysisTaskId !== undefined &&
      typeof body.sourceAnalysisTaskId !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid sourceAnalysisTaskId parameter", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    const sourceAssetId = validateSourceAssetId(body.sourceAssetId);
    if (sourceAssetId === null) {
      return NextResponse.json(
        { error: "Invalid sourceAssetId parameter", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    const sourceImageUrl = validateSourceImageUrl(body.sourceImageUrl);
    if (sourceImageUrl === null) {
      return NextResponse.json(
        { error: "Invalid sourceImageUrl parameter", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 8. 检查模板是否存在
    const existing = await findById(id, userId);
    if (!existing) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 9. 同名检测（仅当 name 变更时；plan-02：409 code 与 POST 统一为 TEMPLATE_NAME_CONFLICT）
    if (body.name !== undefined && body.name !== existing.name) {
      const duplicate = await findByName(userId, body.name);
      if (duplicate && duplicate.id !== id) {
        log("template_name_conflict", { templateId: id, name: body.name, userId });
        return NextResponse.json(
          { error: "A template with this name already exists", code: "TEMPLATE_NAME_CONFLICT", retryable: false },
          { status: 409 }
        );
      }
    }

    let nextSourceImageUrl = sourceImageUrl;
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
      nextSourceImageUrl = sourceAsset.fileUrl;
    }

    // 10. 执行更新（plan-01：规则集合实质变化由 repository 判定并回退 pending_verification）
    let updated: StyleMemoryRecord;
    try {
      updated = await updateTemplate(id, userId, {
        name: body.name,
        content: body.content,
        ...(variables !== undefined ? { variables } : {}),
        ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
        ...(nextSourceImageUrl !== undefined ? { sourceImageUrl: nextSourceImageUrl } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(retainedRules !== undefined ? { retainedRules } : {}),
        ...(negativeConstraints !== undefined ? { negativeConstraints } : {}),
      });
    } catch (error) {
      // Memory 已被并发删除：无部分写入，404 口径与详情一致
      const message = error instanceof Error ? error.message : "Template not found";
      log("template_operation_failed", { operation: "update", error: message });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // plan-02（架构 §8.5）：规则计数与实质变化口径复用 ruleSetsChanged（顺序/空白差异不算）
    const retainedRulesChanged = ruleSetsChanged(
      existing.retainedRules ?? [],
      updated.retainedRules ?? []
    );
    const negativeConstraintsChanged = ruleSetsChanged(
      existing.negativeConstraints ?? [],
      updated.negativeConstraints ?? []
    );

    // plan-02（架构 §8.5）：编辑触发状态回退时记录事件
    if (
      existing.verificationStatus === "user_verified" &&
      updated.verificationStatus === "pending_verification"
    ) {
      log("template_verification_reset", {
        templateId: id,
        trigger: retainedRulesChanged ? "rules" : "constraints",
      });
    }

    log("template_updated", {
      templateId: id,
      name: updated.name,
      hasContentUpdate: body.content !== undefined,
      variableCount: updated.variables.length,
      defaultValueCount: updated.variables.filter((variable) => variable.defaultValue).length,
      verificationStatus: updated.verificationStatus,
      rulesChanged: retainedRulesChanged || negativeConstraintsChanged,
      sourceAnalysisTaskIdPresent: typeof body.sourceAnalysisTaskId === "string",
      sourceAssetIdPresent: Boolean(updated.sourceAssetId),
      sourceImageUrlPresent: Boolean(updated.sourceImageUrl),
      duration: Date.now() - startTime,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "update", error: message });

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
