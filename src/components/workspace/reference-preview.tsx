"use client";

import Image from "next/image";
import { UploadZone } from "@/components/workspace/upload-zone";

interface ReferencePreviewProps {
  referenceImageUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
}

export function ReferencePreview({
  referenceImageUrl,
  isUploading,
  uploadProgress,
  onFileSelected,
  onReplace,
}: ReferencePreviewProps) {
  return (
    <div
      data-testid="reference-preview"
      className="surface-panel flex h-[230px] shrink-0 flex-col rounded-xl p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          参考图
        </h2>
        {referenceImageUrl && (
          <button
            type="button"
            onClick={onReplace}
            className="btn-secondary rounded-md px-3 py-1.5 text-xs"
          >
            更换
          </button>
        )}
      </div>

      {referenceImageUrl ? (
        <div className="media-lens relative min-h-0 flex-1 rounded-lg">
          <Image
            src={referenceImageUrl}
            alt="参考图"
            fill
            className="object-contain"
            unoptimized
          />
        </div>
      ) : (
        <UploadZone
          referenceImageUrl={null}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          onFileSelected={onFileSelected}
          onReplace={onReplace}
        />
      )}
    </div>
  );
}
