"use client";

import { LeftSidebar } from "@/components/workspace/left-sidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <LeftSidebar />
      <div className="flex-1 min-w-0 overflow-auto">{children}</div>
    </div>
  );
}
