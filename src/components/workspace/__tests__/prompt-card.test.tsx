// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PromptCard } from "@/components/workspace/prompt-card";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";

const STYLE_MEMORY_SAVE_BUTTON = "Save as Style Memory";

const provenanceSpans: PromptProvenanceSpan[] = [
  {
    facetId: "lighting",
    label: "Lighting",
    summary: "Golden hour, warm backlight",
    matchedText: "Golden hour",
    startIndex: 0,
    endIndex: 11,
    matchType: "exact",
  },
  {
    facetId: "texture",
    label: "Texture",
    summary: "powdered terrazzo grain with pearlescent micro scratches",
    matchedText: null,
    startIndex: null,
    endIndex: null,
    matchType: "facet_only",
  },
];

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

  it("renders provenance spans, facet-only signals, variables, and the single save entry", () => {
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
        provenanceSpans={provenanceSpans}
        selectedFacetId="lighting"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: STYLE_MEMORY_SAVE_BUTTON })).toHaveLength(1);
    expect(screen.getByTestId("prompt-provenance-span-lighting")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("prompt-provenance-span-lighting")).toHaveAttribute(
      "data-match-type",
      "exact",
    );
    expect(screen.getByTestId("prompt-provenance-facet-only-texture")).toHaveTextContent(
      /related signal|相关信号/i,
    );
    expect(screen.getByLabelText("Variable negative_prompt")).toHaveValue("blurry");
    expect(screen.getByTestId("unified-prompt-selected-provenance")).toHaveTextContent(
      /Lighting/,
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
