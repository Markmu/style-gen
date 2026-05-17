"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { LoginButton } from "./login-button";
import { UserMenu } from "./user-menu";
import { trackAuthEvent } from "./auth-tracking";

function getOAuthErrorMessage(error: string): string {
  switch (error) {
    case "OAuthAccountNotLinked":
      return "Login failed";
    case "AccessDenied":
      return "Login canceled";
    default:
      return "Login failed. Please try again.";
  }
}

export function AuthHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
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

  // Log in成功埋点：status 从 loading 变为 authenticated
  useEffect(() => {
    if (
      prevStatusRef.current === "loading" &&
      status === "authenticated"
    ) {
      trackAuthEvent("login_success");
    }
    prevStatusRef.current = status;
  }, [status]);

  if (status === "loading") return null; // Avoid flicker.

  const navItems = [
    { label: "Home", href: "/", icon: "home", active: pathname === "/" },
    {
      label: "Workspace",
      href: "/workspace",
      icon: "hub",
      active: pathname === "/workspace",
    },
    {
      label: "Template Library",
      href: "/workspace/templates",
      icon: "library_books",
      active: pathname.startsWith("/workspace/templates"),
    },
  ];

  return (
    <>
      <header className="glass-panel sticky top-0 z-50">
        <div className="flex h-[var(--header-height)] items-center justify-between px-6">
          <Link
            href="/"
            className="interactive-lift flex items-center gap-2.5 rounded-md px-2 py-1.5"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            <span className="icon text-[var(--accent-primary)]" aria-hidden="true">
              auto_awesome
            </span>
            <span className="text-base font-bold text-[var(--text-primary)]">
              Visoryn
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Site navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={`interactive-lift flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  item.active
                    ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="icon text-base" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div>{session ? <UserMenu /> : <LoginButton />}</div>
        </div>
      </header>
      {errorMessage && (
        <div className="glass-panel fixed top-20 right-4 z-50 rounded-lg px-4 py-3 text-sm text-[var(--color-error)]">
          {errorMessage}
        </div>
      )}
    </>
  );
}
