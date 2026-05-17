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
  it("渲染Home所有子组件", () => {
    render(<Home />);
    expect(screen.getByText("Reference Image Style Recreation")).toBeInTheDocument();
    expect(
      screen.getAllByText("Click or drag to upload a reference image").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Recreate a Style in Three Steps")).toBeInTheDocument();
  });
});
