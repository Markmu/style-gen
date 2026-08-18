"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, History, Layers3, LogOut, Sparkles } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { trackAuthEvent } from "@/components/auth/auth-tracking";
import { VisorynMark } from "@/components/brand/visoryn-mark";
import { LoginButton } from "@/components/auth/login-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  {
    label: "Generate",
    ariaLabel: "Generate",
    href: "/workspace",
    tone: "generate",
    icon: Sparkles,
    match: (pathname: string) => pathname === "/workspace",
  },
  {
    label: "Library",
    ariaLabel: "Style Memory Library",
    href: "/workspace/templates",
    tone: "library",
    icon: Layers3,
    match: (pathname: string) => pathname.startsWith("/workspace/templates"),
  },
  {
    label: "Iterations",
    ariaLabel: "Iterations",
    href: "/workspace/iterations",
    tone: "iterations",
    icon: History,
    match: (pathname: string) => pathname.startsWith("/workspace/iterations"),
  },
] as const;

export function LeftSidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userName = session?.user.name ?? "";
  const userEmail = session?.user.email ?? "";
  const avatarUrl = session?.user.avatarUrl ?? session?.user.image;
  const initials =
    userName.charAt(0).toUpperCase() || userEmail.charAt(0).toUpperCase() || "U";
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
      setIsUserMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen, handleClickOutside]);

  async function handleSignOut() {
    trackAuthEvent("logout");
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      window.location.href = "/";
    }
  }

  return (
    <aside
      aria-label="Workspace navigation"
      className="workspace-sidebar surface-panel flex h-full w-[4.5rem] flex-shrink-0 flex-col px-2 pb-3 pt-4 md:w-[14.125rem] md:px-3"
    >
      <div className="flex items-center justify-center px-1 md:justify-start md:px-2">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
          aria-label="Visoryn home"
        >
          <VisorynMark className="workspace-sidebar-brand-mark shrink-0" />
          <span className="hidden truncate text-lg font-bold text-[var(--text-primary)] md:inline">
            Visoryn
          </span>
        </Link>
      </div>

      <nav className="mt-8 space-y-2 md:mt-10" aria-label="Workspace primary navigation">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.ariaLabel}
              aria-current={active ? "page" : undefined}
              data-tone={item.tone}
              data-active={active}
              className={`workspace-sidebar-nav-item flex w-full items-center justify-center gap-0 rounded-lg px-2 py-3 text-sm font-semibold md:justify-start md:gap-3 md:px-3.5 ${
                active ? "is-active" : "text-[var(--text-secondary)]"
              }`}
            >
              <AppIcon
                icon={item.icon}
                size={18}
                className="workspace-sidebar-nav-icon"
              />
              <span className="hidden min-w-0 truncate leading-tight md:inline">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        <ThemeToggle placement="sidebar" />
        <div ref={userMenuRef} className="relative">
          {isUserMenuOpen && (
            <div className="workspace-sidebar-menu absolute bottom-full left-0 z-20 mb-2 w-40 rounded-lg py-2 md:right-0 md:w-auto">
              <button
                type="button"
                onClick={handleSignOut}
                className="workspace-sidebar-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <AppIcon icon={LogOut} size={16} />
                Log out
              </button>
            </div>
          )}

          {status === "loading" ? (
            <div className="workspace-sidebar-user flex items-center justify-center gap-0 rounded-lg px-1 py-2.5 md:justify-start md:gap-3 md:px-3">
              <div className="h-9 w-9 rounded-full bg-[var(--surface-bright)]" />
              <div className="hidden min-w-0 flex-1 space-y-2 md:block">
                <div className="h-3 w-24 rounded-full bg-[var(--surface-bright)]" />
                <div className="h-2.5 w-32 rounded-full bg-[var(--surface-bright)]" />
              </div>
            </div>
          ) : session ? (
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((open) => !open)}
              aria-label="User menu"
              aria-expanded={isUserMenuOpen}
              className="workspace-sidebar-user flex w-full min-w-0 items-center justify-center gap-0 rounded-lg px-1 py-2.5 text-left md:justify-start md:gap-3 md:px-3"
            >
              <span className="workspace-sidebar-avatar flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={userName || userEmail || "User"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    {initials}
                  </span>
                )}
              </span>
              <span className="hidden min-w-0 flex-1 md:block">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                  {userName || "Signed in"}
                </span>
                <span className="block truncate text-xs text-[var(--text-secondary)]">
                  {userEmail || "Workspace user"}
                </span>
              </span>
              <AppIcon
                icon={ChevronUp}
                size={16}
                className="hidden text-[var(--text-muted)] md:block"
              />
            </button>
          ) : (
            <div
              data-testid="workspace-sidebar-auth-entry"
              className="flex justify-center md:block"
            >
              <LoginButton compactOnMobile />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
