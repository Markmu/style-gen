// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("defaults to Standard and keeps recipe facts isolated from variable edits", () => {
    render(<Harness />);

    expect(screen.getByRole("tab", { name: "Standard" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "red stool" } });
    expect(screen.getByText(/Content: red stool/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Reconstruction" }));
    expect(screen.getByText(/Content: A blue chair/)).toBeInTheDocument();
    expect(screen.queryByText(/Content: red stool/)).not.toBeInTheDocument();
  });

  it("keeps a custom draft across tier switches and disables structured output generation", () => {
    const onResolved = vi.fn();
    render(<Harness onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit as custom text" }));
    const custom = screen.getByLabelText("Custom prompt");
    fireEvent.change(custom, { target: { value: "hand tuned prompt" } });
    fireEvent.click(screen.getByRole("tab", { name: "Concise" }));
    fireEvent.click(screen.getByRole("tab", { name: "Custom" }));
    expect(screen.getByLabelText("Custom prompt")).toHaveValue("hand tuned prompt");

    fireEvent.click(screen.getByRole("tab", { name: "Structured" }));
    expect(screen.getByText(/cannot be sent to generation/i)).toBeInTheDocument();
    expect(onResolved).toHaveBeenLastCalledWith("");
  });

  it("replaces the color dimension only while its modifier is enabled", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Override Primary color" }));
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "signal red" } });
    expect(screen.getByText(/Color: signal red/)).toBeInTheDocument();
    expect(screen.queryByText(/Color: cobalt blue palette/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Override Primary color" }));
    expect(screen.getByText(/Color: cobalt blue palette/)).toBeInTheDocument();
  });
});
