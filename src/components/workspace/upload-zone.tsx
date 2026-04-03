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
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      // 如果已有参考图，显示确认对话框
      if (referenceImageUrl && !showReplaceConfirm) {
        setShowReplaceConfirm(true);
        // 暂存文件，等待用户确认
        return;
      }

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setShowReplaceConfirm(false);
        return;
      }
      setError(null);
      setShowReplaceConfirm(false);
      onFileSelected(file);
    },
    [onFileSelected, referenceImageUrl, showReplaceConfirm],
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

  const handleConfirmReplace = useCallback(() => {
    setShowReplaceConfirm(false);
    onReplace();
  }, [onReplace]);

  const handleCancelReplace = useCallback(() => {
    setShowReplaceConfirm(false);
  }, []);

  // Show reference image preview after upload
  if (referenceImageUrl && !isUploading) {
    return (
      <div className="flex flex-col items-center gap-4">
        {/* 内联替换确认 */}
        {showReplaceConfirm ? (
          <div className="w-full rounded-xl border-2 border-amber-500/30 bg-amber-500/10 p-6">
            <p className="text-center text-sm font-medium text-amber-400">
              替换当前参考图？
            </p>
            <p className="mt-2 text-center text-xs text-amber-400/70">
              这将清除当前的分析结果和生成内容
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCancelReplace}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--surface-bright)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                className="rounded-lg px-4 py-2 text-sm text-white bg-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)]/80"
              >
                确认替换
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceImageUrl}
                alt="参考图预览"
                className="h-auto w-full object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowReplaceConfirm(true)}
              className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] ring-1 ring-[var(--border)]/15 transition-colors hover:bg-[var(--surface-bright)]"
            >
              替换参考图
            </button>
          </>
        )}
      </div>
    );
  }

  // Show upload progress
  if (isUploading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 p-10">
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-[var(--surface-bright)]">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">正在上传... {uploadProgress}%</p>
      </div>
    );
  }

  // Show drop zone with onboarding guidance
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
        className={`w-full cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors md:p-12 ${
          isDragOver
            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
            : "border-[var(--border)]/15 bg-[var(--surface-low)] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-mid)]"
        }`}
      >
        <div className="mb-3 flex items-center justify-center" aria-hidden="true">
          <span className="icon text-[var(--accent-primary)]">add_photo_alternate</span>
        </div>
        <p className="text-base font-medium text-[var(--text-primary)]">
          点击或拖拽上传参考图
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          支持 JPG / PNG / WebP，不超过 10MB
        </p>
        <div className="mt-6 flex items-center justify-center gap-6 text-xs text-[var(--text-secondary)]">
          <span>1. 上传参考图</span>
          <span aria-hidden="true">→</span>
          <span>2. AI 分析风格</span>
          <span aria-hidden="true">→</span>
          <span>3. 生成同风格新图</span>
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-[var(--color-error)]" role="alert">
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
