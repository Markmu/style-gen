// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PromptCard } from "@/components/workspace/prompt-card";

const STYLE_MEMORY_SAVE_BUTTON = "Save as Style Memory";

describe("PromptCard", () => {
  it("keeps a single outer Style Memory save button and saves source with variables", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();
    const onTemplateVariablesChange = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Create glass fox inside neon garden."
        templateContent="Create {{subject}} inside {{scene}}."
        templateVariables={[
          {
            name: "subject",
            defaultValue: "glass fox",
            label: "Subject",
            sourceField: "subject",
          },
          {
            name: "scene",
            defaultValue: "neon garden",
            label: "Scene",
            sourceField: "scene",
          },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
        onTemplateVariablesChange={onTemplateVariablesChange}
        onSaveTemplate={onSaveTemplate}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }).nextElementSibling,
    ).toBe(screen.getByRole("button", { name: "Expand Prompt editor" }));
    const expandButton = screen.getByRole("button", {
      name: "Expand Prompt editor",
    });
    expect(expandButton.querySelector("svg")).toHaveClass("lucide-maximize");
    expect(screen.getByText("Prompt and generation controls")).toBeInTheDocument();
    expect(screen.queryByText("Prompt provenance and generation controls")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Prompt help")).toBeNull();
    expect(screen.queryByText("Output")).toBeNull();
    expect(screen.queryByText("Use recipe guidance")).toBeNull();
    expect(screen.getByLabelText("Variable negative_prompt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }));

    expect(onSaveTemplate).toHaveBeenCalledWith(
      "Create {{subject}} inside {{scene}}.",
    );
    await waitFor(() =>
      expect(onTemplateVariablesChange).toHaveBeenLastCalledWith([
        {
          name: "subject",
          defaultValue: "glass fox",
          label: "Subject",
          sourceField: "subject",
        },
        {
          name: "scene",
          defaultValue: "neon garden",
          label: "Scene",
          sourceField: "scene",
        },
        {
          name: "negative_prompt",
          defaultValue: "",
          label: "Negative constraints",
        },
      ]),
    );
  });

  it("treats Negative Prompt as a template variable", async () => {
    const user = userEvent.setup();
    const onNegativePromptChange = vi.fn();

    function PromptCardHarness() {
      const [negativePromptText, setNegativePromptText] = useState("blurry, text");

      return (
        <PromptCard
          state="analysis_ready"
          promptText="Create glass fox."
          negativePromptText={negativePromptText}
          templateContent="Create {{subject}}."
          templateVariables={[{ name: "subject", defaultValue: "glass fox" }]}
          templateStatus="ready"
          onResolvedPromptChange={vi.fn()}
          onNegativePromptChange={(value) => {
            setNegativePromptText(value);
            onNegativePromptChange(value);
          }}
        />
      );
    }

    render(<PromptCardHarness />);

    const negativeVariable = screen.getByLabelText("Variable negative_prompt");

    expect(negativeVariable.tagName).toBe("TEXTAREA");
    expect(negativeVariable).toHaveValue("blurry, text");

    await user.clear(negativeVariable);
    await user.type(negativeVariable, "low quality");

    expect(onNegativePromptChange).toHaveBeenLastCalledWith("low quality");
  });

  it("uses the outer save button for the current text mode draft", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Initial prompt"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={onSaveTemplate}
      />,
    );

    expect(screen.getByLabelText("Variable negative_prompt")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "Manual draft prompt");
    await user.click(screen.getByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }));

    expect(onSaveTemplate).toHaveBeenCalledWith("Manual draft prompt");
  });

  it("does not reset edited template source when the resolved prompt changes", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();
    const baseProps = {
      state: "analysis_ready" as const,
      templateContent: "Create {{subject}} inside {{scene}}.",
      templateVariables: [
        { name: "subject", defaultValue: "glass fox" },
        { name: "scene", defaultValue: "neon garden" },
      ],
      templateStatus: "ready" as const,
      templateKey: "analysis-1",
      onResolvedPromptChange: vi.fn(),
      onSaveTemplate,
    };

    const { rerender } = render(
      <PromptCard
        {...baseProps}
        promptText="Create glass fox inside neon garden."
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    fireEvent.change(screen.getByLabelText("Template Source"), {
      target: { value: "Paint {{subject}}." },
    });

    rerender(
      <PromptCard
        {...baseProps}
        promptText="Paint crystal fox."
      />,
    );
    await user.click(screen.getByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }));

    expect(onSaveTemplate).toHaveBeenCalledWith("Paint {{subject}}.");
  });

  it("renders variables without prompt provenance in the editor", () => {
    render(
      <PromptCard
        state="analysis_ready"
        promptText="Golden hour product render."
        negativePromptText="blurry"
        templateContent="Create {{subject}} in {{lighting}}."
        templateVariables={[
          { name: "subject", defaultValue: "bottle" },
          { name: "lighting", defaultValue: "golden hour" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON })).toHaveLength(1);
    expect(screen.queryByTestId("prompt-provenance-span-lighting")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-provenance-facet-only-texture")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Variable negative_prompt")).toHaveValue("blurry");
    expect(screen.queryByTestId("unified-prompt-selected-provenance")).not.toBeInTheDocument();
  });

  it("hides Style Memory save when a history item is restored", () => {
    render(
      <PromptCard
        state="history_restored"
        promptText="Restored history prompt"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }),
    ).not.toBeInTheDocument();
  });

  it("expands the edit area to fill the space above Render Dock", () => {
    render(
      <PromptCard
        state="analysis_ready"
        promptText="Golden hour product render."
        onResolvedPromptChange={vi.fn()}
        renderDock={<div>Render Dock</div>}
      />,
    );

    expect(screen.getByTestId("prompt-editor-frame")).toHaveClass(
      "min-h-[14rem]",
      "flex-1",
      "overflow-hidden",
    );
    expect(screen.getByTestId("prompt-editor-frame")).not.toHaveClass(
      "h-[5.75rem]",
    );
    expect(screen.getByTestId("unified-prompt-editor")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(screen.getByTestId("prompt-render-dock-slot")).toHaveClass(
      "mt-2",
      "shrink-0",
    );
  });

  it("enlarges the same editor instance, hides Render Dock, and preserves the draft", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Initial prompt"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={onSaveTemplate}
        renderDock={<div>Render Dock</div>}
      />,
    );

    const promptInput = screen.getByLabelText("Full Generation Prompt");
    await user.clear(promptInput);
    await user.type(promptInput, "Expanded prompt draft");

    const expandButton = screen.getByRole("button", {
      name: "Expand Prompt editor",
    });
    expandButton.focus();
    await user.click(expandButton);

    expect(screen.getByRole("dialog", { name: "Prompt + Render" })).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Close expanded Prompt editor" })
        .querySelector("svg"),
    ).toHaveClass("lucide-minimize");
    expect(screen.getByTestId("unified-prompt-editor")).toHaveAttribute(
      "data-compact",
      "false",
    );
    expect(screen.getByLabelText("Full Generation Prompt")).toBe(promptInput);
    expect(promptInput).toHaveValue("Expanded prompt draft");
    expect(screen.queryByTestId("prompt-render-dock-slot")).not.toBeInTheDocument();
    expect(screen.queryByText("Render Dock")).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("prompt-expandable-panel-backdrop"));

    expect(screen.queryByRole("dialog", { name: "Prompt + Render" })).not.toBeInTheDocument();
    expect(screen.getByTestId("unified-prompt-editor")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(screen.getByLabelText("Full Generation Prompt")).toBe(promptInput);
    expect(promptInput).toHaveValue("Expanded prompt draft");
    expect(screen.getByTestId("prompt-render-dock-slot")).toBeInTheDocument();
    expect(expandButton).toHaveFocus();

    await user.click(screen.getByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON }));
    expect(onSaveTemplate).toHaveBeenCalledWith("Expanded prompt draft");
  });

  it("shows preserved prompt context and back to edit after analysis failure", () => {
    render(
      <PromptCard
        state="idle"
        promptText=""
        error={{ message: "Analysis failed" }}
        onBackToEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/Prompt context preserved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to Edit/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand Prompt editor" }),
    ).toBeInTheDocument();
  });
});

