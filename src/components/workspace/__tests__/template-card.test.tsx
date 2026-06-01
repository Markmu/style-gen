// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TemplateCard } from "@/components/workspace/template-card";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

describe("TemplateCard", () => {
  it("renders the associated reference image when available", () => {
    render(
      <TemplateCard
        template={{
          id: "template-1",
          name: "Glass Fox",
          variableCount: 2,
          sourceAssetId: "asset-1",
          sourceImageUrl: "https://cdn.example.com/reference.png",
          createdAt: "2026-06-01T00:00:00.000Z",
        }}
        onUse={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", {
      name: "Reference image for Glass Fox",
    });
    expect(image).toHaveAttribute(
      "data-src",
      "https://cdn.example.com/reference.png",
    );
    expect(screen.queryByText("No preview")).not.toBeInTheDocument();
  });

  it("falls back to the no preview state without a source image", () => {
    render(
      <TemplateCard
        template={{
          id: "template-1",
          name: "Text Only",
          variableCount: 0,
          sourceAssetId: null,
          sourceImageUrl: null,
          createdAt: "2026-06-01T00:00:00.000Z",
        }}
        onUse={vi.fn()}
      />,
    );

    expect(screen.getByText("No preview")).toBeInTheDocument();
  });
});
