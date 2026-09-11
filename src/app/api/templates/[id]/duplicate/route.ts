import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  duplicateTemplate,
  duplicateTemplateWithReceipt,
  lookupMemoryReceipt,
  type TemplateMemoryReceipt,
} from "@/lib/repositories/template-repository";
import {
  findDirection,
  hashWorkspaceRequest,
  WorkspaceConflict,
  WorkspaceNotFound,
} from "@/lib/repositories/workspace-repository";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

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

/** plan-10：可选 requestKey（与 workspace 命令键同规格） */
function validateRequestKeyValue(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 180 || !/^[A-Za-z0-9:_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** plan-10：方向 ID（26 位 ULID） */
function validateDirectionIdValue(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(trimmed)) return null;
  return trimmed;
}

/** plan-10：回执冲突/目标缺失的统一错误响应 */
function receiptErrorResponse(error: unknown): Response | null {
  if (error instanceof WorkspaceConflict && error.code === "request_key_conflict") {
    return NextResponse.json(
      {
        error: "This request key was already used with different content",
        code: "REQUEST_KEY_CONFLICT",
        retryable: false,
      },
      { status: 409 }
    );
  }
  if (error instanceof WorkspaceNotFound) {
    return NextResponse.json(
      { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
      { status: 404 }
    );
  }
  return null;
}

// ─── POST /api/templates/:id/duplicate — Duplicate模板 ───

export async function POST(
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

    // plan-10：可选 requestKey + directionId（兼容空 body 旧调用）
    let rawBody: unknown = undefined;
    try {
      const text = await request.text();
      rawBody = text.trim() ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }
    const bodyObject = (rawBody ?? {}) as Record<string, unknown>;
    if (Object.keys(bodyObject).some((key) => !["requestKey", "directionId"].includes(key))) {
      return NextResponse.json(
        { error: "Unknown request fields", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }
    const requestKey = validateRequestKeyValue(bodyObject.requestKey);
    if (requestKey === null) {
      return NextResponse.json(
        { error: "Invalid requestKey", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }
    const receiptDirectionId = validateDirectionIdValue(bodyObject.directionId);
    if (receiptDirectionId === null) {
      return NextResponse.json(
        { error: "Invalid directionId", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }
    if ((requestKey === undefined) !== (receiptDirectionId === undefined)) {
      return NextResponse.json(
        { error: "requestKey and directionId must be provided together", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }
    let receipt: TemplateMemoryReceipt | null = null;
    if (requestKey && receiptDirectionId) {
      receipt = {
        directionId: receiptDirectionId,
        requestKey,
        requestHash: hashWorkspaceRequest(
          { requestKey, directionId: receiptDirectionId, id },
          ["requestKey", "directionId", "id"]
        ),
      };
      const direction = await findDirection(userId, receiptDirectionId);
      if (!direction) {
        return NextResponse.json(
          { error: "Direction not found", code: "DIRECTION_NOT_FOUND", retryable: false },
          { status: 404 }
        );
      }
      try {
        const lookup = await lookupMemoryReceipt(userId, receipt);
        if (lookup.status === "reused") {
          log("duplicate_request_reused", {
            directionId: receiptDirectionId,
            templateId: lookup.record.id,
            requestKeyHash: receipt.requestHash.slice(0, 12),
          });
          return NextResponse.json({ ...lookup.record, reused: true }, { status: 200 });
        }
        if (lookup.status === "gone") {
          return NextResponse.json(
            { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
            { status: 404 }
          );
        }
      } catch (error) {
        const mapped = receiptErrorResponse(error);
        if (mapped) return mapped;
        throw error;
      }
    }

    // 4. 检查原模板是否存在
    const existing = await findById(id, userId);
    if (!existing) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 5. 执行Duplicate（plan-01：复制规则四元组与来源链，固定 pending_verification、无代表结果）
    if (receipt) {
      try {
        const result = await duplicateTemplateWithReceipt(id, userId, receipt);
        if (result.reused) {
          log("duplicate_request_reused", {
            directionId: receipt.directionId,
            templateId: result.record.id,
            requestKeyHash: receipt.requestHash.slice(0, 12),
          });
          return NextResponse.json({ ...result.record, reused: true }, { status: 200 });
        }
        log("template_duplicated", {
          sourceId: id,
          newId: result.record.id,
          newName: result.record.name,
          directionId: receipt.directionId,
          requestKeyHash: receipt.requestHash.slice(0, 12),
          duration: Date.now() - startTime,
        });
        return NextResponse.json({ ...result.record, reused: false }, { status: 201 });
      } catch (error) {
        const mapped = receiptErrorResponse(error);
        if (mapped) return mapped;
        throw error;
      }
    }
    const duplicated = await duplicateTemplate(id, userId);

    log("template_duplicated", {
      sourceId: id,
      newId: duplicated.id,
      newName: duplicated.name,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(duplicated, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "duplicate", error: message });

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
