import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  deleteTemplate,
  updateTemplate,
  findByName,
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
        { error: "模板不存在", code: "TEMPLATE_NOT_FOUND", retryable: false },
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

// ─── DELETE /api/templates/:id — 删除模板 ───

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

    // 3. 删除模板（Repository 内部校验归属 + 不存在时抛异常）
    try {
      await deleteTemplate(id, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Template not found";
      log("template_delete_failed", { templateId: id, userId, error: message });
      return NextResponse.json(
        { error: "模板不存在", code: "TEMPLATE_NOT_FOUND", retryable: false },
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
    let body: { name?: string; content?: string };
    try {
      body = (await request.json()) as { name?: string; content?: string };
    } catch {
      return NextResponse.json(
        { error: "请求体格式错误", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 4. 校验至少提供一个字段
    if (!body.name && !body.content) {
      return NextResponse.json(
        { error: "至少需要提供 name 或 content 字段", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 5. 校验 name 格式（如果提供）
    if (body.name !== undefined && (body.name.length < 1 || body.name.length > 50)) {
      return NextResponse.json(
        { error: "名称长度必须在 1-50 个字符之间", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 6. 校验 content 格式（如果提供）
    if (body.content !== undefined && (body.content.length === 0 || body.content.length > 10000)) {
      return NextResponse.json(
        { error: "内容长度必须在 1-10000 个字符之间", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 7. 检查模板是否存在
    const existing = await findById(id, userId);
    if (!existing) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "模板不存在", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 8. 同名检测（仅当 name 变更时）
    if (body.name !== undefined && body.name !== existing.name) {
      const duplicate = await findByName(userId, body.name);
      if (duplicate && duplicate.id !== id) {
        log("template_name_conflict", { templateId: id, name: body.name, userId });
        return NextResponse.json(
          { error: "同名模板已存在", code: "CONFLICT", retryable: false },
          { status: 409 }
        );
      }
    }

    // 9. 执行更新
    const updated = await updateTemplate(id, userId, {
      name: body.name,
      content: body.content,
    });

    log("template_updated", {
      templateId: id,
      name: updated.name,
      hasContentUpdate: body.content !== undefined,
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
