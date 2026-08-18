import { NextRequest, NextResponse } from "next/server";
import { findIterationDetail } from "@/lib/repositories/generation-task-repository";
import { auth } from "@/auth";

/** 结构化日志 [架构 8.5 可观测性] */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 认证：从 session 获取 userId
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing generation task ID", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    // plan-01（架构 §6.2）: 全状态详情，快照优先、活引用回退、缺失标记、已保存关联
    const detail = await findIterationDetail(id, userId);

    if (!detail) {
      return NextResponse.json(
        { error: "Generation task not found", code: "NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    log("iteration_detail_queried", {
      taskId: detail.id,
      status: detail.status,
      recipeSource: detail.recipeSource,
      hasSavedTemplate: Boolean(detail.savedTemplate),
    });

    // 响应为既有字段超集（架构 §7.3）：resultAssetId、analysisTemplateVariables 等
    // 既有轮询/恢复消费字段保留，新增快照来源标记与已保存关联只增不删
    return NextResponse.json({
      id: detail.id,
      analysisTaskId: detail.analysisTaskId,
      status: detail.status,
      promptSnapshot: detail.promptSnapshot,
      negativePromptSnapshot: detail.negativePromptSnapshot,
      params: detail.params,
      modelName: detail.modelName,
      resultAssetId: detail.resultAssetId,
      resultFileUrl: detail.resultFileUrl,
      errorMessage: detail.errorMessage,
      recipe: detail.recipe,
      recipeSource: detail.recipeSource,
      variables: detail.variables,
      variablesSource: detail.variablesSource,
      sourceImageUrl: detail.sourceImageUrl,
      sourceAssetId: detail.sourceAssetId,
      sourceTemplateId: detail.sourceTemplateId,
      sourceTemplateName: detail.sourceTemplateName,
      savedTemplate: detail.savedTemplate,
      analysisTemplateVariables: detail.analysisTemplateVariables,
      createdAt: detail.createdAt.toISOString(),
      updatedAt: detail.updatedAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message, code: "SERVICE_UNAVAILABLE", retryable: true }, { status: 500 });
  }
}
