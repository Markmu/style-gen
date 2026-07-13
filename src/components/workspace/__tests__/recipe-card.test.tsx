// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecipeCard } from "@/components/workspace/recipe-card";
import { deriveEvidenceFacets } from "@/lib/evidence-facets";
import type { VisualRecipe } from "@/types/models";

const mockRecipe: VisualRecipe = {
  imageSummary: "A serene landscape",
  subject: "Mountain range",
  scene: "Alpine meadow",
  composition: "Rule of thirds",
  cameraLanguage: "Wide angle",
  lighting: "Golden hour",
  color: "Warm palette",
  texture: "Soft",
  styleTags: ["landscape", "nature"],
  mood: "Peaceful",
  visualKeywords: ["mountain", "meadow"],
  mustKeep: ["golden light"],
  replaceable: ["specific flowers"],
};

describe("RecipeCard", () => {
  it("renders the empty guide state", () => {
    render(<RecipeCard state="idle" recipe={null} />);

    expect(screen.getByText("Style Intelligence")).toBeInTheDocument();
    const expandButton = screen.getByRole("button", {
      name: "Expand Style Intelligence",
    });
    expect(expandButton.querySelector("svg")).toHaveClass("lucide-maximize");
    expect(screen.queryByLabelText("Visual Recipe help")).not.toBeInTheDocument();
    expect(
      screen.getByText(/After upload, AI will separate color/),
    ).toBeInTheDocument();
  });

  it("renders the analyzing skeleton", () => {
    render(<RecipeCard state="analyzing" recipe={null} />);

    expect(screen.getByLabelText("Visual Recipe loading")).toBeInTheDocument();
  });

  it("renders the basic recipe shell after analysis", () => {
    render(<RecipeCard state="analysis_ready" recipe={mockRecipe} />);

    expect(screen.getAllByText("Mountain range").length).toBeGreaterThan(0);
    expect(screen.getByText("A serene landscape")).toBeInTheDocument();
    expect(screen.getByText("landscape")).toBeInTheDocument();
    expect(screen.getByText("nature")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("renders ordered evidence facets with selected highlight and confidence", () => {
    const onFacetSelect = vi.fn();
    const facets = deriveEvidenceFacets(mockRecipe);

    render(
      <RecipeCard
        state="analysis_ready"
        recipe={mockRecipe}
        facets={facets}
        selectedFacetId="lighting"
        onFacetSelect={onFacetSelect}
        provenanceSpans={[
          {
            facetId: "lighting",
            label: "Lighting",
            summary: "Golden hour",
            matchedText: "Golden hour",
            startIndex: 0,
            endIndex: 11,
            matchType: "exact",
          },
        ]}
      />,
    );

    expect(
      screen.getAllByTestId(/^evidence-facet-/).map((node) =>
        node.getAttribute("data-testid")?.replace("evidence-facet-", ""),
      ),
    ).toEqual(["color", "composition", "lighting", "texture", "mood", "subject"]);
    expect(screen.getByTestId("evidence-facet-lighting")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("evidence-facet-lighting")).toHaveTextContent(
      /confidence/i,
    );

    fireEvent.click(screen.getByTestId("evidence-facet-color"));
    expect(onFacetSelect).toHaveBeenCalledWith("color");
  });

  it("collapses long facet analysis independently from facet selection", () => {
    const onFacetSelect = vi.fn();
    const longColorSummary =
      "A restrained mineral palette moves from cool slate blue into soft silver highlights, with warm reflected accents reserved for the focal subject and subtle atmospheric contrast throughout.";
    const facets = deriveEvidenceFacets(mockRecipe).map((facet) =>
      facet.id === "color" ? { ...facet, summary: longColorSummary } : facet,
    );

    render(
      <RecipeCard
        state="analysis_ready"
        recipe={mockRecipe}
        facets={facets}
        onFacetSelect={onFacetSelect}
      />,
    );

    const summary = screen.getByTestId("evidence-summary-color");
    const showMore = screen.getByRole("button", {
      name: "Show more Color analysis",
    });

    expect(summary).toHaveClass("line-clamp-2");
    expect(showMore).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showMore);

    expect(summary).not.toHaveClass("line-clamp-2");
    expect(
      screen.getByRole("button", { name: "Show less Color analysis" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(onFacetSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("evidence-facet-color"));
    expect(onFacetSelect).toHaveBeenCalledWith("color");

    fireEvent.click(
      screen.getByRole("button", { name: "Show less Color analysis" }),
    );
    expect(summary).toHaveClass("line-clamp-2");
  });

  it("opens a near-fullscreen dialog with the complete summary and keeps facet actions", () => {
    const onFacetSelect = vi.fn();
    render(
      <RecipeCard
        state="analysis_ready"
        recipe={mockRecipe}
        onFacetSelect={onFacetSelect}
      />,
    );

    const expandButton = screen.getByRole("button", {
      name: "Expand Style Intelligence",
    });
    const summary = screen.getByTestId("style-intelligence-image-summary");
    expect(summary).toHaveClass("max-h-10", "overflow-hidden");
    expect(
      screen.queryByRole("button", { name: "Style intelligence options" }),
    ).not.toBeInTheDocument();

    expandButton.focus();
    fireEvent.click(expandButton);

    expect(
      screen.getByRole("dialog", { name: "Style Intelligence" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Close expanded Style Intelligence" })
        .querySelector("svg"),
    ).toHaveClass("lucide-minimize");
    expect(summary).not.toHaveClass("max-h-10", "overflow-hidden");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByTestId("evidence-facet-color"));
    expect(onFacetSelect).toHaveBeenCalledWith("color");

    fireEvent.keyDown(
      screen.getByRole("dialog", { name: "Style Intelligence" }),
      { key: "Escape" },
    );

    expect(
      screen.queryByRole("dialog", { name: "Style Intelligence" }),
    ).not.toBeInTheDocument();
    expect(summary).toHaveClass("max-h-10", "overflow-hidden");
    expect(expandButton).toHaveFocus();
  });

  it("does not crash when recipe tags are empty", () => {
    const recipeWithEmptyTags: VisualRecipe = {
      ...mockRecipe,
      styleTags: [],
      visualKeywords: [],
      mustKeep: [],
      replaceable: [],
    };

    expect(() => {
      render(<RecipeCard state="analysis_ready" recipe={recipeWithEmptyTags} />);
    }).not.toThrow();

    expect(screen.getByText("Style Intelligence")).toBeInTheDocument();
  });
});
