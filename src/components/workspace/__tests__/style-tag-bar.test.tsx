// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StyleTagBar } from "@/components/workspace/style-tag-bar";
import type { VisualRecipe } from "@/types/models";

const baseRecipe: VisualRecipe = {
  imageSummary: "A serene landscape",
  subject: "Mountain range",
  scene: "Alpine meadow",
  composition: "Rule of thirds",
  cameraLanguage: "Wide angle",
  lighting: "Golden hour",
  color: "Warm palette",
  texture: "Soft",
  styleTags: [],
  mood: "Peaceful",
  visualKeywords: ["mountain", "meadow"],
  mustKeep: ["golden light"],
  replaceable: ["specific flowers"],
};

describe("StyleTagBar", () => {
  // --- extractStyleTags logic ---

  it("优先使用 styleTags 前 5 个", () => {
    const recipe: VisualRecipe = {
      ...baseRecipe,
      styleTags: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
    };

    render(<StyleTagBar recipe={recipe} />);

    expect(screen.getByText("tag1")).toBeInTheDocument();
    expect(screen.getByText("tag2")).toBeInTheDocument();
    expect(screen.getByText("tag3")).toBeInTheDocument();
    expect(screen.getByText("tag4")).toBeInTheDocument();
    expect(screen.getByText("tag5")).toBeInTheDocument();
    expect(screen.queryByText("tag6")).not.toBeInTheDocument();
  });

  it("styleTags 不足 3 个时从核心字段补充", () => {
    const recipe: VisualRecipe = {
      ...baseRecipe,
      styleTags: ["tag1"],
      subject: "Mountain",
      mood: "Serene",
      color: "Blue",
    };

    render(<StyleTagBar recipe={recipe} />);

    expect(screen.getByText("tag1")).toBeInTheDocument();
    expect(screen.getByText("Mountain")).toBeInTheDocument();
    expect(screen.getByText("Serene")).toBeInTheDocument();
  });

  it("styleTags 为空时从核心字段补充", () => {
    const recipe: VisualRecipe = {
      ...baseRecipe,
      styleTags: [],
      subject: "Mountain",
      mood: "Serene",
      color: "Blue",
    };

    render(<StyleTagBar recipe={recipe} />);

    expect(screen.getByText("Mountain")).toBeInTheDocument();
    expect(screen.getByText("Serene")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("避免重复标签", () => {
    const recipe: VisualRecipe = {
      ...baseRecipe,
      styleTags: ["Mountain"],
      subject: "Mountain",
      mood: "Serene",
      color: "Blue",
    };

    render(<StyleTagBar recipe={recipe} />);

    const mountainTags = screen.getAllByText("Mountain");
    expect(mountainTags).toHaveLength(1);
  });

  // --- Pill style rendering ---

  it("标签以 pill 样式渲染（rounded-full class）", () => {
    const recipe: VisualRecipe = {
      ...baseRecipe,
      styleTags: ["landscape", "nature", "warm"],
    };

    const { container } = render(<StyleTagBar recipe={recipe} />);

    const pills = container.querySelectorAll(".rounded-full");
    expect(pills.length).toBeGreaterThanOrEqual(3);
  });

  // --- Empty tags => null ---

  it("无标签时不渲染", () => {
    const recipe: VisualRecipe = {
      ...baseRecipe,
      styleTags: [],
      subject: "",
      mood: "",
      color: "",
    };

    const { container } = render(<StyleTagBar recipe={recipe} />);
    expect(container.innerHTML).toBe("");
  });
});
