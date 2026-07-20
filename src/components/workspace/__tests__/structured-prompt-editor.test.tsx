// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { StructuredPromptEditor } from "@/components/workspace/structured-prompt-editor";
import type { V2PromptWorkspaceState, VisualRecipeV2Success } from "@/types/models";

const recipe: VisualRecipeV2Success = {
  schemaVersion: 2,
  extractionStatus: "partial",
  extractionReasons: [],
  contentDescription: {
    summary: "A blue chair",
    subject: "blue chair",
    subjectAttributes: [],
    supportingElements: [],
  },
  styleProfile: {
    visualMedium: [{ id: "visual_medium_1", value: "editorial photography", evidence: ["Natural lens rendering"], confidence: 0.9 }],
    composition: [{ id: "composition_1", value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9 }],
    camera: [], color: [{ id: "color_1", value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9 }],
    lighting: [], formLanguage: [], materialTexture: [], atmosphere: [], rendering: [],
  },
  styleInvariants: [
    { id: "composition_invariant_1", kind: "hard", dimension: "composition", value: "centered composition", evidence: ["Chair is centered"], confidence: 0.9, sourceObservationIds: ["composition_1"] },
    { id: "color_invariant_1", kind: "hard", dimension: "color", value: "cobalt blue palette", evidence: ["Blue dominates"], confidence: 0.9, sourceObservationIds: ["color_1"] },
  ],
  contentVariables: [{ name: "subject", label: "Subject", defaultValue: "blue chair", sourceField: "subject" }],
  optionalModifiers: [{ name: "primary_color", label: "Primary color", defaultValue: "blue", dimension: "color", enabledByDefault: false }],
  negativeConstraints: ["watermark"],
  styleFingerprint: { tokens: ["editorial"], scores: { realism: null, abstraction: null, contrast: null, saturation: null, softness: null, detailDensity: null, symmetry: null, depth: null, atmosphericIntensity: null } },
  promptOutputs: {
    reconstructionPrompt: "Content: A blue chair; Color: cobalt blue palette",
    conciseTemplate: "Content: {{subject}}; Color: cobalt blue palette",
    standardTemplate: "Content: {{subject}}; Color: cobalt blue palette",
    professionalTemplate: "Content: {{subject}}; Color: cobalt blue palette",
  },
};

const initialState: V2PromptWorkspaceState = {
  outputMode: "standard",
  enabledInvariantIds: recipe.styleInvariants.map((item) => item.id),
  variableValues: { subject: "blue chair" },
  enabledModifierNames: [],
  modifierValues: { primary_color: "blue" },
  customPrompt: "",
};

function Harness({ onResolved = vi.fn() }: { onResolved?: (value: string) => void }) {
  const [state, setState] = useState(initialState);
  return (
    <div className="h-[50rem]">
      <StructuredPromptEditor
        recipe={recipe}
        state={state}
        negativePromptText="watermark"
        onStateChange={(update) => setState((current) => update(current))}
        onResolvedPromptChange={onResolved}
      />
    </div>
  );
}

