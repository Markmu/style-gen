// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { WorkspaceCanvas } from "@/components/workspace/workspace-canvas";
import type { VisualRecipe } from "@/types/models";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

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

const defaultProps = {
  state: "idle" as const,
  referenceImageUrl: null,
  resultImageUrl: null,
  recipe: null,
  isUploading: false,
  uploadProgress: 0,
  onFileSelected: vi.fn(),
  onReplace: vi.fn(),
};

describe("WorkspaceCanvas", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- canvasView derivation ---

  it("canvasView=upload：无参考图时渲染 UploadZone", () => {
    render(<WorkspaceCanvas {...defaultProps} />);
    expect(screen.getByText("点击或拖拽上传参考图")).toBeInTheDocument();
  });

  it("canvasView=reference：有参考图无结果图时渲染参考图", () => {
    render(
      <WorkspaceCanvas
        {...defaultProps}
        state="analysis_ready"
        referenceImageUrl="https://example.com/ref.png"
        recipe={mockRecipe}
      />,
    );

    const img = screen.getByAltText("参考图");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/ref.png");
  });

  it("canvasView=result：有结果图且 generation_ready 时渲染结果图", () => {
    render(
      <WorkspaceCanvas
        {...defaultProps}
        state="generation_ready"
        referenceImageUrl="https://example.com/ref.png"
        resultImageUrl="https://example.com/result.png"
        recipe={mockRecipe}
      />,
    );

    const img = screen.getByAltText("生成结果");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/result.png");
  });

  // --- Analyzing overlay ---

  it("analyzing 状态下显示分析中视觉反馈", () => {
    render(
      <WorkspaceCanvas
        {...defaultProps}
        state="analyzing"
        referenceImageUrl="https://example.com/ref.png"
      />,
    );

    expect(
      screen.getByText("AI 正在分析风格特征..."),
    ).toBeInTheDocument();
  });

  // --- StyleTagBar in reference view ---

  it("reference 视图有 recipe 时展示 StyleTagBar", () => {
    render(
      <WorkspaceCanvas
        {...defaultProps}
        state="analysis_ready"
        referenceImageUrl="https://example.com/ref.png"
        recipe={mockRecipe}
      />,
    );

    // StyleTagBar extracts tags from recipe.styleTags
    expect(screen.getByText("landscape")).toBeInTheDocument();
    expect(screen.getByText("nature")).toBeInTheDocument();
  });

  // --- UploadZone in upload view ---

  it("upload 视图下 UploadZone 正确渲染", () => {
    render(<WorkspaceCanvas {...defaultProps} />);
    expect(screen.getByText("点击或拖拽上传参考图")).toBeInTheDocument();
    expect(screen.getByText(/支持 JPG \/ PNG \/ WebP/)).toBeInTheDocument();
  });

  // --- Uploading state ---

  it("uploading 状态下显示上传进度", () => {
    render(
      <WorkspaceCanvas
        {...defaultProps}
        state="uploading"
        isUploading={true}
        uploadProgress={50}
      />,
    );

    expect(screen.getByText("正在上传... 50%")).toBeInTheDocument();
  });

  // --- CanvasToolbar in result view ---

  it("result 视图下显示 CanvasToolbar", () => {
    render(
      <WorkspaceCanvas
        {...defaultProps}
        state="generation_ready"
        referenceImageUrl="https://example.com/ref.png"
        resultImageUrl="https://example.com/result.png"
        recipe={mockRecipe}
      />,
    );

    expect(screen.getByText("结果图")).toBeInTheDocument();
    expect(screen.getByText("对比查看")).toBeInTheDocument();
    expect(screen.getByText("下载")).toBeInTheDocument();
  });
});
