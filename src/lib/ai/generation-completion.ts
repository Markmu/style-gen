import { updateGenerationTask } from "@/lib/repositories/generation-task-repository";
import { createAsset } from "@/lib/repositories/asset-repository";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";

/**
 * 生成结果的共享落盘管线：下载图片 → 转存 R2 → 创建 Asset → 标记任务 completed
 * isAborted 返回 true 时提前停止，返回 false；正常完成返回 true
 */
export async function completeGenerationTask(params: {
  taskId: string;
  userId: string;
  imageUrl: string;
  width: number;
  height: number;
  isAborted?: () => boolean;
}): Promise<boolean> {
  const imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }

  const r2Key = `generated/${params.taskId}/result.webp`;
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  await uploadBuffer(r2Key, imageBuffer, "image/webp");

  // 超时后不再继续更新状态
  if (params.isAborted?.()) return false;

  const asset = await createAsset(params.userId, {
    type: "generated",
    fileUrl: getPublicUrl(r2Key),
    thumbnailUrl: null,
    width: params.width,
    height: params.height,
    mimeType: "image/webp",
  });

  // 最终检查 aborted 状态，避免覆盖 failed 状态
  if (params.isAborted?.()) return false;

  await updateGenerationTask(params.taskId, {
    status: "completed",
    resultAssetId: asset.id,
  });

  return true;
}
