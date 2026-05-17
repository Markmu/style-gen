// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ValueSection } from "../value-section";

describe("ValueSection", () => {
  it("渲染三个功能卡片", () => {
    render(<ValueSection />);
    expect(screen.getByText("Recreate a Style in Three Steps")).toBeInTheDocument();
    expect(screen.getByText("Upload Reference")).toBeInTheDocument();
    expect(screen.getByText("AI Extracts the Visual Recipe")).toBeInTheDocument();
    expect(screen.getByText("Generate a New Image in the Same Style")).toBeInTheDocument();
  });

  it("每个卡片包含步骤编号", () => {
    render(<ValueSection />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });
});
