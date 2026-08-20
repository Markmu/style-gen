import { updateGenerationTask } from "@/lib/repositories/generation-task-repository";
import { createAsset } from "@/lib/repositories/asset-repository";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";

/** base64 内联图片的兜底 MIME（Provider 契约里 mimeType 必传，此处仅防御） */
const INLINE_DEFAULT_MIME_TYPE = "image/png";

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "webp";
}

async function downloadImageBuffer(imageUrl: string): Promise<Buffer> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download generated image: ${imageResponse.status}`);
  }
  return Buffer.from(await imageResponse.arrayBuffer());
}

/**
 * 生成结果的共享落盘管线：获取图片（远程 URL 下载或内联 base64 解码）→ 转存 R2 → 创建 Asset → 标记任务 completed
 * isAborted 返回 true 时提前停止，返回 false；正常完成返回 true
 */
export async function completeGenerationTask(params: {
  taskId: string;
  userId: string;
  /** 远程图片 URL（fal/Replicate 路径）与 imageBase64（Gemini 内联路径）二选一 */
  imageUrl?: string;
  imageBase64?: string;
  /** 内联图片的实际 MIME 类型，用于 R2 key 扩展名与 Asset 记录 */
  mimeType?: string;
  width: number;
  height: number;
  isAborted?: () => boolean;
}): Promise<boolean> {
  let mimeType: string;
  let imageBuffer: Buffer;
  if (params.imageBase64) {
    mimeType = params.mimeType ?? INLINE_DEFAULT_MIME_TYPE;
    imageBuffer = Buffer.from(params.imageBase64, "base64");
  } else if (params.imageUrl) {
    mimeType = "image/webp";
    imageBuffer = await downloadImageBuffer(params.imageUrl);
  } else {
    throw new Error("imageUrl or imageBase64 is required");
  }

  const r2Key = `generated/${params.taskId}/result.${extensionForMimeType(mimeType)}`;
  await uploadBuffer(r2Key, imageBuffer, mimeType);

  // 超时后不再继续更新状态
  if (params.isAborted?.()) return false;

  const asset = await createAsset(params.userId, {
    type: "generated",
    fileUrl: getPublicUrl(r2Key),
    thumbnailUrl: null,
    width: params.width,
    height: params.height,
    mimeType,
  });

  // 最终检查 aborted 状态，避免覆盖 failed 状态
  if (params.isAborted?.()) return false;

  await updateGenerationTask(params.taskId, {
    status: "completed",
    resultAssetId: asset.id,
  });

  return true;
}
