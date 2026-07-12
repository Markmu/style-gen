import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  deleteTemplate,
  updateTemplate,
  findByName,
} from "@/lib/repositories/template-repository";
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

// ─── GET /api/templates/:id — 模板详情 ───

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

    // 3. 查询模板
    const template = await findById(id, userId);
    if (!template) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    log("template_detail_queried", {
      templateId: id,
      name: template.name,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(template);
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

    // 2. 获取模板 ID
    const { id } = await params;

    // 3. Delete模板（Repository 内部校验归属 + 不存在时抛异常）
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

// ─── PUT /api/templates/:id — 更新/重命名模板 ───

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

    // 2. 获取模板 ID
    const { id } = await params;

    // 3. 解析请求体
    let body: {
      name?: string;
      content?: string;
      variables?: unknown;
      sourceAnalysisTaskId?: unknown;
      sourceAssetId?: unknown;
      sourceImageUrl?: unknown;
    };
    try {
      body = (await request.json()) as { name?: string; content?: string };
    } catch {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 4. 校验至少提供一个字段
    if (
      !body.name &&
      !body.content &&
      body.variables === undefined &&
      body.sourceAssetId === undefined &&
      body.sourceImageUrl === undefined
    ) {
      return NextResponse.json(
        { error: "Provide at least one updatable field", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 5. 校验 name 格式（如果提供）
    if (body.name !== undefined && (body.name.length < 1 || body.name.length > 50)) {
      return NextResponse.json(
        { error: "Name must be 1-50 characters", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 6. 校验 content 格式（如果提供）
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

    // 7. 检查模板是否存在
    const existing = await findById(id, userId);
    if (!existing) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 8. 同名检测（仅当 name 变更时）
    if (body.name !== undefined && body.name !== existing.name) {
      const duplicate = await findByName(userId, body.name);
      if (duplicate && duplicate.id !== id) {
        log("template_name_conflict", { templateId: id, name: body.name, userId });
        return NextResponse.json(
          { error: "A template with this name already exists", code: "CONFLICT", retryable: false },
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

    // 9. 执行更新
    const updated = await updateTemplate(id, userId, {
      name: body.name,
      content: body.content,
      ...(variables !== undefined ? { variables } : {}),
      ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
      ...(nextSourceImageUrl !== undefined ? { sourceImageUrl: nextSourceImageUrl } : {}),
    });

    log("template_updated", {
      templateId: id,
      name: updated.name,
      hasContentUpdate: body.content !== undefined,
      variableCount: updated.variables.length,
      defaultValueCount: updated.variables.filter((variable) => variable.defaultValue).length,
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
