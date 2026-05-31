// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { RecipeCard } from "@/components/workspace/recipe-card";
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

    expect(screen.getByText("Visual Recipe")).toBeInTheDocument();
    expect(
      screen.getByText("Upload a reference image to generate a visual recipe."),
    ).toBeInTheDocument();
  });

  it("renders the analyzing skeleton", () => {
    render(<RecipeCard state="analyzing" recipe={null} />);

    expect(screen.getByLabelText("Visual Recipe loading")).toBeInTheDocument();
  });

  it("renders the basic recipe shell after analysis", () => {
    render(<RecipeCard state="analysis_ready" recipe={mockRecipe} />);

    expect(screen.getByText("Mountain range")).toBeInTheDocument();
    expect(screen.getByText("A serene landscape")).toBeInTheDocument();
    expect(screen.getByText("landscape")).toBeInTheDocument();
    expect(screen.getByText("nature")).toBeInTheDocument();
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

    expect(screen.getByText("Visual Recipe")).toBeInTheDocument();
  });
});
