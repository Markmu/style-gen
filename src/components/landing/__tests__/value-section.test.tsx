// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ValueSection } from "../value-section";

describe("ValueSection", () => {
  it("渲染三个功能卡片", () => {
    render(<ValueSection />);
    expect(screen.getByText("视觉分析")).toBeInTheDocument();
    expect(screen.getByText("结构化配方")).toBeInTheDocument();
    expect(screen.getByText("一键生成")).toBeInTheDocument();
  });

  it("每个卡片包含 Material Symbol 图标", () => {
    render(<ValueSection />);
    expect(screen.getByText("visibility")).toBeInTheDocument();
    expect(screen.getByText("deployed_code")).toBeInTheDocument();
    expect(screen.getByText("sync")).toBeInTheDocument();
  });
});
