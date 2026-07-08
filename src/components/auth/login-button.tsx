"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

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
      <span className="icon text-[1rem]" aria-hidden="true">
        {isPending ? "progress_activity" : "login"}
      </span>
      {isPending ? "Opening login" : "Log in"}
    </button>
  );
}
