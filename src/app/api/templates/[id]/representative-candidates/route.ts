import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  findById,
  listRepresentativeCandidates,
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

/** 游标为 (sortTs,id) 编码串（ISO 8601 日期 + "::" + id，与列表/候选 repository 口径一致） */
const CURSOR_SEPARATOR = "::";

function parseCursor(cursorParam: string): string | null {
  const separatorIndex = cursorParam.lastIndexOf(CURSOR_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex + CURSOR_SEPARATOR.length >= cursorParam.length) {
    return null;
  }
  const sortTs = Date.parse(cursorParam.slice(0, separatorIndex));
  if (Number.isNaN(sortTs)) return null;
  return cursorParam;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// ─── GET /api/templates/:id/representative-candidates — 候选迭代列表（架构 §6.4，读端点不限流） ───

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

    // 2. 获取模板 ID 与 query params
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const cursorParam = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");

    // 3. Memory 归属校验（404 口径同详情）
    const memory = await findById(id, userId);
    if (!memory) {
      log("template_not_found", { templateId: id, userId });
      return NextResponse.json(
        { error: "Template not found", code: "TEMPLATE_NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    let cursor: string | undefined;
    if (cursorParam !== null) {
      const parsed = parseCursor(cursorParam);
      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid cursor. Use a (ISO 8601 date)::id encoded string", code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      cursor = parsed;
    }

    // limit 默认 20，上限 50（超上限按 50 截断，架构 §7.3）
    let limit = DEFAULT_LIMIT;
    if (limitParam !== null) {
      const parsed = Number(limitParam);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: `limit must be a positive integer (max ${MAX_LIMIT})`, code: "INVALID_REQUEST", retryable: false },
          { status: 400 }
        );
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    // 4. 查询候选迭代（plan-01：相关集 = 派生迭代 ∪ 来源迭代自身，completed 且有结果资产）
    const result = await listRepresentativeCandidates(id, userId, cursor, limit);

    log("representative_candidates_queried", {
      templateId: id,
      userId,
      itemCount: result.items.length,
      hasMore: result.hasMore,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log("template_operation_failed", { operation: "list_representative_candidates", error: message });

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
