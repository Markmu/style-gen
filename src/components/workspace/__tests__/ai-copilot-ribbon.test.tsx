// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { AiCopilotRibbon } from "@/components/workspace/ai-copilot-ribbon";
import type { DegradationState } from "@/hooks/use-workspace-state";
import type { VisualRecipe } from "@/types/models";

const neutralDegradation: DegradationState = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

const recipe: VisualRecipe = {
  imageSummary: "A calm editorial still life with warm soft light.",
  subject: "matte ceramic vase and amber glass bottle",
  scene: "linen-covered table by a natural window",
  composition: "balanced rule of thirds composition",
  cameraLanguage: "editorial still life photography",
  lighting: "natural window light with soft shadows",
  color: "warm neutral palette with beige and amber tones",
  texture: "matte ceramic, linen, and smooth glass",
  styleTags: ["editorial still life", "warm neutral", "minimal"],
  mood: "calm minimal timeless",
  visualKeywords: ["soft light", "linen", "warm neutral"],
  mustKeep: ["matte ceramic", "amber glass"],
  replaceable: ["dried branches"],
};

describe("AiCopilotRibbon", () => {
  it("renders the redesigned metric groups for a ready workspace", () => {
    render(
      <AiCopilotRibbon
        state="analysis_ready"
        recipe={recipe}
        hasReference
        hasPrompt
        canGenerate
        disabledReason=""
        degradation={neutralDegradation}
      />,
    );

    const ribbon = screen.getByTestId("ai-copilot-ribbon");
    expect(ribbon).toHaveAttribute("data-phase", "analysis_ready");
    expect(ribbon).toHaveAttribute("data-service", "ready");
    expect(screen.getByText("AI Copilot")).toBeInTheDocument();
    expect(screen.getByText("Phase")).toBeInTheDocument();
    expect(screen.getByText("Editing")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Signals detected")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Refine intent or render")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copilot insights/i }),
    ).not.toBeInTheDocument();
  });

  it("surfaces service-limited state without changing the shell contract", () => {
    render(
      <AiCopilotRibbon
        state="analysis_ready"
        recipe={recipe}
        hasReference
        hasPrompt
        canGenerate={false}
        disabledReason="Generation service unavailable"
        degradation={{
          ...neutralDegradation,
          generationUnavailable: true,
        }}
      />,
    );

    const ribbon = screen.getByTestId("ai-copilot-ribbon");
    expect(ribbon).toHaveAttribute("data-phase", "failure");
    expect(ribbon).toHaveAttribute("data-service", "limited");
    expect(screen.getByText("Limited")).toBeInTheDocument();
  });
});
