// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeStep } from "@/components/workspace/recipe-step";
import type { VisualRecipe } from "@/types/models";
import type { DegradationState, WorkspaceError } from "@/hooks/use-workspace-state";

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

const noDegradation: DegradationState = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

const defaultProps = {
  recipe: mockRecipe,
  isExpanded: false,
  state: "analysis_ready" as const,
  onToggleExpanded: vi.fn(),
  degradation: noDegradation,
  error: null,
  onRetry: vi.fn(),
  onReplace: vi.fn(),
};

describe("RecipeStep", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- 5-field summary ---

  it("默认展示 5 字段Core Summary（subject/scene/lighting/color/mood）", () => {
    render(<RecipeStep {...defaultProps} />);

    expect(screen.getByText("Mountain range")).toBeInTheDocument();
    expect(screen.getByText("Alpine meadow")).toBeInTheDocument();
    expect(screen.getByText("Golden hour")).toBeInTheDocument();
    expect(screen.getByText("Warm palette")).toBeInTheDocument();
    expect(screen.getByText("Peaceful")).toBeInTheDocument();
  });

  it("默认折叠状态下展开按钮文案为 'Expand Full Recipe'", () => {
    render(<RecipeStep {...defaultProps} />);

    expect(screen.getByText("Expand Full Recipe")).toBeInTheDocument();
    expect(screen.queryByText("Collapse Full Recipe")).not.toBeInTheDocument();
  });

  // --- Expand/collapse ---

  it("点击展开按钮后展示完整配方", async () => {
    const onToggleExpanded = vi.fn();
    const user = userEvent.setup();

    render(
      <RecipeStep {...defaultProps} onToggleExpanded={onToggleExpanded} />,
    );

    await user.click(screen.getByText("Expand Full Recipe"));
    expect(onToggleExpanded).toHaveBeenCalledOnce();
  });

  it("isExpanded=true 时展示完整配方内容", () => {
    render(<RecipeStep {...defaultProps} isExpanded={true} />);

    expect(screen.getByText("Composition & Camera")).toBeInTheDocument();
    expect(screen.getByText("Rule of thirds")).toBeInTheDocument();
    expect(screen.getByText("Wide angle")).toBeInTheDocument();
    expect(screen.getByText("Texture & Style")).toBeInTheDocument();
    expect(screen.getByText("Soft")).toBeInTheDocument();
  });

  it("isExpanded=true 时展开按钮文案变为 'Collapse Full Recipe'", () => {
    render(<RecipeStep {...defaultProps} isExpanded={true} />);
    expect(screen.getByText("Collapse Full Recipe")).toBeInTheDocument();
  });

  // --- L3 degradation ---

  it("L3 降级：analysis_ready + 无 recipe + 有 promptText 时展示降级提示", () => {
    render(
      <RecipeStep
        {...defaultProps}
        recipe={null}
        state="analysis_ready"
        promptText="raw analysis text"
      />,
    );

    expect(
      screen.getByText("AI structuring failed, so raw analysis is shown instead."),
    ).toBeInTheDocument();
  });

  // --- L4 degradation ---

  it("L4 降级：analysisUnavailable 时展示降级提示", () => {
    render(
      <RecipeStep
        {...defaultProps}
        degradation={{ ...noDegradation, analysisUnavailable: true }}
      />,
    );

    expect(
      screen.getByText("Analysis is temporarily unavailable. Please try again later."),
    ).toBeInTheDocument();
  });

  // --- L1 analysis queueing ---

  it("L1 降级：analyzing + analysisQueueing 时展示排队提示", () => {
    render(
      <RecipeStep
        {...defaultProps}
        recipe={null}
        state="analyzing"
        degradation={{ ...noDegradation, analysisQueueing: true }}
      />,
    );

    expect(
      screen.getByText("Analysis is queued. Thanks for waiting."),
    ).toBeInTheDocument();
  });

  // --- Analysis error ---

  it("分析错误 ErrorDisplay 正确渲染", () => {
    const error: WorkspaceError = {
      message: "vision model failed",
      stage: "analysis",
      code: "VISION_FAILED",
      retryable: true,
    };

    render(
      <RecipeStep
        {...defaultProps}
        recipe={null}
        state="idle"
        error={error}
      />,
    );

    expect(screen.getByText("Vision Analysis Failed")).toBeInTheDocument();
  });

  // --- generation_ready title ---

  it("generation_ready 状态下标题变为 'Generation Settings'", () => {
    render(
      <RecipeStep {...defaultProps} state="generation_ready" />,
    );

    expect(screen.getByText(/Generation Settings/)).toBeInTheDocument();
  });

  // --- null recipe, no special conditions: return null ---

  it("recipe=null 且无降级/错误时不渲染", () => {
    const { container } = render(
      <RecipeStep
        {...defaultProps}
        recipe={null}
        state="analysis_ready"
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
