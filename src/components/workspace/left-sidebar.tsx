"use client";

import { usePathname, useRouter } from "next/navigation";

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

const bottomLinks = [
  {
    label: "Docs",
    href: "#",
    icon: <span className="material-symbols-outlined text-lg">description</span>,
  },
  {
    label: "Help",
    href: "#",
    icon: <span className="material-symbols-outlined text-lg">help</span>,
  },
] as const;

export function LeftSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-mid)]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="material-symbols-outlined text-2xl text-[var(--accent-primary)]">
          palette
        </span>
        <span className="text-base font-bold text-[var(--text-primary)]">
          Visoryn
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-l-2 border-[var(--accent-primary)] bg-[var(--surface-bright)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom links */}
      <div className="border-t border-[var(--border)] px-3 pt-3 pb-4 space-y-1">
        {bottomLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          >
            {link.icon}
            {link.label}
          </a>
        ))}
      </div>
    </aside>
  );
}
