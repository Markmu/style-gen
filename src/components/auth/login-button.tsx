"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { LoaderCircle, LogIn } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";

export function LoginButton({
  compact = false,
  compactOnMobile = false,
}: {
  compact?: boolean;
  compactOnMobile?: boolean;
}) {
  const [isPending, setIsPending] = useState(false);

  const handleLogin = async () => {
    setIsPending(true);
    try {
      await signIn("google");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      aria-busy={isPending}
      disabled={isPending}
      onClick={handleLogin}
      className={`btn-secondary inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium ${
        compact
          ? "w-9 px-0"
          : compactOnMobile
            ? "w-9 px-0 md:w-full md:px-4"
            : "px-4"
      }`}
      type="button"
      aria-label={
        compact || compactOnMobile
          ? isPending
            ? "Opening login"
            : "Log in"
          : undefined
      }
    >
      <AppIcon
        icon={isPending ? LoaderCircle : LogIn}
        size={16}
        className={isPending ? "animate-spin" : undefined}
      />
      {!compact && (
        <span className={compactOnMobile ? "hidden md:inline" : undefined}>
          {isPending ? "Opening login" : "Log in"}
        </span>
      )}
    </button>
  );
}
