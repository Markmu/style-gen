"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { House, Library, Network } from "lucide-react";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
import { LoginButton } from "./login-button";
import { UserMenu } from "./user-menu";
import { trackAuthEvent } from "./auth-tracking";
import { VisorynMark } from "@/components/brand/visoryn-mark";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function getOAuthErrorMessage(error: string): string {
  switch (error) {
    case "OAuthAccountNotLinked":
      return "Login could not link this account. Your workspace context stays preserved, and you can try another login method.";
    case "AccessDenied":
      return "Login was canceled. Your reference and prompt context stay preserved, and you can return to the workspace when ready.";
    default:
      return "Login could not be completed. Your workspace context stays preserved, and you can try again.";
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

  const navItems: Array<{
    label: string;
    href: string;
    icon: AppIconComponent;
    active: boolean;
  }> = [
    { label: "Home", href: "/", icon: House, active: pathname === "/" },
    {
      label: "Workspace",
      href: "/workspace",
      icon: Network,
      active: pathname === "/workspace",
    },
    {
      label: "Style Memory",
      href: "/workspace/templates",
      icon: Library,
      active: pathname.startsWith("/workspace/templates"),
    },
  ];

  return (
    <>
      <header className="glass-panel sticky top-0 z-50 rounded-none border-x-0 border-t-0">
        <div className="flex h-[var(--header-height)] items-center justify-between px-6">
          <Link
            href="/"
            className="interactive-lift flex items-center gap-2.5 rounded-md px-2 py-1.5"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            <VisorynMark className="h-6 w-6 shrink-0 text-[var(--text-primary)]" />
            <span className="text-base font-bold text-[var(--text-primary)]">
              Visoryn
            </span>
          </Link>

          <nav
            data-testid="app-shell-primary-nav"
            className="hidden items-center gap-2 md:flex"
            aria-label="Site navigation"
          >
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
                <AppIcon icon={item.icon} size={16} />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div data-testid="app-shell-auth-entry">
              {status === "loading" ? (
                <div
                  aria-label="Checking login status"
                  className="h-9 w-9 animate-pulse rounded-lg bg-[var(--surface-low)] motion-reduce:animate-none"
                  role="status"
                />
              ) : session ? (
                <UserMenu />
              ) : (
                <LoginButton />
              )}
            </div>
          </div>
        </div>
      </header>
      {errorMessage && (
        <div
          className="glass-panel fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm text-[var(--text-primary)]"
          role="alert"
        >
          <span
            className="status-tone-dot mt-1 inline-flex h-2.5 w-2.5 shrink-0"
            data-tone="warning"
            aria-hidden="true"
          />
          <span className="leading-6">{errorMessage}</span>
        </div>
      )}
    </>
  );
}
