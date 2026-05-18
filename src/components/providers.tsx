"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FileStoreProvider } from "@/components/landing/use-file-store";
import { clearWorkspacePersistedState } from "@/hooks/use-workspace-state";

function WorkspacePersistenceGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname && pathname !== "/workspace") {
      clearWorkspacePersistedState();
    }
  }, [pathname]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <WorkspacePersistenceGuard />
        <FileStoreProvider>{children}</FileStoreProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
