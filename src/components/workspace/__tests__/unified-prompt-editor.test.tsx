// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";

describe("UnifiedPromptEditor", () => {
  it("keeps the mode switcher and prompt content in one editor surface", () => {
    render(
      <UnifiedPromptEditor
        initialPromptText="initial prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    const editor = screen.getByTestId("unified-prompt-editor");
    expect(within(editor).getByLabelText("Prompt mode")).toBeInTheDocument();
    expect(
      within(editor).getByLabelText("Full Generation Prompt"),
    ).toBeInTheDocument();
    const textTitle = within(editor).getByText("Full generation prompt");
    expect(
      within(textTitle.parentElement!).getByLabelText("Prompt mode"),
    ).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText("Prompt mode"), {
      target: { value: "variables" },
    });
    const variablesTitle = within(editor).getByText("Variable-linked prompt");
    expect(
      within(variablesTitle.parentElement!).getByLabelText("Prompt mode"),
    ).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText("Prompt mode"), {
      target: { value: "json" },
    });
    const jsonTitle = within(editor).getByText("Prompt JSON");
    expect(
      within(jsonTitle.parentElement!.parentElement!).getByLabelText("Prompt mode"),
    ).toBeInTheDocument();
    expect(within(editor).queryByText("Prompt provenance")).not.toBeInTheDocument();
    expect(
      within(editor).queryByText("Variables stay linked across every view"),
    ).not.toBeInTheDocument();
  });

  it("renders text mode from the initial prompt", () => {
    render(
      <UnifiedPromptEditor
        initialPromptText="initial prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("initial prompt");
  });

  it("shows a success toast after copying JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <UnifiedPromptEditor
        initialPromptText="initial prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Prompt mode"), {
      target: { value: "json" },
    });
    const jsonOutput = screen.getByTestId("prompt-json-output");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));

    expect(writeText).toHaveBeenCalledWith(jsonOutput.textContent);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Copied successfully",
    );
  });

  it("renders template variables outside the template body and resolves them", async () => {
    const user = userEvent.setup();
    const onResolvedPromptChange = vi.fn();
    const onTemplateContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{subject}} in {{lighting}}."
        onResolvedPromptChange={onResolvedPromptChange}
        onTemplateContentChange={onTemplateContentChange}
      />,
    );

    expect(screen.getByLabelText("Prompt mode")).toHaveValue("variables");
    expect(screen.getByLabelText("Template Source")).toHaveValue(
      "Create {{subject}} in {{lighting}}.",
    );

    await user.type(screen.getByLabelText("Variable subject"), "glass chair");
    await user.type(screen.getByLabelText("Variable lighting"), "soft daylight");
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "Create glass chair in soft daylight.",
    );
    expect(onResolvedPromptChange).toHaveBeenLastCalledWith(
      "Create glass chair in soft daylight.",
    );
    expect(onTemplateContentChange).toHaveBeenCalledWith(
      "Create {{subject}} in {{lighting}}.",
    );
  });

  it("cycles highlight tones for newly added variables without evidence mappings", async () => {
    const user = userEvent.setup();

    render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox in a neon studio."
        initialTemplateContent="Create {{subject}} in {{custom_scene}} with {{camera_angle}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox" },
          { name: "custom_scene", defaultValue: "a neon studio" },
          { name: "camera_angle", defaultValue: "a low angle" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");

    const tones = [
      screen.getByTestId("prompt-variable-token-custom_scene").getAttribute("data-variable-tone"),
      screen.getByTestId("prompt-variable-token-camera_angle").getAttribute("data-variable-tone"),
    ];
    expect(tones[0]).toBeTruthy();
    expect(tones[1]).toBeTruthy();
    expect(tones[0]).not.toBe(tones[1]);
  });

  it("prefills template variables from analysis defaults and emits current variables", async () => {
    const user = userEvent.setup();
    const onTemplateVariablesChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox."
        initialTemplateContent="Create {{subject}} inside {{scene}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
          { name: "scene", defaultValue: "neon garden", label: "Scene", sourceField: "scene" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
        onTemplateVariablesChange={onTemplateVariablesChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    expect(screen.getByLabelText("Variable subject")).toHaveValue("glass fox");
    expect(screen.getByLabelText("Variable scene")).toHaveValue("neon garden");
    expect(onTemplateVariablesChange).toHaveBeenLastCalledWith([
      { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
      { name: "scene", defaultValue: "neon garden", label: "Scene", sourceField: "scene" },
    ]);
  });

  it("shows resolved prompt provenance and variables inside the editor body", async () => {
    const user = userEvent.setup();
    const lightingSpan: PromptProvenanceSpan = {
      facetId: "lighting",
      label: "Lighting",
      summary: "soft daylight",
      matchedText: "soft daylight",
      startIndex: null,
      endIndex: null,
      matchType: "exact",
    };

    render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox in soft daylight."
        initialTemplateContent="Create {{subject}} in {{lighting}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject" },
          { name: "lighting", defaultValue: "soft daylight", label: "Lighting" },
        ]}
        provenanceSpans={[lightingSpan]}
        selectedProvenanceSpan={lightingSpan}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("prompt-composition-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("resolved-prompt-provenance")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");
    const textPromptInput = screen.getByLabelText("Full Generation Prompt");
    const textEditor = screen.getByTestId("text-mode-highlight-editor");
    expect(textEditor).toContainElement(textPromptInput);
    expect(textEditor).toHaveClass("min-h-[20rem]");
    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "Create glass fox in soft daylight.",
    );
    expect(within(textEditor).getByTestId("prompt-variable-token-subject")).toHaveTextContent(
      "glass fox",
    );
    expect(within(textEditor).getByTestId("prompt-variable-token-lighting")).toHaveTextContent(
      "soft daylight",
    );
    const lightingProvenance = within(textEditor).getByTestId("prompt-provenance-span-lighting");
    expect(lightingProvenance).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(lightingProvenance).toHaveClass("prompt-highlight-provenance-marker");
    expect(lightingProvenance).not.toHaveClass("prompt-highlight-token");

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    const templateSourceInput = screen.getByLabelText("Template Source");
    const templateEditor = screen.getByTestId("template-mode-highlight-editor");
    expect(templateEditor).toContainElement(templateSourceInput);
    expect(within(templateEditor).getByTestId("prompt-variable-token-subject")).toHaveTextContent(
      "{{subject}}",
    );
    await user.clear(screen.getByLabelText("Variable subject"));
    await user.type(screen.getByLabelText("Variable subject"), "crystal fox");
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");

    await waitFor(() =>
      expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
        "Create crystal fox in soft daylight.",
      ),
    );
  });

  it("updates the linked variable when its resolved text is edited in text mode", async () => {
    const onTemplateVariablesChange = vi.fn();
    const onSaveContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox in soft daylight."
        initialTemplateContent="Create {{subject}} in {{lighting}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject" },
          { name: "lighting", defaultValue: "soft daylight", label: "Lighting" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
        onTemplateVariablesChange={onTemplateVariablesChange}
        onSaveContentChange={onSaveContentChange}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("Prompt mode"), "text");
    fireEvent.change(screen.getByLabelText("Full Generation Prompt"), {
      target: { value: "Create crystal heron in soft daylight." },
    });

    await waitFor(() =>
      expect(onTemplateVariablesChange).toHaveBeenLastCalledWith([
        { name: "subject", defaultValue: "crystal heron", label: "Subject" },
        { name: "lighting", defaultValue: "soft daylight", label: "Lighting" },
      ]),
    );
    expect(screen.getByTestId("prompt-variable-token-subject")).toHaveTextContent(
      "crystal heron",
    );
    expect(onSaveContentChange).toHaveBeenLastCalledWith(
      "Create {{subject}} in {{lighting}}.",
    );

    await userEvent.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    expect(screen.getByLabelText("Variable subject")).toHaveValue("crystal heron");
  });

  it("keeps the variable-linked editor at half of the viewport height", async () => {
    const user = userEvent.setup();

    render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox with soft daylight."
        compact
        initialTemplateContent="Create {{subject}} with {{lighting}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject" },
          { name: "lighting", defaultValue: "soft daylight", label: "Lighting" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");
    expect(screen.getByTestId("text-mode-highlight-editor")).toHaveClass(
      "h-1/2",
      "min-h-0",
    );
    expect(
      within(screen.getByTestId("text-mode-highlight-editor")).getByTestId(
        "prompt-variable-token-subject",
      ),
    ).toHaveTextContent("glass fox");

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    expect(screen.getByTestId("template-mode-highlight-editor")).toHaveClass(
      "h-[50dvh]",
      "min-h-[15rem]",
    );
  });

  it("resets touched text when a new analysis template arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox."
        initialTemplateContent="Create {{subject}}."
        initialTemplateVariables={[{ name: "subject", defaultValue: "glass fox" }]}
        templateStatus="ready"
        templateKey="analysis-1"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");
    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "manual draft");

    rerender(
      <UnifiedPromptEditor
        initialPromptText="Create crystal heron."
        initialTemplateContent="Create {{subject}}."
        initialTemplateVariables={[{ name: "subject", defaultValue: "crystal heron" }]}
        templateStatus="ready"
        templateKey="analysis-2"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");
    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("Create crystal heron.");
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    expect(screen.getByLabelText("Variable subject")).toHaveValue("crystal heron");
  });

  it("preserves manual text draft when switching back from template mode", async () => {
    const user = userEvent.setup();

    render(
      <UnifiedPromptEditor
        initialPromptText="first prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "manual draft");
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    await user.clear(screen.getByLabelText("Template Source"));
    await user.type(screen.getByLabelText("Template Source"), "Template {{subject}}");
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("manual draft");
  });

  it("renames template variables from the source without clearing their values", async () => {
    const user = userEvent.setup();

    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{subject}} in {{lighting}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
          { name: "lighting", defaultValue: "soft daylight", label: "Lighting", sourceField: "lighting_color" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    await user.clear(screen.getByLabelText("Variable subject"));
    await user.type(screen.getByLabelText("Variable subject"), "crystal heron");

    fireEvent.change(screen.getByLabelText("Template Source"), {
      target: { value: "Create {{hero_subject}} in {{lighting}}." },
    });

    expect(screen.queryByLabelText("Variable subject")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Variable hero_subject")).toHaveValue("crystal heron");
    expect(screen.getByText("hero_subject")).toBeInTheDocument();
    expect(screen.getByLabelText("Variable lighting")).toHaveValue("soft daylight");

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");
    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "Create crystal heron in soft daylight.",
    );
  });

  it("restores a variable value when a placeholder is briefly invalid during rename", async () => {
    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{subject}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText("Prompt mode"), "variables");

    fireEvent.change(screen.getByLabelText("Template Source"), {
      target: { value: "Create {{}}." },
    });
    expect(screen.queryByLabelText("Variable subject")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Template Source"), {
      target: { value: "Create {{product}}." },
    });

    expect(screen.getByLabelText("Variable product")).toHaveValue("glass fox");
    expect(screen.getByText("product")).toBeInTheDocument();
  });

  it("keeps template source as save content until the text draft is edited", async () => {
    const user = userEvent.setup();
    const onTemplateContentChange = vi.fn();
    const onSaveContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{var1}} with {{var2}}."
        onResolvedPromptChange={vi.fn()}
        onTemplateContentChange={onTemplateContentChange}
        onSaveContentChange={onSaveContentChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Prompt mode"), "variables");
    await user.type(screen.getByLabelText("Variable var1"), "glass chair");
    await user.type(screen.getByLabelText("Variable var2"), "rim light");
    await user.selectOptions(screen.getByLabelText("Prompt mode"), "text");

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "Create glass chair with rim light.",
    );
    expect(onTemplateContentChange).toHaveBeenLastCalledWith(
      "Create {{var1}} with {{var2}}.",
    );

    await waitFor(() =>
      expect(onSaveContentChange).toHaveBeenLastCalledWith(
        "Create {{var1}} with {{var2}}.",
      ),
    );
    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "Edited full prompt");
    await waitFor(() =>
      expect(onSaveContentChange).toHaveBeenLastCalledWith("Edited full prompt"),
    );
    expect(
      screen.queryByRole("button", { name: "Save as Template" }),
    ).not.toBeInTheDocument();
  });

  it("emits edited fallback text instead of stale template source", async () => {
    const onSaveContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText="Fallback full prompt"
        templateStatus="fallback"
        templateReason="No stable variables"
        onResolvedPromptChange={vi.fn()}
        onSaveContentChange={onSaveContentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Full Generation Prompt"), {
      target: { value: "Edited fallback prompt" },
    });

    await waitFor(() =>
      expect(onSaveContentChange).toHaveBeenLastCalledWith(
        "Edited fallback prompt",
      ),
    );
  });

  it("renders fallback text mode even if a stale template body is present", () => {
    render(
      <UnifiedPromptEditor
        initialPromptText="Fallback full prompt"
        initialTemplateContent="Create {{subject}}."
        templateStatus="fallback"
        templateReason="No stable variables"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("Fallback full prompt");
    expect(screen.queryByLabelText("Template Source")).not.toBeInTheDocument();
    expect(screen.getByText("No stable replaceable variables were detected this time.")).toBeVisible();
  });

  it("refreshes text draft when an external prompt replaces the current workspace context", () => {
    const onResolvedPromptChange = vi.fn();
    const { rerender } = render(
      <UnifiedPromptEditor
        initialPromptText="manual local prompt"
        onResolvedPromptChange={onResolvedPromptChange}
      />,
    );

    rerender(
      <UnifiedPromptEditor
        initialPromptText="history restored prompt"
        onResolvedPromptChange={onResolvedPromptChange}
      />,
    );

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "history restored prompt",
    );
  });
});
