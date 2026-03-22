// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ValueSection } from "../value-section";

describe("ValueSection", () => {
  it("渲染三步流程标题", () => {
    render(<ValueSection />);
    expect(screen.getByText("上传参考图")).toBeInTheDocument();
    expect(screen.getByText("AI 提取视觉配方")).toBeInTheDocument();
    expect(screen.getByText("一键生成同风格新图")).toBeInTheDocument();
  });

  it("步骤编号正确 (Step 1, Step 2, Step 3)", () => {
    render(<ValueSection />);
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(screen.getByText("Step 3")).toBeInTheDocument();
  });
});
