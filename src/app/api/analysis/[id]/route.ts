import { NextRequest, NextResponse } from "next/server";
import { findAnalysisTaskById } from "@/lib/repositories/analysis-task-repository";
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
        { error: "Missing analysis task ID", code: "INVALID_REQUEST", retryable: false },
        { status: 400 }
      );
    }

    const task = await findAnalysisTaskById(id, userId);

    if (!task) {
      return NextResponse.json(
        { error: "Analysis task not found", code: "NOT_FOUND", retryable: false },
        { status: 404 }
      );
    }

    return NextResponse.json(task);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message, code: "SERVICE_UNAVAILABLE", retryable: true }, { status: 500 });
  }
}
