"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackAuthEvent } from "@/components/auth/auth-tracking";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "style-gen:workspace-sidebar-collapsed";

const navItems = [
  {
    label: "Generate",
    href: "/workspace",
    icon: (
      <span className="material-symbols-outlined text-lg" aria-hidden="true">
        auto_awesome
      </span>
    ),
    match: (pathname: string) => pathname === "/workspace",
  },
  {
    label: "Library",
    href: "/workspace/templates",
    icon: (
      <span className="material-symbols-outlined text-lg" aria-hidden="true">
        library_books
      </span>
    ),
    match: (pathname: string) =>
      pathname.startsWith("/workspace/templates"),
  },
] as const;

export function LeftSidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const hasMountedCollapsePreference = useRef(false);
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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsed(stored === "true");
      }
    } catch {
      // Ignore storage failures; the sidebar remains fully usable.
    }
  }, []);

  useEffect(() => {
    if (!hasMountedCollapsePreference.current) {
      hasMountedCollapsePreference.current = true;
      return;
    }

    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(isCollapsed),
      );
    } catch {
      // Ignore storage failures; this preference is non-critical.
    }
  }, [isCollapsed]);

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
      aria-label="工作区导航"
      data-collapsed={isCollapsed}
      className={`surface-panel flex h-full flex-shrink-0 flex-col transition-[width] duration-200 ease-out ${
        isCollapsed ? "w-[4.25rem]" : "w-48"
      }`}
    >
      {/* Brand */}
      <div
        className={
          isCollapsed
            ? "flex flex-col items-center gap-2 px-2 py-4"
            : "flex items-center justify-between gap-2 px-3.5 py-4"
        }
      >
        <Link
          href="/"
          className={`flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80 ${
            isCollapsed ? "justify-center" : ""
          }`}
        >
          <span
            className="material-symbols-outlined text-2xl text-[var(--accent-primary)]"
            aria-hidden="true"
          >
            palette
          </span>
          {!isCollapsed && (
            <span className="truncate text-base font-bold text-[var(--text-primary)]">
              Visoryn
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => {
            setIsCollapsed((collapsed) => !collapsed);
            setIsUserMenuOpen(false);
          }}
          aria-label={isCollapsed ? "展开菜单栏" : "折叠菜单栏"}
          title={isCollapsed ? "展开菜单栏" : "折叠菜单栏"}
          className="interactive-lift flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            {isCollapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 space-y-1 ${isCollapsed ? "px-2" : "px-2.5"}`}>
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              aria-current={active ? "page" : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              title={isCollapsed ? item.label : undefined}
              className={`interactive-lift flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                isCollapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.icon}
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Signed-in user */}
      <div className="relative border-t border-[var(--border-static)] px-2.5 pt-3 pb-4">
        {status === "loading" ? (
          <div
            className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
              isCollapsed ? "justify-center px-0" : ""
            }`}
          >
            <div className="h-9 w-9 rounded-full bg-[var(--surface-bright)]" />
            {!isCollapsed && (
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-24 rounded-full bg-[var(--surface-bright)]" />
                <div className="h-2.5 w-32 rounded-full bg-[var(--surface-bright)]" />
              </div>
            )}
          </div>
        ) : (
          <div ref={userMenuRef} className="relative">
            {isUserMenuOpen && (
              <div
                className={`absolute z-20 rounded-lg border border-[var(--border)] bg-[var(--surface-bright)] py-2 shadow-lg backdrop-blur-sm ${
                  isCollapsed
                    ? "bottom-0 left-full ml-2 w-44"
                    : "right-0 bottom-full left-0 mb-2"
                }`}
              >
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-mid)] hover:text-[var(--text-primary)]"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    logout
                  </span>
                  退出登录
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((open) => !open)}
              aria-label={
                isCollapsed
                  ? `用户菜单：${userName || userEmail || "Workspace user"}`
                  : "用户菜单"
              }
              aria-expanded={isUserMenuOpen}
              title={isCollapsed ? userName || userEmail || "用户菜单" : undefined}
              className={`interactive-lift flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left ${
                isCollapsed ? "justify-center gap-0 px-0" : ""
              }`}
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-bright)]">
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
              {!isCollapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                      {userName || "Signed in"}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-secondary)]">
                      {userEmail || "Workspace user"}
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-base text-[var(--text-muted)]" aria-hidden="true">
                    expand_less
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
