"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackAuthEvent } from "@/components/auth/auth-tracking";

const navItems = [
  {
    label: "Generate",
    href: "/workspace",
    icon: (
      <span className="material-symbols-outlined text-lg">auto_awesome</span>
    ),
    match: (pathname: string) => pathname === "/workspace",
  },
  {
    label: "Library",
    href: "/workspace/templates",
    icon: (
      <span className="material-symbols-outlined text-lg">library_books</span>
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
      aria-label="工作区导航"
      className="surface-panel flex h-full w-48 flex-shrink-0 flex-col"
    >
      {/* Brand */}
      <a
        href="/"
        className="flex items-center gap-2.5 px-3.5 py-5 transition-opacity hover:opacity-80"
      >
        <span
          className="material-symbols-outlined text-2xl text-[var(--accent-primary)]"
          aria-hidden="true"
        >
          palette
        </span>
        <span className="text-base font-bold text-[var(--text-primary)]">
          Visoryn
        </span>
      </a>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2.5">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              aria-current={active ? "page" : undefined}
              className={`interactive-lift flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                active
                  ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Signed-in user */}
      <div className="relative border-t border-[var(--border-static)] px-2.5 pt-3 pb-4">
        {status === "loading" ? (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="h-9 w-9 rounded-full bg-[var(--surface-bright)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-24 rounded-full bg-[var(--surface-bright)]" />
              <div className="h-2.5 w-32 rounded-full bg-[var(--surface-bright)]" />
            </div>
          </div>
        ) : (
          <div ref={userMenuRef} className="relative">
            {isUserMenuOpen && (
              <div className="absolute right-0 bottom-full left-0 mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface-bright)] py-2 shadow-lg backdrop-blur-sm">
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
              aria-label="用户菜单"
              aria-expanded={isUserMenuOpen}
              className="interactive-lift flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left"
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
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