describe("StructuredPromptEditor", () => {
  it("keeps the mode switcher, prompt, variables, and constraints in one editor surface", () => {
    render(<Harness />);

    const editor = screen.getByTestId("structured-prompt-editor");
    expect(within(editor).getByLabelText("Prompt mode")).toBeInTheDocument();
    expect(
      within(editor).getByLabelText("Variable-linked prompt preview"),
    ).toBeInTheDocument();
    expect(within(editor).getByLabelText("Subject")).toBeInTheDocument();
    expect(
      within(editor).getByLabelText("Negative constraints"),
    ).toHaveAttribute("rows", "2");
    const variableScroll = within(editor).getByTestId(
      "structured-variable-scroll",
    );
    expect(variableScroll).toHaveClass("overflow-y-auto");
    expect(within(variableScroll).getByLabelText("Subject")).toBeInTheDocument();
    expect(
      within(variableScroll).getByLabelText("Negative constraints"),
    ).toBeInTheDocument();
    const variablesTitle = within(editor).getByText("Variable-linked prompt");
    expect(
      within(variablesTitle.parentElement!).getByLabelText("Prompt mode"),
    ).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText("Prompt mode"), {
      target: { value: "text" },
    });
    const textTitle = within(editor).getByText("Full generation prompt");
    expect(
      within(textTitle.parentElement!).getByLabelText("Prompt mode"),
    ).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText("Prompt mode"), {
      target: { value: "json" },
    });
    const jsonTitle = within(editor).getByText("Recipe JSON");
    expect(
      within(jsonTitle.parentElement!).getByLabelText("Prompt mode"),
    ).toBeInTheDocument();
    expect(within(editor).queryByText("Prompt provenance")).not.toBeInTheDocument();
    expect(
      within(editor).queryByText("Variables stay linked across every view"),
    ).not.toBeInTheDocument();
  });

  it("defaults to Variables and resolves edits through the linked prompt", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    expect(screen.getByLabelText("Prompt mode")).toHaveValue("variables");
    expect(
      screen.getByTestId("structured-variable-prompt").parentElement,
    ).toHaveClass("h-[50dvh]", "min-h-[15rem]");
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "red stool" } });
    expect(
      (screen.getByLabelText(
        "Variable-linked prompt preview",
      ) as HTMLTextAreaElement).value,
    ).toContain("Content: red stool");
    expect(onResolved).toHaveBeenLastCalledWith(
      expect.stringContaining("Content: red stool"),
    );

    const linkedPrompt = screen.getByLabelText(
      "Variable-linked prompt preview",
    ) as HTMLTextAreaElement;
    fireEvent.change(linkedPrompt, {
      target: { value: linkedPrompt.value.replace("red stool", "green bench") },
    });
    expect(screen.getByLabelText("Subject")).toHaveValue("green bench");

    fireEvent.change(screen.getByLabelText("Variable-linked prompt preview"), {
      target: { value: "Illustrate green bench with editorial restraint" },
    });
    expect(screen.getByLabelText("Variable-linked prompt preview")).toHaveValue(
      "Illustrate green bench with editorial restraint",
    );
    expect(onResolved).toHaveBeenLastCalledWith(
      "Illustrate green bench with editorial restraint",
    );

    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "ivory sofa" },
    });
    expect(screen.getByLabelText("Variable-linked prompt preview")).toHaveValue(
      "Illustrate ivory sofa with editorial restraint",
    );
  });

  it("keeps a full-text draft isolated while description JSON is inspected", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    fireEvent.change(screen.getByLabelText("Prompt mode"), {
      target: { value: "text" },
    });
    const custom = screen.getByLabelText("Full Generation Prompt");
    fireEvent.change(custom, { target: { value: "hand tuned prompt" } });
    fireEvent.change(screen.getByLabelText("Prompt mode"), {
      target: { value: "json" },
    });
    const jsonOutput = screen.getByTestId("structured-json-output");
    expect(JSON.parse(jsonOutput.textContent ?? "")).toEqual({
      contentDescription: {
        summary: "A blue chair",
        subject: "blue chair",
      },
      styleProfile: {
        visualMedium: ["editorial photography"],
        composition: ["centered composition"],
        color: ["cobalt blue palette"],
      },
      negativeConstraints: ["watermark"],
    });
    expect(jsonOutput).not.toHaveTextContent("hand tuned prompt");
    expect(jsonOutput).not.toHaveTextContent("confidence");
    expect(jsonOutput).not.toHaveTextContent("workspace");
    expect(onResolved).toHaveBeenLastCalledWith("hand tuned prompt");

    fireEvent.change(screen.getByLabelText("Prompt mode"), {
      target: { value: "text" },
    });
    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "hand tuned prompt",
    );
  });

  it("shows a success toast after copying JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Prompt mode"), {
      target: { value: "json" },
    });
    const jsonOutput = screen.getByTestId("structured-json-output");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(jsonOutput.textContent);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Copied successfully",
    );
  });

  it("replaces the color dimension only while its modifier is enabled", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Override Primary color" }));
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "signal red" } });
    expect(
      (screen.getByLabelText("Variable-linked prompt preview") as HTMLTextAreaElement)
        .value,
    ).toContain("Color: signal red");
    expect(onResolved).toHaveBeenLastCalledWith(
      expect.stringContaining("Color: signal red"),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Override Primary color" }));
    expect(
      (screen.getByLabelText("Variable-linked prompt preview") as HTMLTextAreaElement)
        .value,
    ).toContain("Color: cobalt blue palette");
  });
});
