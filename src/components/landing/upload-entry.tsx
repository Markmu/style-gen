"use client";

import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useFileStore } from "@/components/landing/use-file-store";

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

export function UploadEntry() {
  const router = useRouter();
  const { data: session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setFile } = useFileStore();

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);

      if (session) {
        setFile(file);
        router.push("/workspace");
      } else {
        // 未登录：触发 Google OAuth，登录成功后跳转工作区
        signIn("google", { callbackUrl: "/workspace" });
      }
    },
    [router, session, setFile],
  );

  const handleClick = useCallback(() => {
    if (session) {
      inputRef.current?.click();
    } else {
      // 未登录：触发 Google OAuth，登录成功后跳转工作区
      signIn("google", { callbackUrl: "/workspace" });
    }
  }, [session]);

  const handleReset = useCallback(() => {
    setError(null);
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
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
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <div className="flex flex-col items-center px-4">
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
        className={`glass-panel interactive-lift w-full max-w-2xl cursor-pointer rounded-lg p-8 text-center ${
          isDragOver
            ? "bg-[var(--accent-primary-soft)]"
            : "hover:bg-[var(--surface-panel)]"
        }`}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-primary-soft)]">
          <span className="icon text-[var(--accent-primary)]" aria-hidden="true">cloud_upload</span>
        </div>
        <p className="text-base font-medium text-[var(--text-primary)]">
          点击或拖拽上传参考图
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          支持 JPG / PNG / WebP，不超过 10MB
        </p>
      </div>
      {error && (
        <div
          className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--color-error)]"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="btn-secondary rounded-md px-3 py-1.5 text-xs"
            onClick={handleReset}
            type="button"
          >
            重新选择
          </button>
        </div>
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
