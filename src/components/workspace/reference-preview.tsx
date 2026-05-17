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
      className="surface-panel flex h-[230px] min-w-0 shrink-0 flex-col overflow-hidden rounded-xl p-4"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="label-tech text-[var(--text-muted)]">Image</h2>
        {referenceImageUrl && (
          <button
            type="button"
            onClick={onReplace}
            className="btn-secondary rounded-md px-3 py-1.5 text-xs"
          >
            Replace
          </button>
        )}
      </div>

      {referenceImageUrl ? (
        <div className="media-lens relative min-h-0 flex-1 rounded-lg">
          <Image
            src={referenceImageUrl}
            alt="Reference"
            fill
            className="object-contain"
            unoptimized
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <UploadZone
            referenceImageUrl={null}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            onFileSelected={onFileSelected}
            onReplace={onReplace}
          />
        </div>
      )}
    </div>
  );
}
