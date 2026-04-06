import { NextRequest, NextResponse } from 'next/server';
import { handleReplicateWebhook } from '@/lib/ai/webhook-handler';

export async function POST(request: NextRequest) {
  // 1. 解析 query 参数
  const taskType = request.nextUrl.searchParams.get('taskType');
  const taskId = request.nextUrl.searchParams.get('taskId');

  // 2. 参数校验
  if (!taskType || !taskId) {
    return NextResponse.json(
      { error: 'Missing taskType or taskId' },
      { status: 400 }
    );
  }

  if (taskType !== 'analysis' && taskType !== 'generation') {
    return NextResponse.json(
      { error: 'Invalid taskType' },
      { status: 400 }
    );
  }

  // 3. 调用 webhook 处理逻辑（传入原始 Request 用于 SDK 签名验证）
  const result = await handleReplicateWebhook({
    taskType: taskType as 'analysis' | 'generation',
    taskId,
    request,
  });

  // 5. 返回响应
  return NextResponse.json(result.response, { status: result.status });
}
