import { NextRequest, NextResponse } from "next/server";
import { findGenerationTaskById, findByIdWithRecipe } from "@/lib/repositories/generation-task-repository";
import { findAssetById } from "@/lib/repositories/asset-repository";
import { auth } from "@/auth";

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

    const task = await findGenerationTaskById(id, userId);

    if (!task) {
      return NextResponse.json(
        { error: "Generation task not found", code: "NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    // 如果是 completed 状态，使用 findByIdWithRecipe 获取含 recipe 的详情
    if (task.status === "completed") {
      const detail = await findByIdWithRecipe(id, userId);
      if (detail) {
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
          recipe: detail.recipe ?? null,
          sourceAssetId: detail.sourceAssetId,
          sourceImageUrl: detail.sourceImageUrl,
          variables: detail.variables,
          analysisTemplateVariables: detail.analysisTemplateVariables,
          errorMessage: null,
          createdAt: detail.createdAt.toISOString(),
          updatedAt: detail.updatedAt.toISOString(),
        });
      }
    }

    // 非 completed 状态或 findByIdWithRecipe 未返回结果：走原有逻辑
    let resultFileUrl: string | null = null;
    if (task.status === "completed" && task.resultAssetId) {
      const asset = await findAssetById(task.resultAssetId);
      if (asset) {
        resultFileUrl = asset.fileUrl;
      }
    }

    return NextResponse.json({
      id: task.id,
      analysisTaskId: task.analysisTaskId,
      status: task.status,
      promptSnapshot: task.promptSnapshot,
      negativePromptSnapshot: task.negativePromptSnapshot,
      params: task.params,
      modelName: task.modelName,
      resultAssetId: task.resultAssetId,
      resultFileUrl,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message, code: "SERVICE_UNAVAILABLE", retryable: true }, { status: 500 });
  }
}
