"use client";

import { LeftSidebar } from "@/components/workspace/left-sidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-var(--header-height))] min-h-0 bg-[var(--surface-page)]">
      <LeftSidebar />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
