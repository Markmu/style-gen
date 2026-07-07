// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusBar } from "@/components/workspace/status-bar";
import type { WorkspaceState } from "@/hooks/use-workspace-state";

describe("StatusBar", () => {
  const defaultProps = {
    error: null,
    resultImageUrl: null,
    promptText: "",
    manualModeOverride: null,
    onModeChange: vi.fn(),
    onReplace: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workspace title and top mode switcher", () => {
    render(<StatusBar {...defaultProps} state="idle" />);

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    const header = screen.getByTestId("ai-status-header");
    expect(header).toHaveAttribute("data-phase", "idle");
    expect(header).toHaveTextContent(/upload a reference/i);
    expect(header).toHaveTextContent(/service ready and available/i);
    expect(header).toHaveTextContent(/next: upload a reference image/i);
    expect(screen.queryByText("Style Gen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace help")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User avatar")).not.toBeInTheDocument();
    expect(screen.getByTestId("top-mode-switcher")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it.each<WorkspaceState>(["idle", "uploading", "analyzing"])(
    "状态 %s 不显示Replace Reference按钮",
    (state) => {
      render(<StatusBar {...defaultProps} state={state} />);
      expect(screen.queryByText("Replace Reference")).not.toBeInTheDocument();
    },
  );

  it.each<WorkspaceState>([
    "analysis_ready",
    "generating",
    "generation_ready",
    "history_restored",
  ])("状态 %s 显示Replace Reference按钮", (state) => {
    render(<StatusBar {...defaultProps} state={state} />);
    expect(screen.getByText("Replace Reference")).toBeInTheDocument();
  });

  // --- Replace button callback ---

  it("点击Replace Reference按钮触发 onReplace 回调", async () => {
    const onReplace = vi.fn();
    const user = userEvent.setup();

    render(
      <StatusBar {...defaultProps} state="analysis_ready" onReplace={onReplace} />,
    );

    await user.click(screen.getByText("Replace Reference"));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("模式按钮点击触发 onModeChange", async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <StatusBar
        {...defaultProps}
        state="analysis_ready"
        promptText="ready prompt"
        onModeChange={onModeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(onModeChange).toHaveBeenCalledWith("generate");
  });

  it("maps analysis processing to visible AI evidence language", () => {
    render(<StatusBar {...defaultProps} state="analyzing" />);

    const header = screen.getByTestId("ai-status-header");
    expect(header).toHaveAttribute("data-phase", "analyzing");
    expect(header).toHaveTextContent(/reading style signals/i);
    expect(header).toHaveTextContent(/color, composition, lighting, texture, and mood/i);
  });

  it("maps analysis ready to readiness and next action", () => {
    render(
      <StatusBar
        {...defaultProps}
        state="analysis_ready"
        promptText="ready prompt"
      />,
    );

    const header = screen.getByTestId("ai-status-header");
    expect(header).toHaveAttribute("data-phase", "analysis_ready");
    expect(header).toHaveTextContent(/evidence is ready/i);
    expect(header).toHaveTextContent(/ready to generate/i);
    expect(header).toHaveTextContent(/next: refine intent or generate/i);
  });

  it("shows service-limited recoverable failure without hiding next action", () => {
    render(
      <StatusBar
        {...defaultProps}
        state="generation_ready"
        error={{
          message: "Generation provider unavailable",
          stage: "generation",
          code: "SERVICE_UNAVAILABLE",
          retryable: true,
        }}
      />,
    );

    const header = screen.getByTestId("ai-status-header");
    expect(header).toHaveAttribute("data-phase", "failure");
    expect(header).toHaveTextContent(/recoverable failure/i);
    expect(header).toHaveTextContent(/service unavailable/i);
    expect(header).toHaveTextContent(/retry the step or go back to edit/i);
  });
});
