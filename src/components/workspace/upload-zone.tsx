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
    return "Only JPG, PNG, and WebP images are supported";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "File size must be 10MB or less";
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
      // 如果已有Reference，显示Confirm对话框
      if (referenceImageUrl && !showReplaceConfirm) {
        setShowReplaceConfirm(true);
        // 暂存文件，等待用户Confirm
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
        {/* 内联替换Confirm */}
        {showReplaceConfirm ? (
          <div className="w-full rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] p-6">
            <p className="text-center text-sm font-medium text-[var(--color-warning)]">
              Replace the current reference?
            </p>
            <p className="mt-2 text-center text-xs text-[var(--color-warning)]/80">
              This will clear the current analysis and generated result
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCancelReplace}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] ring-1 ring-[var(--border)]/15 transition-colors hover:bg-[var(--surface-bright)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm text-[var(--text-on-primary)] transition-colors hover:bg-[var(--accent-primary)]/80"
              >
                Replace Reference
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-[var(--border)]/15">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceImageUrl}
                alt="Reference preview"
                className="h-auto w-full object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowReplaceConfirm(true)}
              className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] ring-1 ring-[var(--border)]/15/15 transition-colors hover:bg-[var(--surface-bright)]"
            >
              Replace Reference
            </button>
          </>
        )}
      </div>
    );
  }

  // Show upload progress
  if (isUploading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[var(--accent-primary)]/30 bg-[var(--accent-primary-soft)] p-4">
        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-[var(--surface-bright)]">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">Uploading... {uploadProgress}%</p>
      </div>
    );
  }

  // Show drop zone with onboarding guidance
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center">
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
        className={`flex min-h-0 w-full flex-1 cursor-pointer flex-col justify-center rounded-2xl border border-dashed p-4 text-center transition-colors md:p-5 ${
          isDragOver
            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
            : "border-[var(--border)]/15 bg-[var(--surface-low)] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-mid)]"
        }`}
      >
        <div className="mb-3 flex items-center justify-center" aria-hidden="true">
          <span className="icon text-[var(--accent-primary)]">add_photo_alternate</span>
        </div>
        <p className="text-base font-medium text-[var(--text-primary)]">
          Click or drag to upload a reference image
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          JPG, PNG, or WebP, up to 10MB
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)]">
          <span>Reference</span>
          <span aria-hidden="true">→</span>
          <span>Evidence readiness</span>
          <span aria-hidden="true">→</span>
          <span>Render-ready prompt</span>
        </div>
        <p className="mx-auto mt-3 max-w-md text-xs leading-5 text-[var(--text-secondary)]">
          AI keeps color, composition, lighting, texture, and mood evidence available
          for prompt edits, render decisions, and Style Memory.
        </p>
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
