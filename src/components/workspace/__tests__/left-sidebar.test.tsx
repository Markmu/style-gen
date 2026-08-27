// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signOut } from "next-auth/react";
import { LeftSidebar } from "@/components/workspace/left-sidebar";
import { trackAuthEvent } from "@/components/auth/auth-tracking";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/workspace",
}));

const authMocks = vi.hoisted(() => ({
  session: {
    data: {
      user: {
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    } as { user: { name: string; email: string } } | null,
    status: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  },
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => authMocks.session,
  signOut: vi.fn(),
  signIn: authMocks.signIn,
}));

vi.mock("@/components/auth/auth-tracking", () => ({
  trackAuthEvent: vi.fn(),
}));

describe("LeftSidebar", () => {
  beforeEach(() => {
    navigationMocks.pathname = "/workspace";
    authMocks.session = {
      data: {
        user: {
          name: "Ada Lovelace",
          email: "ada@example.com",
        },
      },
      status: "authenticated",
    };
    vi.clearAllMocks();
  });

  it("renders the fixed workbench navigation without preview workspace data", () => {
    render(<LeftSidebar />);

    const sidebar = screen.getByLabelText("Workspace navigation");
    expect(sidebar).toHaveClass("w-[4.5rem]");
    expect(sidebar).toHaveClass("md:w-[14.125rem]");
    expect(screen.queryByRole("button", { name: /collapse sidebar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sidebar options" })).not.toBeInTheDocument();

    const generate = screen.getByRole("link", { name: "Generate" });
    expect(generate).toHaveAttribute("href", "/workspace");
    expect(generate).toHaveAttribute("aria-current", "page");

    // plan-04 / ADR-8：导航术语统一为 "Style Memory"（label 与 aria-label 一致）
    const styleMemory = screen.getByRole("link", { name: "Style Memory" });
    expect(styleMemory).toHaveTextContent("Style Memory");
    expect(styleMemory).toHaveAttribute("href", "/workspace/templates");
    expect(screen.queryByText("Library")).not.toBeInTheDocument();

    expect(screen.queryByText("Recent Workspaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Editorial Soft Light")).not.toBeInTheDocument();
    expect(screen.queryByText("Warm Minimal")).not.toBeInTheDocument();
    expect(screen.queryByText("Film Street Mood")).not.toBeInTheDocument();
    expect(screen.queryByText("Product Clean")).not.toBeInTheDocument();

    expect(screen.queryByText("Pro Plan")).not.toBeInTheDocument();
    expect(screen.queryByText(/credits/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /theme:/i })).toBeInTheDocument();
  });

  it("marks Style Memory active on the template route", () => {
    navigationMocks.pathname = "/workspace/templates";

    render(<LeftSidebar />);

    expect(screen.getByRole("link", { name: "Style Memory" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Generate" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens the user menu and signs out", async () => {
    const user = userEvent.setup();

    render(<LeftSidebar />);

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(trackAuthEvent).toHaveBeenCalledWith("logout");
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("renders a real login action instead of a signed-in placeholder", async () => {
    const user = userEvent.setup();
    authMocks.session = {
      data: null,
      status: "unauthenticated",
    };

    render(<LeftSidebar />);

    expect(screen.queryByText("Signed in")).not.toBeInTheDocument();
    const loginButton = screen.getByRole("button", { name: "Log in" });
    await user.click(loginButton);
    expect(authMocks.signIn).toHaveBeenCalledWith("google");
  });
});
