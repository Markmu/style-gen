import { NextRequest, NextResponse } from "next/server";
import { listIterations, getDirectionIterationFeed, type DirectionIterationItemRow } from '@/lib/repositories/generation-task-repository';
import { auth } from '@/auth';
import { log, logErrorDetail } from '@/lib/ai/log';
import { submitGeneration, findSubmissionByKey, submissionReceipt } from '@/lib/generation/submission';
import { workspaceHttp, workspaceJson } from '@/lib/workspace/http';
import { requestKey, identifier, WorkspaceServiceError } from '@/lib/workspace/validation';
import { findDirection } from '@/lib/repositories/workspace-repository';
import type { DirectionIterationListItem, IterationStatusFilter } from '@/types/models';
export const maxDuration=240;

// ─── GET /api/generation：迭代列表（近期条与完整页面共用，架构 §6.1）────

/** status 白名单（默认 completed 兼容近期迭代条，架构 §7.3） */
const ITERATION_STATUS_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "processing",
  "completed",
  "failed",
]);

/** 方向 feed 条目 → DTO（createdAt ISO 序列化） */
function serializeDirectionItem(
  item: DirectionIterationItemRow
): DirectionIterationListItem {
  return {
    id: item.id,
    status: item.status,
    promptSummary: item.promptSummary,
    resultFileUrl: item.resultFileUrl,
    params: item.params,
    createdAt: item.createdAt.toISOString(),
    resultAssetId: item.resultAssetId,
    errorMessage: item.errorMessage,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { searchParams } = request.nextUrl;
    if(searchParams.has('requestKey'))return workspaceHttp(async()=>{
      if(searchParams.size!==1||searchParams.getAll('requestKey').length!==1)throw new WorkspaceServiceError('INVALID_REQUEST');
      const task=await findSubmissionByKey(userId,requestKey(searchParams.get('requestKey')));return {task:task?submissionReceipt(task):null};
    });

    const rawPageSize = searchParams.get("pageSize");
    const cursor = searchParams.get("cursor") ?? null;
    const rawQ = searchParams.get("q");
    const rawStatus = searchParams.get("status");

    // plan-03（ADR-5 / AC-04）: view=direction 返回当前方向分组 feed。
    // view 是白名单枚举：仅 "direction" 合法，未知值 400，不静默回退普通列表。
    const rawView = searchParams.get("view");
    if (rawView !== null) {
      if (rawView !== "direction") {
        return NextResponse.json(
          {
            error: "view must be 'direction' when provided",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }

      const directionId=searchParams.get('directionId');
      if(directionId) return workspaceHttp(async()=>{
        identifier(directionId);for(const name of searchParams.keys())if(!['view','directionId','pageSize'].includes(name)||searchParams.getAll(name).length!==1)throw new WorkspaceServiceError('INVALID_REQUEST');
        if(!await findDirection(userId,directionId))throw new (await import('@/lib/repositories/workspace-repository')).WorkspaceNotFound();
        const size=Number(rawPageSize??5);if(!Number.isInteger(size)||size<1||size>5)throw new WorkspaceServiceError('INVALID_REQUEST');
        const feed=await getDirectionIterationFeed(userId,directionId,size,'direction');return {completed:feed.completed.map(serializeDirectionItem),active:feed.active?serializeDirectionItem(feed.active):null,latestFailure:feed.latestFailure?serializeDirectionItem(feed.latestFailure):null};
      });
      const analysisTaskId = searchParams.get("analysisTaskId");
      if (!analysisTaskId) {
        return NextResponse.json(
          {
            error: "analysisTaskId is required for direction view",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }

      // 方向 pageSize 仅 1-5 整数（completed 限额；active/latestFailure 恒为 1），不 clamp
      let directionPageSize = 5;
      if (rawPageSize !== null) {
        const parsed = Number(rawPageSize);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
          return NextResponse.json(
            {
              error: "direction pageSize must be an integer between 1 and 5",
              code: "INVALID_REQUEST",
              retryable: false,
            },
            { status: 400 }
          );
        }
        directionPageSize = parsed;
      }

      const startTime = Date.now();
      const feed = await getDirectionIterationFeed(
        userId,
        analysisTaskId,
        directionPageSize
      );

      log("direction_iterations_queried", {
        duration: Date.now() - startTime,
        completedCount: feed.completed.length,
        hasActive: feed.active !== null,
        hasLatestFailure: feed.latestFailure !== null,
        userId,
        analysisTaskId,
      });

      return NextResponse.json({
        completed: feed.completed.map(serializeDirectionItem),
        active: feed.active ? serializeDirectionItem(feed.active) : null,
        latestFailure: feed.latestFailure
          ? serializeDirectionItem(feed.latestFailure)
          : null,
      });
    }

    // q: trim 后 ≤ 100 字符，超出 400，不做静默截断（架构 §8.3）
    const trimmedQ = rawQ?.trim() ?? "";
    if (trimmedQ.length > 100) {
      return NextResponse.json(
        {
          error: "q must be 100 characters or fewer after trimming",
          code: "INVALID_REQUEST",
          retryable: false,
        },
        { status: 400 }
      );
    }
    const q = trimmedQ.length > 0 ? trimmedQ : undefined;

    // status: 白名单校验；缺省默认 completed（近期迭代条兼容）
    let status: IterationStatusFilter = "completed";
    if (rawStatus !== null) {
      if (!ITERATION_STATUS_FILTERS.has(rawStatus)) {
        return NextResponse.json(
          {
            error: "status must be one of: all, processing, completed, failed",
            code: "INVALID_REQUEST",
            retryable: false,
          },
          { status: 400 }
        );
      }
      status = rawStatus as IterationStatusFilter;
    }

    // pageSize clamp 到 [1, 50]
    let pageSize = 20;
    if (rawPageSize !== null) {
      const parsed = Number(rawPageSize);
      if (Number.isFinite(parsed)) {
        pageSize = Math.max(1, Math.min(50, Math.trunc(parsed)));
      }
    }

    const directionId=searchParams.get("directionId")??undefined;
    if(directionId!==undefined){try{identifier(directionId);if(searchParams.getAll("directionId").length!==1)throw new Error("duplicate directionId");}catch{return NextResponse.json({code:"INVALID_REQUEST",error:"Invalid directionId"},{status:400});}if(!await findDirection(userId,directionId))return NextResponse.json({code:"NOT_FOUND",error:"Direction not found"},{status:404});}
    const startTime = Date.now();
    const result = await listIterations({ userId, q, status, cursor, pageSize,...(directionId?{directionId}:{}) });
    const duration = Date.now() - startTime;

    log("iteration_list_queried", {
      duration,
      itemCount: result.items.length,
      hasQ: Boolean(q),
      statusFilter: status,
      userId,
    });

    return NextResponse.json({
      items: result.items.map((item) => ({
        id: item.id,
        directionId: item.directionId ?? null,
        status: item.status,
        promptSummary: item.promptSummary,
        resultFileUrl: item.resultFileUrl,
        params: item.params,
        createdAt: item.createdAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    logErrorDetail("generation_history_list_failed", error, {
      path: request.nextUrl.pathname,
      query: request.nextUrl.search,
    });
    return NextResponse.json(
      { error: message, code: "SERVICE_UNAVAILABLE", retryable: true },
      { status: 500 }
    );
  }
}

export async function POST(request:NextRequest) {
 return workspaceHttp(async userId=>submitGeneration(userId,await workspaceJson(request)),'CREATE');
}
