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
        className={`w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragOver
            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
            : "border-[var(--border)] bg-[var(--surface-low)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--surface-mid)]"
        }`}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-primary)]/10">
          <span className="icon text-[var(--accent-primary)]">cloud_upload</span>
        </div>
        <p className="text-base font-medium text-[var(--text-primary)]">
          点击或拖拽上传参考图
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          支持 JPG / PNG / WebP，不超过 10MB
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
