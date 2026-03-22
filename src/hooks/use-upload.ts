"use client";

import { useCallback, useState } from "react";

interface PresignResponse {
  presignedUrl: string;
  fileUrl: string;
  assetId: string;
}

interface UploadResult {
  assetId: string;
  fileUrl: string;
}

export function useUpload(): {
  upload: (file: File) => Promise<UploadResult>;
  progress: number;
  isUploading: boolean;
} {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const upload = useCallback(async (file: File): Promise<UploadResult> => {
    setIsUploading(true);
    setProgress(0);

    try {
      // Step 1: Get presigned URL
      setProgress(10);
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
        }),
      });

      if (!presignRes.ok) {
        const errorData = await presignRes.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error ?? "Failed to get presigned URL",
        );
      }

      const { presignedUrl, fileUrl, assetId } =
        (await presignRes.json()) as PresignResponse;

      // Step 2: Upload to R2 via presigned URL
      setProgress(30);

      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage");
      }

      setProgress(100);
      return { assetId, fileUrl };
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { upload, progress, isUploading };
}
