// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutputCard } from "@/components/workspace/output-card";
import type { RenderReadiness } from "@/lib/render-readiness";

const readyReadiness: RenderReadiness = {
  promptResolved: true,
  variablesResolved: true,
  styleSignalsAvailable: true,
  serviceAvailable: true,
  workspaceIdle: true,
  canGenerate: true,
  disabledReason: "Generate with the current prompt.",
  nextAction: "generate",
};

const defaultProps = {
  state: "analysis_ready" as const,
  params: {
    aspectRatio: "1:1" as const,
    quality: "standard" as const,
    model: "flux-2-dev",
  },
  readiness: readyReadiness,
  onParamsChange: vi.fn(),
  onGenerate: vi.fn(),
};

describe("OutputCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders output controls with the generate button inside the card", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(<OutputCard {...defaultProps} onGenerate={onGenerate} />);

    expect(screen.getByTestId("output-card")).toBeInTheDocument();
    expect(screen.getByTestId("output-card")).toHaveAttribute(
      "data-readiness-can-generate",
      "true",
    );
    expect(screen.getByLabelText("Aspect Ratio")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
    expect(screen.getByLabelText("Aspect Ratio")).toHaveClass("render-select", "h-9");
    expect(screen.getByLabelText("Quality")).toHaveClass("render-select", "h-9");
    expect(screen.getByLabelText("Model")).toHaveClass("render-select", "h-9");
    expect(document.querySelectorAll(".lucide-chevron-down")).toHaveLength(3);
    expect(screen.getByTestId("render-parameter-controls")).toBeInTheDocument();
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Render ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt checks")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Render Dock" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-readiness-list")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^render-readiness-item-/)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
      model: "flux-2-dev",
    });
  });

  it("renders model options from the models.json catalog", () => {
    render(<OutputCard {...defaultProps} />);

    const modelSelect = screen.getByLabelText("Model");
    const options = Array.from(modelSelect.querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "FLUX.2 [dev]",
      "Nano Banana 2 Lite",
      "Nano Banana 2 Pro",
    ]);
    expect(modelSelect).toHaveValue("flux-2-dev");
  });

  it("reports parameter changes to the parent state", async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    render(<OutputCard {...defaultProps} onParamsChange={onParamsChange} />);

    await user.selectOptions(screen.getByLabelText("Aspect Ratio"), "16:9");
    await user.selectOptions(screen.getByLabelText("Quality"), "hd");
    await user.selectOptions(
      screen.getByLabelText("Model"),
      "nano-banana-2-lite",
    );

    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "standard",
      model: "flux-2-dev",
    });
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "hd",
      model: "flux-2-dev",
    });
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
      model: "nano-banana-2-lite",
    });
  });

  it("keeps generate disabled when the prompt is not ready", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    const readiness: RenderReadiness = {
      ...readyReadiness,
      variablesResolved: false,
      canGenerate: false,
      disabledReason: "Resolve template variables before generating.",
      nextAction: "resolve_variables",
    };

    render(
      <OutputCard
        {...defaultProps}
        readiness={readiness}
        onGenerate={onGenerate}
      />,
    );

    const button = screen.getByRole("button", { name: "Generate" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Resolve template variables before generating.",
    );
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-readiness-item-variables")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-disabled-reason")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-next-action")).not.toBeInTheDocument();

    await user.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("keeps the dock scoped as a prompt-column control surface", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card")).toHaveClass("min-w-0", "rounded-xl");
  });

  it("keeps Render Dock scoped to generation controls", () => {
    render(<OutputCard {...defaultProps} />);

    expect(screen.getByTestId("output-card-actions")).toHaveClass(
      "grid",
      "sm:grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(screen.getByTestId("render-parameter-controls")).toHaveClass(
      "grid",
      "grid-cols-2",
    );
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Aspect Ratio")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps parameters visible but disabled while generating", () => {
    const readiness: RenderReadiness = {
      ...readyReadiness,
      workspaceIdle: false,
      canGenerate: false,
      disabledReason: "Wait for the current workspace task to finish.",
      nextAction: "wait_for_task",
    };

    render(<OutputCard {...defaultProps} state="generating" readiness={readiness} />);

    expect(screen.getByLabelText("Aspect Ratio")).toBeVisible();
    expect(screen.getByLabelText("Aspect Ratio")).toBeDisabled();
    expect(screen.getByLabelText("Quality")).toBeVisible();
    expect(screen.getByLabelText("Quality")).toBeDisabled();
    expect(screen.getByLabelText("Model")).toBeVisible();
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rendering..." })).toBeDisabled();
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Parameters are locked while the render runs.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-readiness-item-workspace-idle")).not.toBeInTheDocument();
    // plan-07（架构 §8.2 L1）：排队提示只在 >60s 排队时出现，普通进行中不显示
    expect(screen.queryByTestId("generation-queueing-note")).not.toBeInTheDocument();
  });

  // ─── plan-07（架构 §8.2 L1 / Task 5）：排队提示内联呈现于 Render Dock ──────

  it("shows the L1 queueing note inline while generating past the threshold", () => {
    const readiness: RenderReadiness = {
      ...readyReadiness,
      workspaceIdle: false,
      canGenerate: false,
      disabledReason: "Wait for the current workspace task to finish.",
      nextAction: "wait_for_task",
    };

    render(
      <OutputCard
        {...defaultProps}
        state="generating"
        readiness={readiness}
        generationQueueing
      />,
    );

    const note = screen.getByTestId("generation-queueing-note");
    expect(note).toBeVisible();
    expect(note).toHaveAttribute("role", "status");
    // 三段式：发生了什么 / 保留了什么 / 下一步
    expect(note).toHaveTextContent(/Generation is queued\. Thanks for waiting/);
    expect(note).toHaveTextContent(/保持不变/);
    expect(note).toHaveTextContent(/本次结果区/);
    // 参数仍可见（保留能力），Generate 维持进行中态
    expect(screen.getByLabelText("Aspect Ratio")).toBeVisible();
    expect(screen.getByRole("button", { name: "Rendering..." })).toBeDisabled();
  });

  it("keeps service unavailable state visually compact", () => {
    const readiness: RenderReadiness = {
      ...readyReadiness,
      serviceAvailable: false,
      canGenerate: false,
      disabledReason:
        "Generation service is temporarily unavailable. Retry service when ready.",
      nextAction: "retry_service",
    };

    render(<OutputCard {...defaultProps} readiness={readiness} />);

    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate" })).toHaveAttribute(
      "title",
      "Generation service is temporarily unavailable. Retry service when ready.",
    );
    expect(screen.queryByTestId("render-status-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-status-detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-disabled-reason")).not.toBeInTheDocument();
    expect(screen.queryByTestId("render-recovery-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry service" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
  });

  // ─── plan-02（ADR-2）：快速复刻 armed 期间生成设置只读 ─────────────────────

  it("locks the confirmed generation settings while quick recreate is armed", async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();
    const onGenerate = vi.fn();

    render(
      <OutputCard
        {...defaultProps}
        onParamsChange={onParamsChange}
        onGenerate={onGenerate}
        settingsLocked
      />,
    );

    // armed：自动任务将使用已确认设置——三个下拉只读
    expect(screen.getByLabelText("Aspect Ratio")).toBeDisabled();
    expect(screen.getByLabelText("Quality")).toBeDisabled();
    expect(screen.getByLabelText("Model")).toBeDisabled();
    // 参数保持可见（只读不隐藏）
    expect(screen.getByLabelText("Aspect Ratio")).toBeVisible();
    expect(screen.getByLabelText("Model")).toHaveValue("flux-2-dev");

    await user.selectOptions(screen.getByLabelText("Aspect Ratio"), "16:9");
    expect(onParamsChange).not.toHaveBeenCalled();

    // Generate 按钮仍由 readiness 决定，不被 armed 锁死
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerate).toHaveBeenCalledWith({
      aspectRatio: "1:1",
      quality: "standard",
      model: "flux-2-dev",
    });
  });

  it("restores editable settings after the quick authorization is cleared (recovery)", async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    const { rerender } = render(
      <OutputCard
        {...defaultProps}
        onParamsChange={onParamsChange}
        settingsLocked
      />,
    );
    expect(screen.getByLabelText("Aspect Ratio")).toBeDisabled();

    // 退出快速路径 / 分析失败清授权后恢复可编辑
    rerender(
      <OutputCard
        {...defaultProps}
        onParamsChange={onParamsChange}
        settingsLocked={false}
      />,
    );
    expect(screen.getByLabelText("Aspect Ratio")).toBeEnabled();
    expect(screen.getByLabelText("Quality")).toBeEnabled();
    expect(screen.getByLabelText("Model")).toBeEnabled();

    await user.selectOptions(screen.getByLabelText("Aspect Ratio"), "16:9");
    expect(onParamsChange).toHaveBeenCalledWith({
      aspectRatio: "16:9",
      quality: "standard",
      model: "flux-2-dev",
    });
  });

  it("keeps the readiness disabled reason as the single explanation while locked", () => {
    const readiness: RenderReadiness = {
      ...readyReadiness,
      workspaceIdle: false,
      canGenerate: false,
      disabledReason: "Wait for the current workspace task to finish.",
      nextAction: "wait_for_task",
    };

    render(
      <OutputCard
        {...defaultProps}
        state="analyzing"
        readiness={readiness}
        settingsLocked
      />,
    );

    const button = screen.getByRole("button", { name: "Generate" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Wait for the current workspace task to finish.",
    );
    // armed 锁定说明由创作节奏区（quick-authorization-locked-note）承载，
    // Render Dock 不复制第二套解释
    expect(screen.queryByTestId("render-disabled-reason")).not.toBeInTheDocument();
  });
});

