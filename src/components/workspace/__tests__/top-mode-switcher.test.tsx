// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TopModeSwitcher,
  stateToMode,
  type TopMode,
} from "@/components/workspace/top-mode-switcher";
import type { WorkspaceState } from "@/hooks/use-workspace-state";

describe("stateToMode", () => {
  it.each<{ state: WorkspaceState; mode: TopMode }>([
    { state: "idle", mode: "analyze" },
    { state: "uploading", mode: "analyze" },
    { state: "analyzing", mode: "analyze" },
    { state: "analysis_ready", mode: "editing" },
    { state: "generating", mode: "generate" },
    { state: "generation_ready", mode: "result" },
    { state: "history_restored", mode: "editing" },
  ])("maps $state to $mode", ({ state, mode }) => {
    expect(stateToMode(state)).toBe(mode);
  });
});

describe("TopModeSwitcher", () => {
  it("highlights the mode derived from workspace state", () => {
    render(
      <TopModeSwitcher
        state="analysis_ready"
        promptText="A generated prompt"
        manualModeOverride={null}
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Editing" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Analyze" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lets manual mode override the derived highlight", () => {
    render(
      <TopModeSwitcher
        state="analysis_ready"
        promptText="A generated prompt"
        manualModeOverride="generate"
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Generate" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("disables unavailable modes and ignores disabled clicks", async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TopModeSwitcher
        state="idle"
        promptText=""
        manualModeOverride={null}
        onModeChange={onModeChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Editing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Result" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Editing" }));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("calls onModeChange for enabled mode clicks", async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TopModeSwitcher
        state="analysis_ready"
        promptText="A generated prompt"
        manualModeOverride={null}
        onModeChange={onModeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(onModeChange).toHaveBeenCalledWith("generate");
  });
});
