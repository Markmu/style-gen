// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Hero } from "../hero";

describe("Hero", () => {
  it("renders the Reference -> Evidence -> Render title", () => {
    render(<Hero />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Reference -> Evidence -> Render");
  });

  it("explains AI evidence, prompt editing, and render readiness", () => {
    render(<Hero />);
    expect(
      screen.getByText(/upload a reference\. inspect the evidence/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/prompt/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/render/i).length).toBeGreaterThan(0);
  });

  it("renders the product loop preview and Style Memory entry", () => {
    render(<Hero />);
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Render")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByText("Composition")).toBeInTheDocument();
    expect(screen.getByText("Lighting")).toBeInTheDocument();
    expect(screen.getByText("Texture")).toBeInTheDocument();
    expect(screen.getByText("Mood")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse Style Memory/i })).toHaveAttribute(
      "href",
      "/workspace/templates",
    );
    expect(screen.queryByText(/Template Library/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Visual Recipe/i)).not.toBeInTheDocument();
  });
});
