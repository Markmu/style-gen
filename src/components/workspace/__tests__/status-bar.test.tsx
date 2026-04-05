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
    { state: "idle", expectedLabel: "未开始" },
    { state: "uploading", expectedLabel: "未开始" },
    { state: "analyzing", expectedLabel: "分析中" },
    { state: "analysis_ready", expectedLabel: "可生成" },
    { state: "generating", expectedLabel: "生成中" },
    { state: "generation_ready", expectedLabel: "已完成" },
  ])(
    "状态 $state 下标签文案为 $expectedLabel",
    ({ state, expectedLabel }) => {
      render(<StatusBar {...defaultProps} state={state} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    },
  );

  // --- showReplaceButton conditions ---

  it.each<WorkspaceState>(["idle", "uploading", "analyzing"])(
    "状态 %s 不显示更换参考图按钮",
    (state) => {
      render(<StatusBar {...defaultProps} state={state} />);
      expect(screen.queryByText("更换参考图")).not.toBeInTheDocument();
    },
  );

  it.each<WorkspaceState>([
    "analysis_ready",
    "generating",
    "generation_ready",
  ])("状态 %s 显示更换参考图按钮", (state) => {
    render(<StatusBar {...defaultProps} state={state} />);
    expect(screen.getByText("更换参考图")).toBeInTheDocument();
  });

  // --- Replace button callback ---

  it("点击更换参考图按钮触发 onReplace 回调", async () => {
    const onReplace = vi.fn();
    const user = userEvent.setup();

    render(
      <StatusBar {...defaultProps} state="analysis_ready" onReplace={onReplace} />,
    );

    await user.click(screen.getByText("更换参考图"));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  // --- Title always renders ---

  it("始终展示标题 '基于参考图创作'", () => {
    render(<StatusBar {...defaultProps} state="idle" />);
    expect(screen.getByText("基于参考图创作")).toBeInTheDocument();
  });
});
