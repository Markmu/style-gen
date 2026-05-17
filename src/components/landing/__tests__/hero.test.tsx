// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Hero } from "../hero";

describe("Hero", () => {
  it("渲染标题", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Reference Image Style Recreation");
  });

  it("渲染副标题", () => {
    render(<Hero />);
    expect(
      screen.getByText(/Upload a reference image to get an editable visual recipe/),
    ).toBeInTheDocument();
  });

  it("渲染产品闭环预览和模板入口", () => {
    render(<Hero />);
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getByText("Recipe")).toBeInTheDocument();
    expect(screen.getByText("Render")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Template Library" })).toHaveAttribute(
      "href",
      "/workspace/templates",
    );
  });
});