// ─── plan-04（架构 §6.2 / AC-02 / AC-05）：两轴控制、摘要与最终 Prompt 挂载 ────

import type {
  PromptCardControlsState,
  PromptCardKeepChangeState,
} from "@/components/workspace/prompt-card";
import type { V2PromptWorkspaceState, VisualRecipeV2Success } from "@/types/models";

const v2Recipe: VisualRecipeV2Success = {
  schemaVersion: 2,
  extractionStatus: "ready",
  extractionReasons: [],
  contentDescription: {
    summary: "An amber bottle on folded linen",
    subject: "amber bottle",
    subjectAttributes: [],
    supportingElements: [],
  },
  styleProfile: {
    visualMedium: [],
    composition: [],
    camera: [],
    color: [
      { id: "color_1", value: "warm amber and sand palette", evidence: [], confidence: 0.92 },
    ],
    lighting: [],
    formLanguage: [],
    materialTexture: [],
    atmosphere: [],
    rendering: [],
  },
  styleInvariants: [
    {
      id: "color_invariant_1",
      kind: "hard",
      dimension: "color",
      value: "warm amber and sand palette",
      evidence: [],
      confidence: 0.92,
      sourceObservationIds: ["color_1"],
    },
  ],
  contentVariables: [
    { name: "subject", label: "Subject", defaultValue: "amber bottle", sourceField: "subject" },
  ],
  optionalModifiers: [],
  negativeConstraints: [],
  styleFingerprint: {
    tokens: [],
    scores: {
      realism: null, abstraction: null, contrast: null, saturation: null,
      softness: null, detailDensity: null, symmetry: null, depth: null,
      atmosphericIntensity: null,
    },
  },
  promptOutputs: {
    reconstructionPrompt: "",
    conciseTemplate: "",
    standardTemplate: "",
    professionalTemplate: "",
  },
};

