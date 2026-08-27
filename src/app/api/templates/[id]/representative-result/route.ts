import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  setRepresentativeResult,
} from "@/lib/repositories/template-repository";
import { findGenerationTaskById } from "@/lib/repositories/generation-task-repository";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { StyleMemoryRecord } from "@/types/models";

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

/** generationTaskId（user_input，26 位 ULID，与来源资产同规格） */
function validateGenerationTaskId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 26) return null;
  return trimmed;
}

// ─── POST /api/templates/:id/representative-result — 设置/替换代表结果（架构 §6.4） ───

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

    // 3. 获取模板 ID 与请求体
    const { id } = await params;

    let body: { generationTaskId?: unknown };
    try {
      body = (await request.json()) as { generationTaskId?: unknown };
    } catch {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    const generationTaskId = validateGenerationTaskId(body.generationTaskId);
    if (!generationTaskId) {
      return NextResponse.json(
        { error: "generationTaskId must be a ULID string", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 4. Memory 归属校验
    const memory = await findById(id, userId);
    if (!memory) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 5. 目标任务校验：归属本人、completed、resultAssetId 非空
    const task = await findGenerationTaskById(generationTaskId, userId);
    if (!task || task.status !== "completed" || !task.resultAssetId) {
      log("representative_result_rejected", { templateId: id, generationTaskId, reason: "invalid_task" });
      return NextResponse.json(
        { error: "Invalid generation task", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 6. 相关集校验（与 plan-01 listRepresentativeCandidates 同口径）：
    //    本 Memory 派生的迭代，或来源迭代自身
    const inRelatedSet =
      task.sourceTemplateId === id || task.id === memory.sourceGenerationTaskId;
    if (!inRelatedSet) {
      log("representative_result_rejected", { templateId: id, generationTaskId, reason: "not_related" });
      return NextResponse.json(
        { error: "Generation task is not in this memory's related set", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 7. 原子更新（plan-01 repository：单条 UPDATE 同时写引用与 user_verified）
    let updated: StyleMemoryRecord;
    try {
      updated = await setRepresentativeResult(id, userId, generationTaskId);
    } catch (error) {
      // Memory 已被并发删除：无部分写入，404 口径与详情一致
      const message = error instanceof Error ? error.message : "Template not found";
      log("template_operation_failed", { operation: "set_representative_result", error: message });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // plan-02（架构 §8.5）：action 按原代表结果是否为空判定
    log("representative_result_set", {
      templateId: id,
      generationTaskId,
      action: memory.representativeGenerationTaskId ? "replace" : "set",
      duration: Date.now() - startTime,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "set_representative_result", error: message });

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
