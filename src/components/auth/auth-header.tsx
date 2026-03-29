"use client";

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
      <header className="fixed top-0 right-0 z-50 p-4">
        {session ? <UserMenu /> : <LoginButton />}
      </header>
      {errorMessage && (
        <div className="fixed top-16 right-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-md">
          {errorMessage}
        </div>
      )}
    </>
  );
}
