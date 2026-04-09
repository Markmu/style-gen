// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ValueSection } from "../value-section";

describe("ValueSection", () => {
  it("渲染三个功能卡片", () => {
    render(<ValueSection />);
    expect(screen.getByText("三步完成风格再创作")).toBeInTheDocument();
    expect(screen.getByText("上传参考图")).toBeInTheDocument();
    expect(screen.getByText("AI 提取视觉配方")).toBeInTheDocument();
    expect(screen.getByText("生成同风格新图")).toBeInTheDocument();
  });

  it("每个卡片包含步骤编号", () => {
    render(<ValueSection />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });
});
