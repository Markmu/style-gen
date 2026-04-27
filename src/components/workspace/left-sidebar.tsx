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
    <aside
      aria-label="工作区导航"
      className="surface-panel flex h-full w-56 flex-shrink-0 flex-col"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span
          className="material-symbols-outlined text-2xl text-[var(--accent-primary)]"
          aria-hidden="true"
        >
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

      {/* Bottom links */}
      <div className="space-y-1 px-3 pt-3 pb-4">
        {bottomLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="interactive-lift flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          >
            {link.icon}
            {link.label}
          </a>
        ))}
      </div>
    </aside>
  );
}
