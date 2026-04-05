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

  it("默认展示 5 字段核心摘要（subject/scene/lighting/color/mood）", () => {
    render(<RecipeStep {...defaultProps} />);

    expect(screen.getByText("Mountain range")).toBeInTheDocument();
    expect(screen.getByText("Alpine meadow")).toBeInTheDocument();
    expect(screen.getByText("Golden hour")).toBeInTheDocument();
    expect(screen.getByText("Warm palette")).toBeInTheDocument();
    expect(screen.getByText("Peaceful")).toBeInTheDocument();
  });

  it("默认折叠状态下展开按钮文案为 '展开完整配方'", () => {
    render(<RecipeStep {...defaultProps} />);

    expect(screen.getByText("展开完整配方")).toBeInTheDocument();
    expect(screen.queryByText("收起完整配方")).not.toBeInTheDocument();
  });

  // --- Expand/collapse ---

  it("点击展开按钮后展示完整配方", async () => {
    const onToggleExpanded = vi.fn();
    const user = userEvent.setup();

    render(
      <RecipeStep {...defaultProps} onToggleExpanded={onToggleExpanded} />,
    );

    await user.click(screen.getByText("展开完整配方"));
    expect(onToggleExpanded).toHaveBeenCalledOnce();
  });

  it("isExpanded=true 时展示完整配方内容", () => {
    render(<RecipeStep {...defaultProps} isExpanded={true} />);

    expect(screen.getByText("构图与镜头")).toBeInTheDocument();
    expect(screen.getByText("Rule of thirds")).toBeInTheDocument();
    expect(screen.getByText("Wide angle")).toBeInTheDocument();
    expect(screen.getByText("质感与风格")).toBeInTheDocument();
    expect(screen.getByText("Soft")).toBeInTheDocument();
  });

  it("isExpanded=true 时展开按钮文案变为 '收起完整配方'", () => {
    render(<RecipeStep {...defaultProps} isExpanded={true} />);
    expect(screen.getByText("收起完整配方")).toBeInTheDocument();
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
      screen.getByText("AI 结构化处理失败，已降级为原始分析结果"),
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
      screen.getByText("分析服务暂时不可用，请稍后重试"),
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
      screen.getByText("分析排队中，请耐心等待"),
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

    expect(screen.getByText("视觉分析失败")).toBeInTheDocument();
  });

  // --- generation_ready title ---

  it("generation_ready 状态下标题变为 '本次生成参数'", () => {
    render(
      <RecipeStep {...defaultProps} state="generation_ready" />,
    );

    expect(screen.getByText(/本次生成参数/)).toBeInTheDocument();
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
