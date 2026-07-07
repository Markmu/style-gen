// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ValueSection } from "../value-section";

describe("ValueSection", () => {
  it("renders the three AI-first capability cards", () => {
    render(<ValueSection />);
    expect(
      screen.getByText("The workbench keeps AI decisions inspectable"),
    ).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Readiness")).toBeInTheDocument();
    expect(screen.getByText("Style Memory")).toBeInTheDocument();
    expect(screen.getByText(/color, composition, lighting, texture, and mood/i)).toBeInTheDocument();
  });

  it("removes the old marketing step copy", () => {
    render(<ValueSection />);
    expect(screen.queryByText("Recreate a Style in Three Steps")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Extracts the Visual Recipe")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Generate a New Image in the Same Style"),
    ).not.toBeInTheDocument();
  });
});
