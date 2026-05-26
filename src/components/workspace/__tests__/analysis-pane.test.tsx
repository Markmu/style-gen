// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type React from "react";
import { render, screen } from "@testing-library/react";
import { AnalysisPane } from "@/components/workspace/analysis-pane";
import type { VisualRecipe } from "@/types/models";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

const recipe: VisualRecipe = {
  imageSummary: "A quiet editorial portrait",
  subject: "Portrait subject",
  scene: "Studio backdrop",
  composition: "Centered composition",
  cameraLanguage: "Medium close-up",
  lighting: "Softbox lighting",
  color: "Cool neutral palette",
  texture: "Smooth skin and fabric",
  styleTags: ["editorial", "studio"],
  mood: "Calm",
  visualKeywords: ["portrait", "studio"],
  mustKeep: ["soft light"],
  replaceable: ["background"],
};

const defaultProps = {
  state: "idle" as const,
  referenceImageUrl: null,
  recipe: null,
  isUploading: false,
  uploadProgress: 0,
  degradation: {
    analysisQueueing: false,
    generationQueueing: false,
    generationUnavailable: false,
    analysisUnavailable: false,
  },
  promptText: "",
  error: null,
  onFileSelected: vi.fn(),
  onReplace: vi.fn(),
  onRetry: vi.fn(),
};

describe("AnalysisPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders image and analyze areas inside a single surface panel in the empty state", () => {
    render(<AnalysisPane {...defaultProps} />);

    expect(screen.getByTestId("analysis-pane")).toHaveClass("surface-panel");
    expect(screen.getByTestId("reference-preview")).not.toHaveClass("surface-panel");
    expect(screen.getByTestId("style-breakdown-panel")).not.toHaveClass("surface-panel");
    expect(screen.getByText("Click or drag to upload a reference image")).toBeInTheDocument();
    expect(
      screen.getByText(
        "After you upload a reference, visual structure, lighting, color, and mood will unfold here.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the reference preview and recipe in the same card after analysis", () => {
    render(
      <AnalysisPane
        {...defaultProps}
        state="analysis_ready"
        referenceImageUrl="https://cdn.example.com/reference.png"
        recipe={recipe}
        promptText="Generated prompt"
      />,
    );

    expect(screen.getByAltText("Reference")).toHaveAttribute(
      "src",
      "https://cdn.example.com/reference.png",
    );
    expect(screen.getByText("Portrait subject / Studio backdrop")).toBeInTheDocument();
    expect(screen.getByText("Image Summary")).toBeInTheDocument();
  });
});
