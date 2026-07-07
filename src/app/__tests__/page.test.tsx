// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "test-user" } }, status: "authenticated" }),
  signIn: vi.fn(),
}));

vi.mock("@/components/landing/use-file-store", () => ({
  useFileStore: () => ({
    file: null,
    setFile: vi.fn(),
    consumeFile: vi.fn(),
  }),
}));

import Home from "../page";

describe("Home Page", () => {
  it("renders the AI-first landing first viewport and shared navigation", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /Reference -> Evidence -> Render/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-primary-nav")).toBeInTheDocument();
    expect(
      screen.getAllByText("Upload a reference image").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("link", { name: /Style Memory/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Reference Image Style Recreation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Template Library$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Visual Recipe/i)).not.toBeInTheDocument();
  });
});
