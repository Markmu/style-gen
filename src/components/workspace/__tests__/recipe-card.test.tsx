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
