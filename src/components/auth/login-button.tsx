"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { LoaderCircle, LogIn } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";

export function LoginButton() {
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
      className="btn-secondary inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium"
      type="button"
    >
      <AppIcon
        icon={isPending ? LoaderCircle : LogIn}
        size={16}
        className={isPending ? "animate-spin" : undefined}
      />
      {isPending ? "Opening login" : "Log in"}
    </button>
  );
}
