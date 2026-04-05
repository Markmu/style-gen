// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutputSettings } from "@/components/workspace/output-settings";
import type { WorkspaceError } from "@/hooks/use-workspace-state";

describe("OutputSettings", () => {
  const defaultProps = {
    state: "analysis_ready" as const,
    generationUnavailable: false,
    onGenerate: vi.fn(),
    generationQueueing: false,
    error: null,
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    // Remove stored generation params before each test
    try {
      localStorage.removeItem("style-gen-gen-params");
    } catch {
      // Ignore if localStorage is not available
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Button label changes with state ---

  it("analysis_ready 状态按钮文案 '生成首版'", () => {
    render(<OutputSettings {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "生成首版" }),
    ).toBeInTheDocument();
  });

  it("generating 状态按钮文案 '正在生成...' 且禁用", () => {
    render(<OutputSettings {...defaultProps} state="generating" />);
    const btn = screen.getByRole("button", { name: "正在生成..." });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("generation_ready 状态按钮文案 '重新生成'", () => {
    render(<OutputSettings {...defaultProps} state="generation_ready" />);
    expect(
      screen.getByRole("button", { name: "重新生成" }),
    ).toBeInTheDocument();
  });

  // --- generationUnavailable ---

  it("generationUnavailable 时按钮 disabled", () => {
    render(
      <OutputSettings {...defaultProps} generationUnavailable={true} />,
    );
    const btn = screen.getByRole("button", { name: "生成首版" });
    expect(btn).toBeDisabled();
  });

  // --- L2 degradation ---

  it("L2 降级提示正确渲染", () => {
    render(
      <OutputSettings {...defaultProps} generationUnavailable={true} />,
    );
    expect(
      screen.getByText("图片生成服务暂时不可用"),
    ).toBeInTheDocument();
  });

  // --- Aspect ratio selector ---

  it("渲染所有宽高比选项 (5 buttons)", () => {
    render(<OutputSettings {...defaultProps} />);
    const ratios = ["1:1", "4:3", "16:9", "3:4", "9:16"];
    ratios.forEach((ratio) => {
      expect(
        screen.getByRole("button", { name: ratio }),
      ).toBeInTheDocument();
    });
  });

  // --- Quality selector ---

  it("渲染画质选项（标准/高清）", () => {
    render(<OutputSettings {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "标准" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "高清" }),
    ).toBeInTheDocument();
  });

  // --- Generate callback with params ---

  it("点击生成按钮触发 onGenerate 回调（含默认 aspectRatio + quality 参数）", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(<OutputSettings {...defaultProps} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "生成首版" }));
    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
    });
  });

  it("切换宽高比后生成 - 16:9", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(<OutputSettings {...defaultProps} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "16:9" }));
    await user.click(screen.getByRole("button", { name: "生成首版" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "standard",
    });
  });

  it("切换画质后生成 - 高清", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(<OutputSettings {...defaultProps} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "高清" }));
    await user.click(screen.getByRole("button", { name: "生成首版" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "hd",
    });
  });

  // --- Generation error display ---

  it("generation_ready 状态下 generation 阶段错误展示 ErrorDisplay", () => {
    const error: WorkspaceError = {
      message: "generation failed",
      stage: "generation",
      code: "GENERATION_TIMEOUT",
      retryable: true,
    };

    render(
      <OutputSettings
        {...defaultProps}
        state="generation_ready"
        error={error}
      />,
    );

    expect(screen.getByText("生成超时")).toBeInTheDocument();
  });

  // --- L1 generation queueing ---

  it("generating + generationQueueing 时展示排队提示", () => {
    render(
      <OutputSettings
        {...defaultProps}
        state="generating"
        generationQueueing={true}
      />,
    );

    expect(
      screen.getByText("生成排队中，请耐心等待"),
    ).toBeInTheDocument();
  });
});
