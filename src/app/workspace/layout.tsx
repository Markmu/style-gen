"use client";

import { LeftSidebar } from "@/components/workspace/left-sidebar";
import { IterationMemoryViewProvider } from "@/hooks/use-iteration-memory-view";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <IterationMemoryViewProvider>
      <div className="flex h-full min-h-0 overflow-hidden bg-[var(--surface-page)]">
        <LeftSidebar />
        <main
          aria-label="Workspace content"
          className="min-w-0 flex-1 overflow-hidden"
        >
          {children}
        </main>
      </div>
    </IterationMemoryViewProvider>
  );
}
