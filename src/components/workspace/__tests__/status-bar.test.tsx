// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusBar } from "@/components/workspace/status-bar";
import type { WorkspaceState } from "@/hooks/use-workspace-state";

describe("StatusBar", () => {
  const defaultProps = {
    error: null,
    resultImageUrl: null,
    onReplace: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Status label text ---

  it.each<{ state: WorkspaceState; expectedLabel: string }>([
    { state: "idle", expectedLabel: "Not Started" },
    { state: "uploading", expectedLabel: "Not Started" },
    { state: "analyzing", expectedLabel: "Analyzing" },
    { state: "analysis_ready", expectedLabel: "Ready to Generate" },
    { state: "generating", expectedLabel: "Generating" },
    { state: "generation_ready", expectedLabel: "Done" },
  ])(
    "状态 $state 下标签文案为 $expectedLabel",
    ({ state, expectedLabel }) => {
      render(<StatusBar {...defaultProps} state={state} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    },
  );

  // --- showReplaceButton conditions ---

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

  // --- Title always renders ---

  it("始终展示标题 'Create From Reference'", () => {
    render(<StatusBar {...defaultProps} state="idle" />);
    expect(screen.getByText("Create From Reference")).toBeInTheDocument();
  });
});
