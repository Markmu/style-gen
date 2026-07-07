"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthHeader } from "@/components/auth/auth-header";

const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";

export type AppShellVariant = "landing" | "workspace" | "memory";

interface AppShellProps {
  children: ReactNode;
  variant?: AppShellVariant;
  pageLabel?: string;
  statusSummary?: ReactNode;
  actions?: ReactNode;
}

function inferVariant(pathname: string | null): AppShellVariant {
  if (pathname?.startsWith("/workspace/templates")) return "memory";
  if (pathname?.startsWith("/workspace")) return "workspace";
  return "landing";
}

function inferPageLabel(variant: AppShellVariant, pageLabel?: string) {
  if (pageLabel) return pageLabel;
  if (variant === "memory") return "Style Memory";
  if (variant === "workspace") return "Workspace";
  return "Landing";
}

export function AppShell({
  children,
  variant,
  pageLabel,
  statusSummary,
  actions,
}: AppShellProps) {
  const pathname = usePathname();
  const resolvedVariant = variant ?? inferVariant(pathname);
  const resolvedPageLabel = inferPageLabel(resolvedVariant, pageLabel);
  const isWorkspaceRoute = pathname?.startsWith("/workspace") ?? false;
  const [initialWorkspaceSnapshot] = useState(() => {
    if (typeof window === "undefined") return null;
    if (!window.location.pathname.startsWith("/workspace")) return null;
    return window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
  });

  useEffect(() => {
    if (!isWorkspaceRoute || !initialWorkspaceSnapshot) return;

    const restoreTimer = window.setTimeout(() => {
      if (!window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY)) {
        window.sessionStorage.setItem(
          WORKSPACE_STORAGE_KEY,
          initialWorkspaceSnapshot,
        );
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [initialWorkspaceSnapshot, isWorkspaceRoute]);

  return (
    <div
      data-testid="app-shell"
      data-variant={resolvedVariant}
      data-page-label={resolvedPageLabel}
      className={`workspace-chromatic ${
        isWorkspaceRoute
          ? "flex h-screen min-h-0 flex-col overflow-hidden"
          : "min-h-screen"
      }`}
    >
      {isWorkspaceRoute && (
        <Suspense
          fallback={
            <div className="h-[var(--header-height)] shrink-0 bg-[var(--surface-page)]" />
          }
        >
          <AuthHeader />
        </Suspense>
      )}

      {(statusSummary || actions) && (
        <div className="surface-panel mx-4 mt-4 flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">{statusSummary}</div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}

      <div
        className={
          isWorkspaceRoute ? "min-h-0 flex-1 overflow-hidden" : "min-h-screen"
        }
      >
        {children}
      </div>
    </div>
  );
}
