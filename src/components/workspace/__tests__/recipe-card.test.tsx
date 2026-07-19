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

    expect(screen.getByRole("button", { name: /Content/i })).toHaveTextContent(
      "Mountain range",
    );
    expect(screen.queryByText("A serene landscape")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Content/i }));
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
    ).toEqual(["color", "composition", "lighting", "texture", "mood"]);
    expect(screen.getByTestId("evidence-facet-lighting")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("evidence-facet-lighting")).toHaveTextContent("AI");
    expect(screen.getByTestId("evidence-facet-lighting").parentElement).toHaveClass(
      "ring-inset",
    );
    expect(screen.getByTestId("content-analysis")).toHaveClass("ring-inset");

    fireEvent.click(screen.getByTestId("evidence-facet-color"));
    expect(onFacetSelect).toHaveBeenCalledWith("color");
  });

  it("shows style keywords first and reveals the complete analysis on demand", () => {
    const onFacetSelect = vi.fn();
    const longColorSummary =
      "A restrained mineral palette moves from cool slate blue into soft silver highlights, with warm reflected accents reserved for the focal subject and subtle atmospheric contrast throughout.";
    const facets = deriveEvidenceFacets(mockRecipe).map((facet) =>
      facet.id === "color"
        ? {
            ...facet,
            summary: longColorSummary,
            evidence: ["Warm reflected accents frame the focal subject"],
          }
        : facet,
    );

    render(
      <RecipeCard
        state="analysis_ready"
        recipe={mockRecipe}
        facets={facets}
        onFacetSelect={onFacetSelect}
      />,
    );

    expect(screen.queryByTestId("evidence-summary-color")).not.toBeInTheDocument();
    expect(screen.getByTestId("evidence-facet-color")).toHaveTextContent(
      /restrained mineral palette/i,
    );

    fireEvent.click(screen.getByTestId("evidence-facet-color"));
    expect(screen.getByTestId("evidence-summary-color")).toHaveTextContent(
      longColorSummary,
    );
    expect(
      screen.getByText("Warm reflected accents frame the focal subject"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Observed:/i)).not.toBeInTheDocument();
    expect(onFacetSelect).toHaveBeenCalledWith("color");
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
    expect(
      screen.queryByTestId("style-intelligence-image-summary"),
    ).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Content/i }));
    expect(screen.getByTestId("style-intelligence-image-summary")).toHaveTextContent(
      "A serene landscape",
    );
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

  it("renders V2 fallback diagnostics without labeling them legacy", () => {
    render(
      <RecipeCard
        state="analysis_ready"
        recipe={{
          schemaVersion: 2,
          extractionStatus: "fallback",
          extractionReasons: ["No usable content variable was detected."],
          promptOutputs: null,
        }}
      />,
    );

    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(screen.getByText("Structured extraction fallback")).toBeInTheDocument();
    expect(
      screen.queryByText("No usable content variable was detected."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Content/i }));
    expect(screen.getByText("No usable content variable was detected.")).toBeInTheDocument();
    expect(screen.queryByText("Legacy analysis")).not.toBeInTheDocument();
  });
});
