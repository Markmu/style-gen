// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GeneratePanel } from "@/components/workspace/generate-panel";

describe("GeneratePanel", () => {
  const noop = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('analysis_ready 状态按钮文案 "GENERATE"', () => {
    render(
      <GeneratePanel workspaceState="analysis_ready" onGenerate={noop} />,
    );
    expect(
      screen.getByRole("button", { name: "GENERATE" }),
    ).toBeInTheDocument();
  });

  it('generation_ready 状态按钮文案 "GENERATE"', () => {
    render(
      <GeneratePanel workspaceState="generation_ready" onGenerate={noop} />,
    );
    expect(
      screen.getByRole("button", { name: "GENERATE" }),
    ).toBeInTheDocument();
  });

  it('generating 状态按钮禁用，文案 "GENERATING..."', () => {
    render(
      <GeneratePanel workspaceState="generating" onGenerate={noop} />,
    );
    const btn = screen.getByRole("button", { name: "GENERATING..." });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("点击生成触发回调 (default: aspectRatio '1:1', quality 'standard')", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(
      <GeneratePanel workspaceState="analysis_ready" onGenerate={onGenerate} />,
    );

    await user.click(screen.getByRole("button", { name: "GENERATE" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
    });
  });

  it("切换宽高比 - click '16:9' then generate", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(
      <GeneratePanel workspaceState="analysis_ready" onGenerate={onGenerate} />,
    );

    await user.click(screen.getByRole("button", { name: "16:9" }));
    await user.click(screen.getByRole("button", { name: "GENERATE" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "standard",
    });
  });

  it("切换画质 - click '高清' then generate", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(
      <GeneratePanel workspaceState="analysis_ready" onGenerate={onGenerate} />,
    );

    await user.click(screen.getByRole("button", { name: "高清" }));
    await user.click(screen.getByRole("button", { name: "GENERATE" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "hd",
    });
  });

  it("渲染所有宽高比选项 (5 buttons)", () => {
    render(
      <GeneratePanel workspaceState="analysis_ready" onGenerate={noop} />,
    );

    const ratios = ["1:1", "4:3", "16:9", "3:4", "9:16"];
    ratios.forEach((ratio) => {
      expect(
        screen.getByRole("button", { name: ratio }),
      ).toBeInTheDocument();
    });
  });

  it("disabled prop 禁用生成", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(
      <GeneratePanel
        workspaceState="analysis_ready"
        onGenerate={onGenerate}
        disabled
      />,
    );

    const btn = screen.getByRole("button", { name: "GENERATE" });
    expect(btn).toBeDisabled();

    await user.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
