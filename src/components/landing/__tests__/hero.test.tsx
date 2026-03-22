// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Hero } from "../hero";

describe("Hero", () => {
  it("渲染标题", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("参考图风格再创作");
  });

  it("渲染副标题", () => {
    render(<Hero />);
    expect(
      screen.getByText("上传参考图，AI 提取视觉配方，一键生成同风格新图"),
    ).toBeInTheDocument();
  });
});
