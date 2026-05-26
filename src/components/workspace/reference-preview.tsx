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
  const hasReference = !!referenceImageUrl;

  return (
    <div
      data-testid="reference-preview"
      className="flex min-h-[180px] min-w-0 basis-[33%] shrink-0 flex-col overflow-hidden"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="label-tech text-[var(--accent-primary)]">Image</h2>
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

      {hasReference ? (
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
