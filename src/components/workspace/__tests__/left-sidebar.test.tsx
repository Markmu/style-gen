// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signOut } from "next-auth/react";
import { LeftSidebar } from "@/components/workspace/left-sidebar";
import { trackAuthEvent } from "@/components/auth/auth-tracking";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/workspace",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "Ada Lovelace",
        email: "ada@example.com",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

vi.mock("@/components/auth/auth-tracking", () => ({
  trackAuthEvent: vi.fn(),
}));

describe("LeftSidebar", () => {
  beforeEach(() => {
    navigationMocks.pathname = "/workspace";
    vi.clearAllMocks();
  });

  it("renders the fixed workbench navigation without preview workspace data", () => {
    render(<LeftSidebar />);

    const sidebar = screen.getByLabelText("Workspace navigation");
    expect(sidebar).toHaveClass("w-[14.125rem]");
    expect(screen.queryByRole("button", { name: /collapse sidebar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sidebar options" })).not.toBeInTheDocument();

    const generate = screen.getByRole("link", { name: "Generate" });
    expect(generate).toHaveAttribute("href", "/workspace");
    expect(generate).toHaveAttribute("aria-current", "page");

    const library = screen.getByRole("link", { name: "Style Memory Library" });
    expect(library).toHaveTextContent("Library");
    expect(library).toHaveAttribute("href", "/workspace/templates");

    expect(screen.queryByText("Recent Workspaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Editorial Soft Light")).not.toBeInTheDocument();
    expect(screen.queryByText("Warm Minimal")).not.toBeInTheDocument();
    expect(screen.queryByText("Film Street Mood")).not.toBeInTheDocument();
    expect(screen.queryByText("Product Clean")).not.toBeInTheDocument();

    expect(screen.getByText("Pro Plan")).toBeInTheDocument();
    expect(screen.getByText("3,240 / 10,000 credits")).toBeInTheDocument();
  });

  it("marks Library active on the template route", () => {
    navigationMocks.pathname = "/workspace/templates";

    render(<LeftSidebar />);

    expect(screen.getByRole("link", { name: "Style Memory Library" })).toHaveAttribute(
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
});
