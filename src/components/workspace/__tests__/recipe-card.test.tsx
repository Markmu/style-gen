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
  // 1. 渲染所有配方区域 - P0
  it("渲染所有配方区域", () => {
    render(<RecipeCard recipe={mockRecipe} />);

    expect(screen.getByText("主体与场景")).toBeInTheDocument();
    expect(screen.getByText("构图与镜头")).toBeInTheDocument();
    expect(screen.getByText("光照与色彩")).toBeInTheDocument();
    expect(screen.getByText("质感与风格")).toBeInTheDocument();
    expect(screen.getByText("关键词")).toBeInTheDocument();
    expect(screen.getByText("保留 / 可替换")).toBeInTheDocument();
  });

  // 2. 渲染字段值 - P0
  it("渲染字段值 - subject, scene 等值可见", () => {
    render(<RecipeCard recipe={mockRecipe} />);

    expect(screen.getByText("Mountain range")).toBeInTheDocument();
    expect(screen.getByText("Alpine meadow")).toBeInTheDocument();
    expect(screen.getByText("A serene landscape")).toBeInTheDocument();
    expect(screen.getByText("Rule of thirds")).toBeInTheDocument();
    expect(screen.getByText("Wide angle")).toBeInTheDocument();
    expect(screen.getByText("Golden hour")).toBeInTheDocument();
    expect(screen.getByText("Warm palette")).toBeInTheDocument();
    expect(screen.getByText("Soft")).toBeInTheDocument();
    expect(screen.getByText("Peaceful")).toBeInTheDocument();
  });

  // 3. 渲染标签列表 - P1
  it("渲染标签列表 - styleTags rendered", () => {
    render(<RecipeCard recipe={mockRecipe} />);

    expect(screen.getByText("landscape")).toBeInTheDocument();
    expect(screen.getByText("nature")).toBeInTheDocument();
    expect(screen.getByText("mountain")).toBeInTheDocument();
    expect(screen.getByText("meadow")).toBeInTheDocument();
    expect(screen.getByText("golden light")).toBeInTheDocument();
    expect(screen.getByText("specific flowers")).toBeInTheDocument();
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

    // Sections still render
    expect(screen.getByText("主体与场景")).toBeInTheDocument();
    expect(screen.getByText("质感与风格")).toBeInTheDocument();
  });
});
