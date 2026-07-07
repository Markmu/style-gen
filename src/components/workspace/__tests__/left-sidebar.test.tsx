// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeftSidebar } from "@/components/workspace/left-sidebar";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/workspace",
}));

let storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
};

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
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
    storage = {};
    navigationMocks.pathname = "/workspace";
    navigationMocks.push.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
  });

  it("collapses and expands the navigation labels", async () => {
    const user = userEvent.setup();

    render(<LeftSidebar />);

    const sidebar = screen.getByLabelText("Workspace navigation");
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("Style Memory")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("Generate")).not.toBeInTheDocument();
    expect(screen.queryByText("Style Memory")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Style Memory" })).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem("style-gen:workspace-sidebar-collapsed")).toBe("true"),
    );

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Generate")).toBeInTheDocument();
  });

  it("marks Style Memory active on the template route without changing the route", async () => {
    const user = userEvent.setup();
    navigationMocks.pathname = "/workspace/templates";

    render(<LeftSidebar />);

    const styleMemory = screen.getByRole("button", { name: "Style Memory" });
    expect(styleMemory).toHaveAttribute("aria-current", "page");
    expect(styleMemory).toHaveAttribute("data-active", "true");

    await user.click(styleMemory);
    expect(navigationMocks.push).toHaveBeenCalledWith("/workspace/templates");
  });
});
