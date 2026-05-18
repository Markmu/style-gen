// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";

describe("Providers workspace persistence guard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    navigationMocks.pathname = "/";
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("clears workspace session state on non-workspace routes", async () => {
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 3 }));

    render(
      <Providers>
        <div>Home</div>
      </Providers>,
    );

    await waitFor(() =>
      expect(sessionStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull(),
    );
  });

  it("preserves workspace session state while staying on the workspace route", () => {
    navigationMocks.pathname = "/workspace";
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 3 }));

    render(
      <Providers>
        <div>Workspace</div>
      </Providers>,
    );

    expect(sessionStorage.getItem(WORKSPACE_STORAGE_KEY)).not.toBeNull();
  });

  it("clears workspace session state after navigating from workspace to another page", async () => {
    navigationMocks.pathname = "/workspace";
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 3 }));

    const { rerender } = render(
      <Providers>
        <div>Workspace</div>
      </Providers>,
    );

    navigationMocks.pathname = "/workspace/templates";
    rerender(
      <Providers>
        <div>Templates</div>
      </Providers>,
    );

    await waitFor(() =>
      expect(sessionStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull(),
    );
  });
});
