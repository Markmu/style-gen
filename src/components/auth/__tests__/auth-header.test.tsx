// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthHeader } from "@/components/auth/auth-header";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  searchParams: new URLSearchParams(),
  signIn: vi.fn(),
  session: null as null | { user: { name?: string; email?: string } },
  status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: mocks.session,
    status: mocks.status,
  }),
  signIn: (...args: unknown[]) => mocks.signIn(...args),
  signOut: vi.fn(),
}));

vi.mock("@/components/auth/auth-tracking", () => ({
  trackAuthEvent: vi.fn(),
}));

describe("AuthHeader", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.searchParams = new URLSearchParams();
    mocks.signIn.mockClear();
    mocks.session = null;
    mocks.status = "unauthenticated";
  });

  it("renders shared app-shell navigation with Style Memory copy", () => {
    mocks.pathname = "/workspace/templates";

    render(<AuthHeader />);

    const nav = screen.getByTestId("app-shell-primary-nav");
    const styleMemory = screen.getByRole("link", { name: /Style Memory/i });

    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Workspace/i })).toHaveAttribute(
      "href",
      "/workspace",
    );
    expect(styleMemory).toHaveAttribute("href", "/workspace/templates");
    expect(styleMemory).toHaveAttribute("aria-current", "page");
    expect(nav).not.toHaveTextContent(/Template Library/i);
    expect(screen.getByRole("button", { name: /theme:/i })).toBeInTheDocument();
  });

  it("exposes the shell auth entry and keeps login feedback on the shared button", async () => {
    const user = userEvent.setup();

    render(<AuthHeader />);

    const authEntry = screen.getByTestId("app-shell-auth-entry");
    const loginButton = screen.getByRole("button", { name: /log in/i });

    expect(authEntry).toContainElement(loginButton);
    expect(loginButton).toHaveClass("btn-secondary");

    await user.click(loginButton);
    expect(mocks.signIn).toHaveBeenCalledWith("google");
  });

  it("marks Workspace active on the workspace route", () => {
    mocks.pathname = "/workspace";

    render(<AuthHeader />);

    expect(screen.getByRole("link", { name: /^Workspace$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps navigation stable while login status loads", () => {
    mocks.status = "loading";

    render(<AuthHeader />);

    expect(screen.getByTestId("app-shell-primary-nav")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /checking login status/i })).toBeInTheDocument();
  });
});
