"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";

interface CopyJsonButtonProps {
  value: string;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export function CopyJsonButton({
  value,
  label = "Copy JSON",
  showIcon = false,
  className = "",
}: CopyJsonButtonProps) {
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    if (!navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(value);
      setShowSuccessToast(true);

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setShowSuccessToast(false);
      }, 2_000);
    } catch {
      // Only confirm the action after the clipboard write succeeds.
    }
  };

  return (
    <>
      <button type="button" onClick={() => void handleCopy()} className={className}>
        {showIcon && <AppIcon icon={Copy} size={13} />}
        {label}
      </button>
      {showSuccessToast &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="pointer-events-none fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[var(--surface-floating)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-ambient)] ring-1 ring-[var(--border-static)] backdrop-blur-[30px]"
          >
            <AppIcon icon={Check} size={16} className="text-[var(--color-success)]" />
            Copied successfully
          </div>,
          document.body,
        )}
    </>
  );
}
