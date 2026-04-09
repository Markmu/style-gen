import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  duplicateTemplate,
} from "@/lib/repositories/template-repository";

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

// ─── POST /api/templates/:id/duplicate — 复制模板 ───

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

    // 2. 获取模板 ID
    const { id } = await params;

    // 3. 检查原模板是否存在
    const existing = await findById(id, userId);
    if (!existing) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "模板不存在", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 4. 执行复制
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
