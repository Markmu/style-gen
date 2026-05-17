// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { RecipeEditor } from "@/components/workspace/recipe-editor";
import type { VisualRecipe } from "@/types/models";

const longSubjectText =
  "A porcelain teapot surrounded by reflective chrome utensils on a narrow marble counter";
const longSceneText =
  "inside a sunlit kitchen with translucent curtains and tiny specular highlights";
const fullSubjectRow = `${longSubjectText} / ${longSceneText}`;

const recipe: VisualRecipe = {
  imageSummary: "A quiet kitchen still life",
  subject: longSubjectText,
  scene: longSceneText,
  composition: "Centered tabletop composition",
  cameraLanguage: "Medium close-up with shallow depth of field",
  lighting: "Soft morning light",
  color: "Cool whites and polished silver",
  texture: "Glossy ceramic and brushed metal",
  styleTags: ["editorial", "still life"],
  mood: "Calm and exacting",
  visualKeywords: ["teapot", "chrome", "marble"],
  mustKeep: ["reflective utensils"],
  replaceable: ["teapot"],
};

describe("RecipeEditor", () => {
  it("shows the full recipe content by default without expand/collapse controls", () => {
    render(<RecipeEditor recipe={recipe} />);

    expect(screen.getByText(fullSubjectRow)).toBeInTheDocument();
    expect(screen.getByText("A quiet kitchen still life")).toBeInTheDocument();
    expect(screen.getAllByText("teapot").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "查看完整配方" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collapse Full Recipe" }),
    ).not.toBeInTheDocument();
  });
});