const v2State: V2PromptWorkspaceState = {
  outputMode: "standard",
  enabledInvariantIds: ["color_invariant_1"],
  variableValues: { subject: "amber bottle" },
  enabledModifierNames: [],
  modifierValues: {},
  customPrompt: "",
};

const controlsState: PromptCardControlsState = {
  intent: "same_style",
  detailLevel: "standard",
  editorMode: "variables",
  customPromptDirty: false,
  disabled: false,
  locked: false,
  structuredAvailable: true,
};

const keepChangeState: PromptCardKeepChangeState = {
  keepItems: [
    {
      invariantId: "color_invariant_1",
      value: "warm amber and sand palette",
      dimension: "color",
    },
  ],
  changeItems: [],
  highlightedTargetId: null,
  announcement: null,
};

describe("PromptCard plan-04 structure and degraded states", () => {
  it("mounts intent controls, keep/change summary, and compiled prompt above the editor", () => {
    const onIntentChange = vi.fn();
    const onDetailChange = vi.fn();
    const onEditorModeChange = vi.fn();
    const onKeepChangeLocate = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Content: amber bottle; Color: warm amber and sand palette"
        recipe={v2Recipe}
        v2PromptState={v2State}
        onV2PromptStateChange={vi.fn()}
        onResolvedPromptChange={vi.fn()}
        promptControlsState={controlsState}
        onIntentChange={onIntentChange}
        onDetailChange={onDetailChange}
        onEditorModeChange={onEditorModeChange}
        compiledPromptText="Content: amber bottle; Color: warm amber and sand palette"
        keepChange={keepChangeState}
        onKeepChangeLocate={onKeepChangeLocate}
      />,
    );

    const controls = screen.getByTestId("prompt-intent-controls");
    expect(controls).toHaveAttribute("data-intent", "same_style");
    expect(controls).toHaveAttribute("data-detail", "standard");
    expect(controls).toHaveAttribute("data-editor-mode", "variables");

    const summary = screen.getByTestId("keep-change-summary");
    expect(summary).toHaveAttribute("data-intent", "same_style");
    expect(summary.querySelectorAll('[data-kind="keep"]')).toHaveLength(1);

    expect(screen.getByTestId("compiled-prompt-text")).toHaveTextContent(
      "Content: amber bottle; Color: warm amber and sand palette",
    );
    expect(screen.getByTestId("structured-prompt-editor")).toBeInTheDocument();
  });

  it("keeps the control area rendered in disabled state while analyzing", () => {
    render(
      <PromptCard
        state="analyzing"
        promptText=""
        promptControlsState={{ ...controlsState, disabled: true }}
        onIntentChange={vi.fn()}
        onDetailChange={vi.fn()}
        onEditorModeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("prompt-intent-controls")).toBeVisible();
    expect(screen.getByTestId("detail-option-concise")).toBeDisabled();
    expect(screen.queryByTestId("compiled-prompt-text")).not.toBeInTheDocument();
  });

  it("falls back to the legacy layout when no plan-04 controls are provided", () => {
    render(
      <PromptCard
        state="analysis_ready"
        promptText="Restored full prompt snapshot"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("prompt-intent-controls"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("keep-change-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("compiled-prompt-text")).not.toBeInTheDocument();
    expect(screen.getByTestId("unified-prompt-editor")).toBeInTheDocument();
    expect(screen.getByTestId("fulltext-prompt-editor")).toBeInTheDocument();
  });

  it("passes the controlled editor mode and manual dirty callback down to the unified editor", async () => {
    const user = userEvent.setup();
    const onManualTextChange = vi.fn();
    const onEditorModeChange = vi.fn();

    render(
      <PromptCard
        state="history_restored"
        promptText="Restored full prompt snapshot"
        promptControlsState={{ ...controlsState, editorMode: "text" }}
        onIntentChange={vi.fn()}
        onDetailChange={vi.fn()}
        onEditorModeChange={onEditorModeChange}
        compiledPromptText="Restored full prompt snapshot"
        onManualTextChange={onManualTextChange}
      />,
    );

    expect(screen.getByTestId("prompt-intent-controls")).toHaveAttribute(
      "data-editor-mode",
      "text",
    );
    await user.type(screen.getByTestId("fulltext-prompt-editor"), "x");
    expect(onManualTextChange).toHaveBeenCalled();
  });

  it("exposes the keep-change locate action from the summary", async () => {
    const user = userEvent.setup();
    const onKeepChangeLocate = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Content: amber bottle; Color: warm amber and sand palette"
        recipe={v2Recipe}
        v2PromptState={v2State}
        onV2PromptStateChange={vi.fn()}
        onResolvedPromptChange={vi.fn()}
        promptControlsState={controlsState}
        onIntentChange={vi.fn()}
        onDetailChange={vi.fn()}
        onEditorModeChange={vi.fn()}
        compiledPromptText="Content: amber bottle; Color: warm amber and sand palette"
        keepChange={keepChangeState}
        onKeepChangeLocate={onKeepChangeLocate}
      />,
    );

    await user.click(screen.getByTestId("keep-change-item"));
    expect(onKeepChangeLocate).toHaveBeenCalledWith({
      kind: "keep",
      invariantId: "color_invariant_1",
    });
  });

  it("renders the L1 adjustment miss note next to the keep/change summary (plan-07)", () => {
    render(
      <PromptCard
        state="analysis_ready"
        promptText="A fully hand-written prompt without rule expressions."
        recipe={v2Recipe}
        v2PromptState={v2State}
        onV2PromptStateChange={vi.fn()}
        onResolvedPromptChange={vi.fn()}
        promptControlsState={controlsState}
        onIntentChange={vi.fn()}
        onDetailChange={vi.fn()}
        onEditorModeChange={vi.fn()}
        compiledPromptText="A fully hand-written prompt without rule expressions."
        keepChange={keepChangeState}
        onKeepChangeLocate={vi.fn()}
        adjustmentMissNote={{
          invariantId: "lighting_invariant_1",
          invariantValue: "soft directional window light",
        }}
      />,
    );

    const missNote = screen.getByTestId("prompt-adjustment-miss-note");
    expect(missNote).toBeVisible();
    expect(missNote).toHaveAttribute(
      "data-invariant-id",
      "lighting_invariant_1",
    );
    // 不静默、不声称已删除：说明未找到可删除表达且全文逐字保留
    expect(missNote).toHaveTextContent(/未找到可删除的表达/);
    expect(missNote).toHaveTextContent(/逐字保留/);
    expect(missNote).not.toHaveTextContent(/已删除/);
    // 说明位于「保留 / 改变」摘要邻近（同一内容列，摘要之后）
    const summary = screen.getByTestId("keep-change-summary");
    expect(
      summary.compareDocumentPosition(missNote) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not render the adjustment miss note when no miss is pending", () => {
    render(
      <PromptCard
        state="analysis_ready"
        promptText="Content: amber bottle"
        recipe={v2Recipe}
        v2PromptState={v2State}
        onV2PromptStateChange={vi.fn()}
        onResolvedPromptChange={vi.fn()}
        promptControlsState={controlsState}
        onIntentChange={vi.fn()}
        onDetailChange={vi.fn()}
        onEditorModeChange={vi.fn()}
        compiledPromptText="Content: amber bottle"
        keepChange={keepChangeState}
        onKeepChangeLocate={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("prompt-adjustment-miss-note"),
    ).not.toBeInTheDocument();
  });
});