// ─── plan-04（架构 §6.3 / AC-03）：共享画幅白名单与来源徽标 ───────────────────

describe("OutputCard aspect ratio source badge", () => {
  it("consumes the shared plan-01 allowlist instead of a local copy", () => {
    render(<OutputCard {...defaultProps} />);

    const ratioSelect = screen.getByLabelText("Aspect Ratio");
    const options = Array.from(ratioSelect.querySelectorAll("option")).map(
      (option) => option.getAttribute("value"),
    );
    expect(options).toEqual(["1:1", "4:3", "16:9", "3:4", "9:16"]);
  });

  it.each([
    { source: "reference", recommended: "true", label: "参考图推荐" },
    { source: "user", recommended: "false", label: "Your selection" },
    { source: "restore", recommended: "false", label: "Restored iteration" },
    { source: "fallback", recommended: "false", label: "1:1 fallback" },
  ] as const)(
    "renders the $source badge with recommended=$recommended",
    ({ source, recommended, label }) => {
      render(
        <OutputCard
          {...defaultProps}
          aspectRatioSource={source}
        />,
      );

      const badge = screen.getByTestId("aspect-ratio-source");
      expect(badge).toHaveAttribute("data-source", source);
      expect(badge).toHaveAttribute("data-recommended", recommended);
      expect(badge).toHaveTextContent(label);
    },
  );

  it("hides the badge when no source is provided (preview mode)", () => {
    render(<OutputCard {...defaultProps} />);
    expect(screen.queryByTestId("aspect-ratio-source")).not.toBeInTheDocument();
  });

  it("keeps the badge visible while settings are locked (armed)", () => {
    render(
      <OutputCard
        {...defaultProps}
        aspectRatioSource="reference"
        settingsLocked
      />,
    );
    expect(screen.getByTestId("aspect-ratio-source")).toBeVisible();
    expect(screen.getByLabelText("Aspect Ratio")).toBeDisabled();
  });
});
