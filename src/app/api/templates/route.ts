import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createTemplate,
  findByName,
  findAllByUserId,
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

// ─── Rate Limit：内存级滑动窗口计数器（30 次/小时/IP）[架构8.3] ───

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
      { error: "请求过于频繁", code: "RATE_LIMITED", retryable: true },
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
  sourceAnalysisTaskId?: string;
}

function validateCreateBody(body: unknown): CreateTemplateRequest | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length < 1 || obj.name.length > 50) return null;
  if (typeof obj.content !== "string" || obj.content.length === 0 || obj.content.length > 10000) return null;
  if (obj.sourceAnalysisTaskId !== undefined && typeof obj.sourceAnalysisTaskId !== "string") return null;

  return {
    name: obj.name.trim(),
    content: obj.content,
    sourceAnalysisTaskId: obj.sourceAnalysisTaskId as string | undefined,
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
        { error: "请求参数不合法", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // 4. 同名检测
    const existing = await findByName(userId, validated.name);
    if (existing) {
      log("template_name_conflict", { name: validated.name, userId });
      return NextResponse.json(
        { error: "已存在同名模板", code: "TEMPLATE_NAME_CONFLICT", retryable: false },
        { status: 409 }
      );
    }

    // 5. 创建模板（Repository 内部自动提取 variables）
    const template = await createTemplate(userId, validated);

    log("template_created", {
      templateId: template.id,
      name: template.name,
      variableCount: template.variables.length,
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
          { error: "cursor 参数格式不合法，需为 ISO 8601 日期字符串", code: "INVALID_REQUEST", retryable: false },
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
          { error: "limit 参数需为 1-50 之间的整数", code: "INVALID_REQUEST", retryable: false },
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
          { error: "search 参数长度不能超过 100 个字符", code: "INVALID_REQUEST", retryable: false },
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
