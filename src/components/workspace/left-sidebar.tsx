"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, Layers3, LogOut, Sparkles } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { trackAuthEvent } from "@/components/auth/auth-tracking";
import { VisorynMark } from "@/components/brand/visoryn-mark";

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
] as const;

const creditsPreview = {
  plan: "Pro Plan",
  used: 3240,
  limit: 10000,
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

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
  const creditsPercent = Math.min(
    100,
    Math.round((creditsPreview.used / creditsPreview.limit) * 100),
  );

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
      className="workspace-sidebar surface-panel flex h-full w-[14.125rem] flex-shrink-0 flex-col px-3 pb-3 pt-4"
    >
      <div className="flex items-center px-2">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
          aria-label="Visoryn home"
        >
          <VisorynMark className="workspace-sidebar-brand-mark shrink-0" />
          <span className="truncate text-lg font-bold text-[var(--text-primary)]">
            Visoryn
          </span>
        </Link>
      </div>

      <nav className="mt-10 space-y-2" aria-label="Workspace primary navigation">
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
              className={`workspace-sidebar-nav-item flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold ${
                active ? "is-active" : "text-[var(--text-secondary)]"
              }`}
            >
              <AppIcon
                icon={item.icon}
                size={18}
                className="workspace-sidebar-nav-icon"
              />
              <span className="min-w-0 truncate leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        <section className="workspace-sidebar-plan rounded-lg px-3 py-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {creditsPreview.plan}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {formatCredits(creditsPreview.used)} / {formatCredits(creditsPreview.limit)} credits
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-low)]"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-[var(--accent-primary)]"
              style={{ width: `${creditsPercent}%` }}
            />
          </div>
        </section>

        <div ref={userMenuRef} className="relative">
          {isUserMenuOpen && (
            <div className="workspace-sidebar-menu absolute right-0 bottom-full left-0 z-20 mb-2 rounded-lg py-2">
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
            <div className="workspace-sidebar-user flex items-center gap-3 rounded-lg px-3 py-2.5">
              <div className="h-9 w-9 rounded-full bg-[var(--surface-bright)]" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-24 rounded-full bg-[var(--surface-bright)]" />
                <div className="h-2.5 w-32 rounded-full bg-[var(--surface-bright)]" />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((open) => !open)}
              aria-label="User menu"
              aria-expanded={isUserMenuOpen}
              className="workspace-sidebar-user flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left"
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
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                  {userName || "Signed in"}
                </span>
                <span className="block truncate text-xs text-[var(--text-secondary)]">
                  {userEmail || "Workspace user"}
                </span>
              </span>
              <AppIcon icon={ChevronUp} size={16} className="text-[var(--text-muted)]" />
            </button>
          )}
        </div>

      </div>
    </aside>
  );
}
