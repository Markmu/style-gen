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
          label: "Negative Prompt",
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

    await user.click(screen.getByRole("button", { name: "Template Mode" }));
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
  });
});
