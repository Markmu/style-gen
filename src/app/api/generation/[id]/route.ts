import { NextRequest, NextResponse } from "next/server";
import { findGenerationTaskById } from "@/lib/repositories/generation-task-repository";
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

    // 如果 completed 且有 resultAssetId，查询关联 Asset 获取 fileUrl
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
