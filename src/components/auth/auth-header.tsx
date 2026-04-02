"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { LoginButton } from "./login-button";
import { UserMenu } from "./user-menu";
import { trackAuthEvent } from "./auth-tracking";

function getOAuthErrorMessage(error: string): string {
  switch (error) {
    case "OAuthAccountNotLinked":
      return "登录失败";
    case "AccessDenied":
      return "登录已取消";
    default:
      return "登录失败，请重试";
  }
}

export function AuthHeader() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const prevStatusRef = useRef(status);

  // OAuth 错误提示检测
  const oauthError = searchParams.get("error");
  useEffect(() => {
    if (oauthError) {
      trackAuthEvent("login_failed");
      setErrorMessage(getOAuthErrorMessage(oauthError));
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [oauthError]);

  // 登录成功埋点：status 从 loading 变为 authenticated
  useEffect(() => {
    if (
      prevStatusRef.current === "loading" &&
      status === "authenticated"
    ) {
      trackAuthEvent("login_success");
    }
    prevStatusRef.current = status;
  }, [status]);

  if (status === "loading") return null; // 避免闪烁

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface-base)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="icon text-[var(--accent-primary)]">auto_awesome</span>
            <span className="text-base font-bold text-[var(--text-primary)]">StyleGen</span>
          </Link>

          {/* 功能链接 */}
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/#features"
              className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <span className="icon text-base">explore</span>
              功能
            </Link>
            <Link
              href="/workspace"
              className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <span className="icon text-base">hub</span>
              工作台
            </Link>
          </nav>

          <div>{session ? <UserMenu /> : <LoginButton />}</div>
        </div>
      </header>
      {errorMessage && (
        <div className="fixed top-16 right-4 z-50 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)] shadow-md backdrop-blur-sm">
          {errorMessage}
        </div>
      )}
    </>
  );
}
