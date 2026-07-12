"use client";

import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { ArrowRight, CloudUpload } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { useFileStore } from "@/components/landing/use-file-store";

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
        signIn("google", { callbackUrl: "/workspace" });
      }
    },
    [router, session, setFile],
  );

  const handleClick = useCallback(() => {
    if (session) {
      inputRef.current?.click();
    } else {
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
        aria-label="Upload a reference image"
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`glass-panel interactive-lift w-full max-w-3xl cursor-pointer rounded-lg p-6 text-left sm:p-8 ${
          isDragOver
            ? "bg-[var(--accent-primary-soft)]"
            : "hover:bg-[var(--surface-panel)]"
        }`}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-primary-soft)]">
              <AppIcon icon={CloudUpload} size={24} className="text-[var(--accent-primary)]" />
            </div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              Upload a reference image
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              The file is handed to Workspace first. AI reads it there as
              evidence before any analysis request starts.
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
              JPG, PNG, or WebP, up to 10MB
            </p>
          </div>
          <div className="readiness-row shrink-0" data-state="waiting">
            <AppIcon icon={ArrowRight} size={16} />
            <span className="text-sm font-medium">Start from reference</span>
          </div>
        </div>
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
            Choose Again
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
