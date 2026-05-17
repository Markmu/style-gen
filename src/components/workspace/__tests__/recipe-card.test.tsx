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
  // 1. 渲染Core Summary区域 - P0
  it("渲染Core Summary区域", () => {
    render(<RecipeCard recipe={mockRecipe} />);

    expect(screen.getByText("Core Summary")).toBeInTheDocument();
    expect(screen.getByText("Visual Recipe")).toBeInTheDocument();
  });

  // 2. 渲染字段值 - P0
  it("渲染字段值 - subject, imageSummary 等值可见", () => {
    render(<RecipeCard recipe={mockRecipe} />);

    expect(screen.getByText("Mountain range")).toBeInTheDocument();
    expect(screen.getByText("A serene landscape")).toBeInTheDocument();
  });

  // 3. 渲染标签列表 - P1
  it("渲染标签列表 - styleTags rendered", () => {
    render(<RecipeCard recipe={mockRecipe} />);

    expect(screen.getByText("landscape")).toBeInTheDocument();
    expect(screen.getByText("nature")).toBeInTheDocument();
  });

  // 4. 空标签列表不渲染 - P2
  it("空标签列表不崩溃", () => {
    const recipeWithEmptyTags: VisualRecipe = {
      ...mockRecipe,
      styleTags: [],
      visualKeywords: [],
      mustKeep: [],
      replaceable: [],
    };

    expect(() => {
      render(<RecipeCard recipe={recipeWithEmptyTags} />);
    }).not.toThrow();

    // Core sections still render
    expect(screen.getByText("Core Summary")).toBeInTheDocument();
    expect(screen.getByText("Visual Recipe")).toBeInTheDocument();
  });
});
