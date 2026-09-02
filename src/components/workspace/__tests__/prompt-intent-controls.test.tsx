// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptIntentControls } from "@/components/workspace/prompt-intent-controls";

function renderControls(overrides: Partial<Parameters<typeof PromptIntentControls>[0]> = {}) {
  const onIntentChange = vi.fn();
  const onDetailChange = vi.fn();
  const onEditorModeChange = vi.fn();
  const props = {
    intent: "same_style" as const,
    detailLevel: "standard" as const,
    editorMode: "variables" as const,
    customPromptDirty: false,
    onIntentChange,
    onDetailChange,
    onEditorModeChange,
    ...overrides,
  };
  render(<PromptIntentControls {...props} />);
  return { onIntentChange, onDetailChange, onEditorModeChange, props };
}

describe("PromptIntentControls", () => {
  it("renders both axes as top level with editor mode as secondary entries", () => {
    renderControls();

    const container = screen.getByTestId("prompt-intent-controls");
    expect(container).toHaveAttribute("data-intent", "same_style");
    expect(container).toHaveAttribute("data-detail", "standard");
    expect(container).toHaveAttribute("data-editor-mode", "variables");

    expect(screen.getByTestId("intent-option-same-style")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("intent-option-reconstruction")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("detail-option-standard")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("detail-option-concise")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("detail-option-professional")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("editor-mode-option-variables")).toBeVisible();
    expect(screen.getByTestId("editor-mode-option-text")).toBeVisible();
    expect(screen.getByTestId("editor-mode-option-structured")).toBeVisible();
  });

  it("switches intent and detail immediately when the full text is not dirty", async () => {
    const user = userEvent.setup();
    const { onIntentChange, onDetailChange } = renderControls();

    await user.click(screen.getByTestId("intent-option-reconstruction"));
    expect(onIntentChange).toHaveBeenCalledWith("reconstruction");
    expect(
      screen.queryByTestId("prompt-switch-confirm-dialog"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("detail-option-concise"));
    expect(onDetailChange).toHaveBeenCalledWith("concise");
    expect(
      screen.queryByTestId("prompt-switch-confirm-dialog"),
    ).not.toBeInTheDocument();
  });

  it("supports keyboard activation on the axis toggles", async () => {
    const user = userEvent.setup();
    const { onDetailChange } = renderControls();

    screen.getByTestId("detail-option-professional").focus();
    await user.keyboard("{Enter}");
    expect(onDetailChange).toHaveBeenCalledWith("professional");
  });

  it("requires confirmation after a manual full-text edit and cancels with zero writes", async () => {
    const user = userEvent.setup();
    const { onDetailChange } = renderControls({ customPromptDirty: true });

    await user.click(screen.getByTestId("detail-option-concise"));
    const dialog = screen.getByTestId("prompt-switch-confirm-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(onDetailChange).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("prompt-switch-confirm-cancel"));
    expect(screen.queryByTestId("prompt-switch-confirm-dialog")).not.toBeInTheDocument();
    expect(onDetailChange).not.toHaveBeenCalled();
    // 取消零写入：焦点回触发切换的控件
    expect(screen.getByTestId("detail-option-concise")).toHaveFocus();
  });

  it("accepts the pending selection and applies the switch", async () => {
    const user = userEvent.setup();
    const { onIntentChange } = renderControls({ customPromptDirty: true });

    await user.click(screen.getByTestId("intent-option-reconstruction"));
    await user.click(screen.getByTestId("prompt-switch-confirm-accept"));

    expect(screen.queryByTestId("prompt-switch-confirm-dialog")).not.toBeInTheDocument();
    expect(onIntentChange).toHaveBeenCalledTimes(1);
    expect(onIntentChange).toHaveBeenCalledWith("reconstruction");
  });

  it("ignores clicks on the already selected axis value (no confirm churn)", async () => {
    const user = userEvent.setup();
    const { onIntentChange } = renderControls({ customPromptDirty: true });

    await user.click(screen.getByTestId("intent-option-same-style"));
    expect(screen.queryByTestId("prompt-switch-confirm-dialog")).not.toBeInTheDocument();
    expect(onIntentChange).not.toHaveBeenCalled();
  });

  it("locks intent and detail while quick recreate is armed and explains why", () => {
    renderControls({ locked: true });

    expect(screen.getByTestId("prompt-controls-locked-note")).toBeVisible();
    expect(screen.getByTestId("prompt-controls-locked-note")).toHaveTextContent(
      /自动任务将使用已确认设置/,
    );
    expect(screen.getByTestId("intent-option-reconstruction")).toBeDisabled();
    expect(screen.getByTestId("intent-option-same-style")).toBeDisabled();
    expect(screen.getByTestId("detail-option-concise")).toBeDisabled();
    expect(screen.getByTestId("detail-option-standard")).toBeDisabled();
    expect(screen.getByTestId("detail-option-professional")).toBeDisabled();
  });

  it("keeps the control area rendered but disabled while analyzing", () => {
    renderControls({ disabled: true });

    expect(screen.getByTestId("prompt-intent-controls")).toBeVisible();
    expect(screen.getByTestId("intent-option-reconstruction")).toBeDisabled();
    expect(screen.getByTestId("detail-option-concise")).toBeDisabled();
    expect(screen.queryByTestId("prompt-controls-locked-note")).not.toBeInTheDocument();
  });

  it("switches the editor mode entry immediately (no dirty confirm)", async () => {
    const user = userEvent.setup();
    const { onEditorModeChange } = renderControls({ customPromptDirty: true });

    await user.click(screen.getByTestId("editor-mode-option-text"));
    expect(onEditorModeChange).toHaveBeenCalledWith("text");
    expect(
      screen.queryByTestId("prompt-switch-confirm-dialog"),
    ).not.toBeInTheDocument();
  });

  it("disables the structured entry when no complete V2 recipe is available", () => {
    renderControls({ structuredAvailable: false });

    expect(screen.getByTestId("editor-mode-option-structured")).toBeDisabled();
    expect(screen.getByTestId("editor-mode-option-variables")).toBeEnabled();
    expect(screen.getByTestId("editor-mode-option-text")).toBeEnabled();
  });
});
