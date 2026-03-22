import { NextRequest, NextResponse } from "next/server";
import { generatePresignedUploadUrl, getPublicUrl } from "@/lib/r2";
import { generateId } from "@/lib/ulid";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface PresignRequestBody {
  fileName: string;
  mimeType: string;
}

interface PresignResponseBody {
  presignedUrl: string;
  fileUrl: string;
  assetId: string;
}

interface ApiErrorResponse {
  error: string;
  code: string;
  retryable: boolean;
}

/** 结构化日志输出 */
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<PresignResponseBody | ApiErrorResponse>> {
  try {
  const body = (await request.json()) as Partial<PresignRequestBody>;

  if (!body.fileName || !body.mimeType) {
    return NextResponse.json(
      { error: "fileName and mimeType are required", code: "INVALID_REQUEST", retryable: false },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME_TYPES.has(body.mimeType)) {
    return NextResponse.json(
      { error: "mimeType must be one of: image/jpeg, image/png, image/webp", code: "INVALID_MIME_TYPE", retryable: false },
      { status: 400 }
    );
  }

  const assetId = generateId();
  const ext = body.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  const key = `references/${assetId}/original.${ext}`;

  log("upload_presign_request_received", { assetId, fileName: body.fileName, mimeType: body.mimeType });

  try {
    const presignedUrl = await generatePresignedUploadUrl(key, body.mimeType);
    const fileUrl = getPublicUrl(key);

    log("upload_presign_completed", { assetId });

    return NextResponse.json({ presignedUrl, fileUrl, assetId });
  } catch {
    log("upload_presign_failed", { assetId });

    return NextResponse.json(
      { error: "Failed to generate presigned URL", code: "PRESIGN_FAILED", retryable: true },
      { status: 500 }
    );
  }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST", retryable: false },
      { status: 400 }
    );
  }
}
