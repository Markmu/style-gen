"use client";

import { LeftSidebar } from "@/components/workspace/left-sidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-chromatic flex h-screen min-h-0 overflow-hidden bg-[var(--surface-page)]">
      <LeftSidebar />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
