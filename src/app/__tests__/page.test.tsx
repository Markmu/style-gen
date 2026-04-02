// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
  it("渲染首页所有子组件", () => {
    render(<Home />);
    expect(screen.getByText("参考图风格再创作")).toBeInTheDocument();
    expect(
      screen.getAllByText("点击或拖拽上传参考图").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("视觉分析")).toBeInTheDocument();
  });
});
