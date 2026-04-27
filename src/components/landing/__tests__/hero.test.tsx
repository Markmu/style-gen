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
      screen.getByText(/上传一张参考图，获得可编辑的视觉配方/),
    ).toBeInTheDocument();
  });

  it("渲染产品闭环预览和模板入口", () => {
    render(<Hero />);
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getByText("Recipe")).toBeInTheDocument();
    expect(screen.getByText("Render")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "模板库" })).toHaveAttribute(
      "href",
      "/workspace/templates",
    );
  });
});
