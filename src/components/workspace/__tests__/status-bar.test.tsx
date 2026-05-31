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
});
