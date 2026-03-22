"use client";

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "仅支持 JPG、PNG、WebP 格式的图片";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "文件大小不能超过 10MB";
  }
  return null;
}

interface UploadZoneProps {
  referenceImageUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
}

export function UploadZone({
  referenceImageUrl,
  isUploading,
  uploadProgress,
  onFileSelected,
  onReplace,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // Show reference image preview after upload
  if (referenceImageUrl && !isUploading) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full overflow-hidden rounded-xl border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referenceImageUrl}
            alt="参考图预览"
            className="h-auto w-full object-contain"
          />
        </div>
        <button
          type="button"
          onClick={onReplace}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          替换参考图
        </button>
      </div>
    );
  }

  // Show upload progress
  if (isUploading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-10">
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600">正在上传... {uploadProgress}%</p>
      </div>
    );
  }

  // Show drop zone
  return (
    <div className="flex flex-col items-center">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50"
        }`}
      >
        <div className="mb-3 text-4xl" aria-hidden="true">
          +
        </div>
        <p className="text-base font-medium text-gray-700">
          点击或拖拽上传参考图
        </p>
        <p className="mt-2 text-sm text-gray-500">
          支持 JPG / PNG / WebP，不超过 10MB
        </p>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
